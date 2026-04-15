// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PatientRegistry.sol";
import "./RoleManager.sol";

contract EmergencyAccess is ReentrancyGuard {
    PatientRegistry public patientRegistry;
    RoleManager public roleManager;

    modifier onlyDoctor() {
        require(
            roleManager.getRole(msg.sender) == RoleManager.Role.DOCTOR,
            "Only registered doctors can break glass"
        );
        _;
    }

    struct EmergencyAccessRecord {
        uint256 accessId;
        address responderAddress;
        uint256 patientId;
        uint256 accessedAt;
        string location;
        string reason;
        bool wasNotified;
    }

    uint256 private _accessIdCounter;

    mapping(uint256 => EmergencyAccessRecord) private accessRecords;
    mapping(address => uint256[]) private patientAccessLogs; // patientWallet → accessIds
    mapping(address => uint256[]) private responderAccessLogs; // responder → accessIds

    event EmergencyAccessGranted(
        uint256 indexed accessId,
        address indexed responder,
        uint256 indexed patientId,
        string reason
    );
    event PatientNotified(uint256 indexed accessId, address indexed patient);

    constructor(address _patientRegistry, address _roleManager) {
        patientRegistry = PatientRegistry(_patientRegistry);
        roleManager = RoleManager(_roleManager);
    }

    function emergencyAccess(
        uint256 patientId,
        string calldata reason,
        string calldata location
    ) external onlyDoctor nonReentrant returns (string memory emergencyIPFSHash, string memory bloodType) {
        require(bytes(reason).length > 0, "Reason is required");

        // Fetch patient — must exist and be active
        PatientRegistry.Patient memory patient = patientRegistry.getPatientById(patientId);
        require(patient.walletAddress != address(0), "Patient not found");
        require(patient.isActive, "Patient is not active");

        _accessIdCounter++;
        uint256 newId = _accessIdCounter;

        accessRecords[newId] = EmergencyAccessRecord({
            accessId: newId,
            responderAddress: msg.sender,
            patientId: patientId,
            accessedAt: block.timestamp,
            location: location,
            reason: reason,
            wasNotified: false
        });

        patientAccessLogs[patient.walletAddress].push(newId);
        responderAccessLogs[msg.sender].push(newId);

        emit EmergencyAccessGranted(newId, msg.sender, patientId, reason);

        return (patient.emergencyIPFSHash, patient.bloodType);
    }

    function getEmergencyProfile(uint256 patientId) external view returns (
        string memory emergencyIPFSHash,
        string memory bloodType,
        bool isEmergencyDonor,
        bool isActive
    ) {
        PatientRegistry.Patient memory patient = patientRegistry.getPatientById(patientId);
        return (patient.emergencyIPFSHash, patient.bloodType, patient.isEmergencyDonor, patient.isActive);
    }

    function getEmergencyAccessLog(address patientAddress) external view returns (uint256[] memory) {
        return patientAccessLogs[patientAddress];
    }

    function getAccessRecord(uint256 accessId) external view returns (EmergencyAccessRecord memory) {
        return accessRecords[accessId];
    }

    function markNotified(uint256 accessId) external {
        EmergencyAccessRecord storage record = accessRecords[accessId];
        require(record.accessId != 0, "Access record does not exist");

        // Only the patient who was accessed can acknowledge
        PatientRegistry.Patient memory patient = patientRegistry.getPatientById(record.patientId);
        require(msg.sender == patient.walletAddress, "Only the patient can acknowledge");
        require(!record.wasNotified, "Already acknowledged");

        record.wasNotified = true;
        emit PatientNotified(accessId, msg.sender);
    }

    function getResponderAccessLog(address responder) external view returns (uint256[] memory) {
        return responderAccessLogs[responder];
    }
}
