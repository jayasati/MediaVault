// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RoleManager
 * @notice On-chain role-based access control for MediVault.
 *
 * ROLE HIERARCHY:
 *   SUPER_ADMIN (deployer)        - global, hospitalId = 0
 *   ADMIN (hospital head)         - tied to one hospital, can approve doctors/researchers in same hospital
 *   DOCTOR / RESEARCHER           - apply to a specific hospital, approved by that hospital's admin
 *   PATIENT                       - self-registration, no hospital
 *
 * SECURITY FEATURES:
 *   1. Application cooldown — rejected applicants must wait APPLICATION_COOLDOWN before re-applying
 *   2. Application expiry  — pending applications auto-expire after APPLICATION_TTL
 *   3. Hospital scoping    — admins can only approve applications targeting their own hospital
 */
contract RoleManager is ReentrancyGuard {
    enum Role { NONE, PATIENT, DOCTOR, RESEARCHER, ADMIN, SUPER_ADMIN }
    enum ApplicationStatus { PENDING, APPROVED, REJECTED }

    uint256 public constant APPLICATION_COOLDOWN = 7 days;
    uint256 public constant APPLICATION_TTL = 14 days;

    struct UserRole {
        address wallet;
        Role role;
        bool isActive;
        uint256 registeredAt;
        address approvedBy;
        bytes32 hospitalId; // 0 for super admin / patients
    }

    struct Application {
        uint256 applicationId;
        address applicant;
        Role requestedRole;
        bytes32 hospitalId;
        string name;
        string specialization;
        string credentials;
        ApplicationStatus status;
        uint256 appliedAt;
        uint256 respondedAt;
        address respondedBy;
        string rejectionReason;
    }

    address public superAdmin;
    uint256 private _applicationIdCounter;

    mapping(address => UserRole) private users;
    mapping(uint256 => Application) private applications;
    mapping(address => uint256) private latestApplication;
    uint256[] private allApplicationIds;

    event PatientRegistered(address indexed wallet);
    event AdminAdded(address indexed wallet, bytes32 indexed hospitalId, address indexed addedBy);
    event AdminRemoved(address indexed wallet, address indexed removedBy);
    event ApplicationSubmitted(uint256 indexed applicationId, address indexed applicant, Role requestedRole, bytes32 hospitalId);
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
            approvedBy: msg.sender,
            hospitalId: bytes32(0)
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
            approvedBy: address(0),
            hospitalId: bytes32(0)
        });
        emit PatientRegistered(msg.sender);
    }

    // ── Super admin: manage admins ──

    function addAdmin(address wallet, bytes32 hospitalId) external onlySuperAdmin {
        require(wallet != address(0), "Invalid address");
        require(hospitalId != bytes32(0), "Hospital ID required");
        require(
            users[wallet].role == Role.NONE || users[wallet].role == Role.PATIENT,
            "Already has a role"
        );
        users[wallet] = UserRole({
            wallet: wallet,
            role: Role.ADMIN,
            isActive: true,
            registeredAt: block.timestamp,
            approvedBy: msg.sender,
            hospitalId: hospitalId
        });
        emit AdminAdded(wallet, hospitalId, msg.sender);
    }

    function removeAdmin(address wallet) external onlySuperAdmin {
        require(users[wallet].role == Role.ADMIN, "Not an admin");
        users[wallet].role = Role.NONE;
        users[wallet].isActive = false;
        users[wallet].hospitalId = bytes32(0);
        emit AdminRemoved(wallet, msg.sender);
    }

    // ── Doctor / Researcher: apply then admin approves ──

    function applyForRole(
        Role requestedRole,
        bytes32 hospitalId,
        string calldata name,
        string calldata specialization,
        string calldata credentials
    ) external {
        require(
            requestedRole == Role.DOCTOR || requestedRole == Role.RESEARCHER,
            "Can only apply for Doctor or Researcher"
        );
        require(hospitalId != bytes32(0), "Hospital ID required");
        require(
            users[msg.sender].role == Role.NONE || users[msg.sender].role == Role.PATIENT,
            "Already has a privileged role"
        );
        require(bytes(name).length > 0, "Name required");
        require(bytes(credentials).length > 0, "Credentials required");

        // Cooldown check on prior application
        uint256 existingId = latestApplication[msg.sender];
        if (existingId != 0) {
            Application storage prev = applications[existingId];

            // No new app while one is still pending and not expired
            if (prev.status == ApplicationStatus.PENDING) {
                require(
                    block.timestamp > prev.appliedAt + APPLICATION_TTL,
                    "Pending application already exists"
                );
                // expired pending — implicitly allow re-application
            } else if (prev.status == ApplicationStatus.REJECTED) {
                require(
                    block.timestamp >= prev.respondedAt + APPLICATION_COOLDOWN,
                    "Cooldown active - try again later"
                );
            }
            // APPROVED case is already blocked by the role check above
        }

        _applicationIdCounter++;
        uint256 newId = _applicationIdCounter;

        applications[newId] = Application({
            applicationId: newId,
            applicant: msg.sender,
            requestedRole: requestedRole,
            hospitalId: hospitalId,
            name: name,
            specialization: specialization,
            credentials: credentials,
            status: ApplicationStatus.PENDING,
            appliedAt: block.timestamp,
            respondedAt: 0,
            respondedBy: address(0),
            rejectionReason: ""
        });

        latestApplication[msg.sender] = newId;
        allApplicationIds.push(newId);

        emit ApplicationSubmitted(newId, msg.sender, requestedRole, hospitalId);
    }

    function approveApplication(uint256 applicationId) external onlyAdmin {
        Application storage app = applications[applicationId];
        require(app.applicationId != 0, "Application does not exist");
        require(app.status == ApplicationStatus.PENDING, "Not pending");

        // Expiry check — admins cannot approve stale applications
        require(
            block.timestamp <= app.appliedAt + APPLICATION_TTL,
            "Application expired"
        );

        // Hospital scoping — non-super admins can only approve their own hospital's applications
        if (msg.sender != superAdmin) {
            require(
                users[msg.sender].hospitalId == app.hospitalId,
                "Different hospital - cannot approve"
            );
        }

        app.status = ApplicationStatus.APPROVED;
        app.respondedAt = block.timestamp;
        app.respondedBy = msg.sender;

        users[app.applicant] = UserRole({
            wallet: app.applicant,
            role: app.requestedRole,
            isActive: true,
            registeredAt: block.timestamp,
            approvedBy: msg.sender,
            hospitalId: app.hospitalId
        });

        emit ApplicationApproved(applicationId, app.applicant, app.requestedRole, msg.sender);
    }

    function rejectApplication(uint256 applicationId, string calldata reason) external onlyAdmin {
        Application storage app = applications[applicationId];
        require(app.applicationId != 0, "Application does not exist");
        require(app.status == ApplicationStatus.PENDING, "Not pending");

        // Hospital scoping
        if (msg.sender != superAdmin) {
            require(
                users[msg.sender].hospitalId == app.hospitalId,
                "Different hospital - cannot reject"
            );
        }

        app.status = ApplicationStatus.REJECTED;
        app.respondedAt = block.timestamp;
        app.respondedBy = msg.sender;
        app.rejectionReason = reason;

        emit ApplicationRejected(applicationId, app.applicant, msg.sender);
    }

    // ── Revoke role ──

    function revokeRole(address wallet) external onlyAdmin {
        require(wallet != superAdmin, "Cannot revoke super admin");
        Role prev = users[wallet].role;
        require(prev != Role.NONE, "No role to revoke");

        if (prev == Role.ADMIN) {
            require(msg.sender == superAdmin, "Only super admin can revoke admins");
        } else if (prev == Role.DOCTOR || prev == Role.RESEARCHER) {
            // Hospital scoping for revocation
            if (msg.sender != superAdmin) {
                require(
                    users[msg.sender].hospitalId == users[wallet].hospitalId,
                    "Different hospital - cannot revoke"
                );
            }
        }

        users[wallet].role = Role.NONE;
        users[wallet].isActive = false;
        users[wallet].hospitalId = bytes32(0);
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

    function isApplicationExpired(uint256 applicationId) external view returns (bool) {
        Application storage app = applications[applicationId];
        if (app.applicationId == 0 || app.status != ApplicationStatus.PENDING) return false;
        return block.timestamp > app.appliedAt + APPLICATION_TTL;
    }

    /// @notice Pending applications, optionally filtered by hospital. Pass bytes32(0) for all.
    function getPendingApplications() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < allApplicationIds.length; i++) {
            Application storage app = applications[allApplicationIds[i]];
            if (app.status == ApplicationStatus.PENDING && block.timestamp <= app.appliedAt + APPLICATION_TTL) {
                count++;
            }
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allApplicationIds.length; i++) {
            Application storage app = applications[allApplicationIds[i]];
            if (app.status == ApplicationStatus.PENDING && block.timestamp <= app.appliedAt + APPLICATION_TTL) {
                result[idx] = allApplicationIds[i];
                idx++;
            }
        }
        return result;
    }

    /// @notice Pending applications for a specific hospital (excluding expired)
    function getPendingApplicationsForHospital(bytes32 hospitalId) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < allApplicationIds.length; i++) {
            Application storage app = applications[allApplicationIds[i]];
            if (
                app.status == ApplicationStatus.PENDING
                && app.hospitalId == hospitalId
                && block.timestamp <= app.appliedAt + APPLICATION_TTL
            ) {
                count++;
            }
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allApplicationIds.length; i++) {
            Application storage app = applications[allApplicationIds[i]];
            if (
                app.status == ApplicationStatus.PENDING
                && app.hospitalId == hospitalId
                && block.timestamp <= app.appliedAt + APPLICATION_TTL
            ) {
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
