// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MediAccessControl.sol";

contract PrescriptionManager is Ownable, ReentrancyGuard {
    MediAccessControl public accessControl;

    struct Prescription {
        uint256 prescriptionId;
        address doctorAddress;
        address patientAddress;
        string medicineIPFSHash;
        string medicineName;
        string dosage;
        uint256 durationDays;
        bool isControlled;
        uint256 issuedAt;
        uint256 expiresAt;
        bool isDispensed;
        address dispensedBy;
        uint256 dispensedAt;
        bool isActive;
    }

    uint256 private _prescriptionIdCounter;

    mapping(uint256 => Prescription) private prescriptions;
    mapping(address => uint256[]) private patientPrescriptions;
    mapping(address => mapping(string => uint256[])) private patientMedicinePrescriptions;
    mapping(address => bool) public registeredPharmacists;

    event PrescriptionWritten(uint256 indexed prescriptionId, address indexed doctor, address indexed patient, string medicineName);
    event PrescriptionDispensed(uint256 indexed prescriptionId, address indexed pharmacist);
    event ControlledSubstanceAlert(uint256 indexed prescriptionId, address indexed doctor, address indexed patient, string medicineName);
    event DuplicatePrescriptionBlocked(address indexed doctor, address indexed patient, string medicineName);
    event PharmacistRegistered(address indexed pharmacist);

    constructor(address _accessControl) Ownable(msg.sender) {
        accessControl = MediAccessControl(_accessControl);
    }

    function registerPharmacist(address pharmacist) external onlyOwner {
        registeredPharmacists[pharmacist] = true;
        emit PharmacistRegistered(pharmacist);
    }

    function writePrescription(
        address patientAddress,
        string calldata medicineName,
        string calldata dosage,
        uint256 durationDays,
        bool isControlled,
        string calldata medicineIPFSHash
    ) external nonReentrant {
        require(msg.sender != patientAddress, "Doctor cannot prescribe to self");
        require(durationDays > 0, "Duration must be at least 1 day");
        require(bytes(medicineName).length > 0, "Medicine name required");

        // Check doctor has active access to patient
        require(
            accessControl.hasActiveAccess(msg.sender, patientAddress),
            "No active access to patient"
        );

        // Check for duplicate active prescription
        require(
            !_hasActivePrescription(patientAddress, medicineName),
            "Active prescription already exists for this medicine"
        );

        _prescriptionIdCounter++;
        uint256 newId = _prescriptionIdCounter;

        prescriptions[newId] = Prescription({
            prescriptionId: newId,
            doctorAddress: msg.sender,
            patientAddress: patientAddress,
            medicineIPFSHash: medicineIPFSHash,
            medicineName: medicineName,
            dosage: dosage,
            durationDays: durationDays,
            isControlled: isControlled,
            issuedAt: block.timestamp,
            expiresAt: block.timestamp + (durationDays * 1 days),
            isDispensed: false,
            dispensedBy: address(0),
            dispensedAt: 0,
            isActive: true
        });

        patientPrescriptions[patientAddress].push(newId);
        patientMedicinePrescriptions[patientAddress][medicineName].push(newId);

        emit PrescriptionWritten(newId, msg.sender, patientAddress, medicineName);

        if (isControlled) {
            emit ControlledSubstanceAlert(newId, msg.sender, patientAddress, medicineName);
        }
    }

    function dispensePrescription(uint256 prescriptionId) external nonReentrant {
        require(registeredPharmacists[msg.sender], "Not a registered pharmacist");

        Prescription storage rx = prescriptions[prescriptionId];
        require(rx.prescriptionId != 0, "Prescription does not exist");
        require(rx.isActive, "Prescription is not active");
        require(!rx.isDispensed, "Already dispensed");
        require(rx.expiresAt > block.timestamp, "Prescription has expired");

        rx.isDispensed = true;
        rx.dispensedBy = msg.sender;
        rx.dispensedAt = block.timestamp;

        emit PrescriptionDispensed(prescriptionId, msg.sender);
    }

    function getActivePrescriptions(address patientAddress) external view returns (uint256[] memory) {
        uint256[] storage all = patientPrescriptions[patientAddress];
        uint256 count = 0;

        for (uint256 i = 0; i < all.length; i++) {
            Prescription storage rx = prescriptions[all[i]];
            if (rx.isActive && rx.expiresAt > block.timestamp) {
                count++;
            }
        }

        uint256[] memory active = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            Prescription storage rx = prescriptions[all[i]];
            if (rx.isActive && rx.expiresAt > block.timestamp) {
                active[idx] = all[i];
                idx++;
            }
        }

        return active;
    }

    function checkDuplicate(address patientAddress, string calldata medicineName) external view returns (bool) {
        return _hasActivePrescription(patientAddress, medicineName);
    }

    function getPrescription(uint256 prescriptionId) external view returns (Prescription memory) {
        return prescriptions[prescriptionId];
    }

    function _hasActivePrescription(address patientAddress, string memory medicineName) internal view returns (bool) {
        uint256[] storage ids = patientMedicinePrescriptions[patientAddress][medicineName];
        for (uint256 i = 0; i < ids.length; i++) {
            Prescription storage rx = prescriptions[ids[i]];
            if (rx.isActive && rx.expiresAt > block.timestamp) {
                return true;
            }
        }
        return false;
    }
}
