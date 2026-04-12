// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RoleManager
 * @notice On-chain role-based access control for MediVault.
 *
 * ROLE HIERARCHY:
 *   SUPER_ADMIN (deployer) → can add ADMINs
 *   ADMIN → can approve DOCTORs and RESEARCHERs
 *   DOCTOR / RESEARCHER → must apply and be approved by an ADMIN
 *   PATIENT → self-registration (anyone)
 *
 * Applications are stored on-chain. Only admins can approve/reject.
 */
contract RoleManager is ReentrancyGuard {
    enum Role { NONE, PATIENT, DOCTOR, RESEARCHER, ADMIN, SUPER_ADMIN }
    enum ApplicationStatus { PENDING, APPROVED, REJECTED }

    struct UserRole {
        address wallet;
        Role role;
        bool isActive;
        uint256 registeredAt;
        address approvedBy;
    }

    struct Application {
        uint256 applicationId;
        address applicant;
        Role requestedRole;
        string name;
        string specialization;  // for doctors
        string credentials;     // license number, institution, etc.
        ApplicationStatus status;
        uint256 appliedAt;
        uint256 respondedAt;
        address respondedBy;
    }

    address public superAdmin;
    uint256 private _applicationIdCounter;

    mapping(address => UserRole) private users;
    mapping(uint256 => Application) private applications;
    mapping(address => uint256) private latestApplication; // wallet → applicationId
    uint256[] private allApplicationIds;

    event PatientRegistered(address indexed wallet);
    event AdminAdded(address indexed wallet, address indexed addedBy);
    event AdminRemoved(address indexed wallet, address indexed removedBy);
    event ApplicationSubmitted(uint256 indexed applicationId, address indexed applicant, Role requestedRole);
    event ApplicationApproved(uint256 indexed applicationId, address indexed applicant, Role role, address indexed approvedBy);
    event ApplicationRejected(uint256 indexed applicationId, address indexed applicant, address indexed rejectedBy);
    event RoleRevoked(address indexed wallet, Role previousRole, address indexed revokedBy);

    modifier onlySuperAdmin() {
        require(msg.sender == superAdmin, "Only super admin");
        _;
    }

    modifier onlyAdmin() {
        require(
            users[msg.sender].role == Role.ADMIN || msg.sender == superAdmin,
            "Only admin or super admin"
        );
        _;
    }

    constructor() {
        superAdmin = msg.sender;
        users[msg.sender] = UserRole({
            wallet: msg.sender,
            role: Role.SUPER_ADMIN,
            isActive: true,
            registeredAt: block.timestamp,
            approvedBy: msg.sender
        });
    }

    // ── Patient: self-registration ──

    function registerAsPatient() external {
        require(users[msg.sender].role == Role.NONE, "Already registered");
        users[msg.sender] = UserRole({
            wallet: msg.sender,
            role: Role.PATIENT,
            isActive: true,
            registeredAt: block.timestamp,
            approvedBy: address(0)
        });
        emit PatientRegistered(msg.sender);
    }

    // ── Super admin: manage admins ──

    function addAdmin(address wallet) external onlySuperAdmin {
        require(wallet != address(0), "Invalid address");
        require(users[wallet].role == Role.NONE || users[wallet].role == Role.PATIENT, "Already has a role");
        users[wallet] = UserRole({
            wallet: wallet,
            role: Role.ADMIN,
            isActive: true,
            registeredAt: block.timestamp,
            approvedBy: msg.sender
        });
        emit AdminAdded(wallet, msg.sender);
    }

    function removeAdmin(address wallet) external onlySuperAdmin {
        require(users[wallet].role == Role.ADMIN, "Not an admin");
        users[wallet].role = Role.NONE;
        users[wallet].isActive = false;
        emit AdminRemoved(wallet, msg.sender);
    }

    // ── Doctor / Researcher: apply then admin approves ──

    function applyForRole(
        Role requestedRole,
        string calldata name,
        string calldata specialization,
        string calldata credentials
    ) external {
        require(
            requestedRole == Role.DOCTOR || requestedRole == Role.RESEARCHER,
            "Can only apply for Doctor or Researcher"
        );
        require(
            users[msg.sender].role == Role.NONE || users[msg.sender].role == Role.PATIENT,
            "Already has a privileged role"
        );
        require(bytes(name).length > 0, "Name required");
        require(bytes(credentials).length > 0, "Credentials required");

        // Check no pending application exists
        uint256 existingId = latestApplication[msg.sender];
        if (existingId != 0) {
            require(
                applications[existingId].status != ApplicationStatus.PENDING,
                "Pending application already exists"
            );
        }

        _applicationIdCounter++;
        uint256 newId = _applicationIdCounter;

        applications[newId] = Application({
            applicationId: newId,
            applicant: msg.sender,
            requestedRole: requestedRole,
            name: name,
            specialization: specialization,
            credentials: credentials,
            status: ApplicationStatus.PENDING,
            appliedAt: block.timestamp,
            respondedAt: 0,
            respondedBy: address(0)
        });

        latestApplication[msg.sender] = newId;
        allApplicationIds.push(newId);

        emit ApplicationSubmitted(newId, msg.sender, requestedRole);
    }

    function approveApplication(uint256 applicationId) external onlyAdmin {
        Application storage app = applications[applicationId];
        require(app.applicationId != 0, "Application does not exist");
        require(app.status == ApplicationStatus.PENDING, "Not pending");

        app.status = ApplicationStatus.APPROVED;
        app.respondedAt = block.timestamp;
        app.respondedBy = msg.sender;

        users[app.applicant] = UserRole({
            wallet: app.applicant,
            role: app.requestedRole,
            isActive: true,
            registeredAt: block.timestamp,
            approvedBy: msg.sender
        });

        emit ApplicationApproved(applicationId, app.applicant, app.requestedRole, msg.sender);
    }

    function rejectApplication(uint256 applicationId) external onlyAdmin {
        Application storage app = applications[applicationId];
        require(app.applicationId != 0, "Application does not exist");
        require(app.status == ApplicationStatus.PENDING, "Not pending");

        app.status = ApplicationStatus.REJECTED;
        app.respondedAt = block.timestamp;
        app.respondedBy = msg.sender;

        emit ApplicationRejected(applicationId, app.applicant, msg.sender);
    }

    // ── Revoke any role (admin+ only) ──

    function revokeRole(address wallet) external onlyAdmin {
        require(wallet != superAdmin, "Cannot revoke super admin");
        Role prev = users[wallet].role;
        require(prev != Role.NONE, "No role to revoke");
        // Admins cannot revoke other admins — only super admin can
        if (prev == Role.ADMIN) {
            require(msg.sender == superAdmin, "Only super admin can revoke admins");
        }
        users[wallet].role = Role.NONE;
        users[wallet].isActive = false;
        emit RoleRevoked(wallet, prev, msg.sender);
    }

    // ── Views ──

    function getRole(address wallet) external view returns (Role) {
        return users[wallet].role;
    }

    function getUserDetails(address wallet) external view returns (UserRole memory) {
        return users[wallet];
    }

    function getApplication(uint256 applicationId) external view returns (Application memory) {
        return applications[applicationId];
    }

    function getMyApplication(address wallet) external view returns (Application memory) {
        uint256 id = latestApplication[wallet];
        return applications[id];
    }

    function getPendingApplications() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < allApplicationIds.length; i++) {
            if (applications[allApplicationIds[i]].status == ApplicationStatus.PENDING) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allApplicationIds.length; i++) {
            if (applications[allApplicationIds[i]].status == ApplicationStatus.PENDING) {
                result[idx] = allApplicationIds[i];
                idx++;
            }
        }
        return result;
    }

    function isAdmin(address wallet) external view returns (bool) {
        return users[wallet].role == Role.ADMIN || wallet == superAdmin;
    }

    function isDoctor(address wallet) external view returns (bool) {
        return users[wallet].role == Role.DOCTOR;
    }

    function isResearcher(address wallet) external view returns (bool) {
        return users[wallet].role == Role.RESEARCHER;
    }

    function isPatient(address wallet) external view returns (bool) {
        return users[wallet].role == Role.PATIENT;
    }
}
