// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract PatientRegistry is Ownable, ReentrancyGuard {
    struct Patient {
        uint256 patientId;
        address walletAddress;
        string nameHash;
        string emergencyIPFSHash;
        string bloodType;
        string allergiesHash;
        uint256 registeredAt;
        bool isActive;
        bool isEmergencyDonor;
        address emergencyVerifiedBy;
        uint256 emergencyVerifiedAt;
    }

    uint256 private _patientIdCounter;

    mapping(address => Patient) private patientsByWallet;
    mapping(uint256 => address) private patientIdToAddress;

    event PatientRegistered(uint256 indexed patientId, address indexed wallet);
    event EmergencyProfileUpdated(uint256 indexed patientId, string ipfsHash);
    event EmergencyProfileVerified(uint256 indexed patientId, address indexed verifiedBy);
    event OrganDonorStatusChanged(uint256 indexed patientId, bool isDonor);
    event PatientDeactivated(uint256 indexed patientId);

    modifier onlyRegisteredPatient() {
        require(patientsByWallet[msg.sender].isActive, "Not a registered active patient");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function registerPatient(
        string calldata name,
        string calldata bloodType,
        string calldata allergies,
        string calldata emergencyIPFSHash
    ) external nonReentrant {
        require(patientsByWallet[msg.sender].walletAddress == address(0), "Already registered");

        _patientIdCounter++;
        uint256 newId = _patientIdCounter;

        patientsByWallet[msg.sender] = Patient({
            patientId: newId,
            walletAddress: msg.sender,
            nameHash: name,
            emergencyIPFSHash: emergencyIPFSHash,
            bloodType: bloodType,
            allergiesHash: allergies,
            registeredAt: block.timestamp,
            isActive: true,
            isEmergencyDonor: false,
            emergencyVerifiedBy: address(0),
            emergencyVerifiedAt: 0
        });

        patientIdToAddress[newId] = msg.sender;

        emit PatientRegistered(newId, msg.sender);
    }

    function updateEmergencyProfile(string calldata emergencyIPFSHash) external onlyRegisteredPatient {
        Patient storage p = patientsByWallet[msg.sender];
        p.emergencyIPFSHash = emergencyIPFSHash;
        // Reset verification on edit — patient-reported changes are unverified until re-confirmed
        p.emergencyVerifiedBy = address(0);
        p.emergencyVerifiedAt = 0;
        emit EmergencyProfileUpdated(p.patientId, emergencyIPFSHash);
    }

    /// @notice A doctor can mark a patient's emergency profile as verified
    function verifyEmergencyProfile(address patientWallet) external {
        Patient storage p = patientsByWallet[patientWallet];
        require(p.walletAddress != address(0), "Patient not registered");
        require(p.isActive, "Patient not active");
        p.emergencyVerifiedBy = msg.sender;
        p.emergencyVerifiedAt = block.timestamp;
        emit EmergencyProfileVerified(p.patientId, msg.sender);
    }

    function toggleOrganDonor() external onlyRegisteredPatient {
        Patient storage p = patientsByWallet[msg.sender];
        p.isEmergencyDonor = !p.isEmergencyDonor;
        emit OrganDonorStatusChanged(p.patientId, p.isEmergencyDonor);
    }

    function getPatientByWallet(address wallet) external view returns (Patient memory) {
        return patientsByWallet[wallet];
    }

    function getPatientById(uint256 patientId) external view returns (Patient memory) {
        address wallet = patientIdToAddress[patientId];
        return patientsByWallet[wallet];
    }

    function deactivatePatient() external onlyRegisteredPatient {
        Patient storage p = patientsByWallet[msg.sender];
        p.isActive = false;
        emit PatientDeactivated(p.patientId);
    }
}
