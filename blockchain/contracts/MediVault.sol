// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract MediVault is AccessControl {
    bytes32 public constant DOCTOR_ROLE = keccak256("DOCTOR_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct Patient {
        uint256 id;
        string dataHash; // IPFS hash of encrypted patient data
        address owner;
        uint256 createdAt;
        uint256 updatedAt;
    }

    uint256 private _patientIdCounter;
    mapping(uint256 => Patient) public patients;
    mapping(address => uint256[]) public patientRecords;
    mapping(uint256 => mapping(address => bool)) public accessGranted;

    event PatientRegistered(uint256 indexed patientId, address indexed owner);
    event RecordUpdated(uint256 indexed patientId, string newDataHash);
    event AccessGranted(uint256 indexed patientId, address indexed doctor);
    event AccessRevoked(uint256 indexed patientId, address indexed doctor);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function registerPatient(string calldata dataHash) external returns (uint256) {
        _patientIdCounter++;
        uint256 newId = _patientIdCounter;

        patients[newId] = Patient({
            id: newId,
            dataHash: dataHash,
            owner: msg.sender,
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });

        patientRecords[msg.sender].push(newId);
        emit PatientRegistered(newId, msg.sender);
        return newId;
    }

    function updateRecord(uint256 patientId, string calldata newDataHash) external {
        require(
            patients[patientId].owner == msg.sender || accessGranted[patientId][msg.sender],
            "Not authorized"
        );
        patients[patientId].dataHash = newDataHash;
        patients[patientId].updatedAt = block.timestamp;
        emit RecordUpdated(patientId, newDataHash);
    }

    function grantAccess(uint256 patientId, address doctor) external {
        require(patients[patientId].owner == msg.sender, "Only owner can grant access");
        accessGranted[patientId][doctor] = true;
        emit AccessGranted(patientId, doctor);
    }

    function revokeAccess(uint256 patientId, address doctor) external {
        require(patients[patientId].owner == msg.sender, "Only owner can revoke access");
        accessGranted[patientId][doctor] = false;
        emit AccessRevoked(patientId, doctor);
    }

    function getPatient(uint256 patientId) external view returns (Patient memory) {
        require(
            patients[patientId].owner == msg.sender || accessGranted[patientId][msg.sender],
            "Not authorized"
        );
        return patients[patientId];
    }

    function getMyRecords() external view returns (uint256[] memory) {
        return patientRecords[msg.sender];
    }
}
