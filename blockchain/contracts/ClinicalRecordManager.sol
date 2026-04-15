// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MediAccessControl.sol";
import "./RoleManager.sol";

/**
 * @title ClinicalRecordManager
 * @notice Tier-1 (clinical) medical records with strong authorship and audit trail.
 *
 * MODEL:
 *  - Doctors upload records directly for patients they have active access to.
 *  - Patients can submit records for ratification (e.g. imported from another hospital);
 *    a designated doctor must then approve (ratify) or reject to make them clinical.
 *  - Records can be amended by the original uploader within AMENDMENT_WINDOW (7 days),
 *    capped at MAX_AMENDMENT_AGE (30 days) from the original upload.
 *  - Doctor-patient treatment history is tracked automatically and permanently.
 *  - Patients can purge historical read access per doctor.
 *  - Patients can flag a record as disputed (emits event for future arbitration).
 *
 * GAS:
 *  - Patient pays when submitting records for ratification.
 *  - Doctor pays when uploading, ratifying, amending.
 */
contract ClinicalRecordManager is ReentrancyGuard {
    MediAccessControl public accessControl;
    RoleManager public roleManager;

    enum RecordCategory { LAB, SCAN, DIAGNOSIS, PRESCRIPTION, PROCEDURE, DISCHARGE, VITALS, IMPORT, OTHER }
    enum RecordStatus { PENDING_RATIFICATION, CLINICAL, AMENDED, REJECTED_RATIFICATION }

    uint256 public constant AMENDMENT_WINDOW = 7 days;
    uint256 public constant MAX_AMENDMENT_AGE = 30 days;

    struct ClinicalRecord {
        uint256 recordId;
        uint256 originalRecordId;
        uint256 previousVersionId;
        uint256 nextVersionId;
        address patientAddress;
        address uploaderDoctor;    // current custodian
        address submittedBy;       // doctor for direct upload, patient for ratification
        bytes32 contentHash;
        string ipfsCID;
        RecordCategory category;
        RecordStatus status;
        string title;
        uint256 uploadedAt;
        uint256 lastAmendedAt;
        string amendmentReason;
        bool isSuperseded;
        bool isEmergencyRelevant;
    }

    uint256 private _recordIdCounter;

    mapping(uint256 => ClinicalRecord) private records;
    mapping(address => uint256[]) private patientRecords;
    mapping(address => uint256[]) private doctorUploads;
    mapping(address => uint256[]) private doctorPendingRatifications;
    mapping(address => uint256[]) private patientEmergencyRecords;

    // Treatment history
    mapping(address => address[]) private doctorPatientList;
    mapping(address => mapping(address => uint256)) private firstTreatedAt;
    mapping(address => mapping(address => uint256)) private lastInteractionAt;

    // Patient can purge historical read access for a specific doctor
    mapping(address => mapping(address => bool)) private purgedHistoricalAccess;

    event RecordUploaded(uint256 indexed recordId, address indexed patient, address indexed doctor, RecordCategory category);
    event RatificationRequested(uint256 indexed recordId, address indexed patient, address indexed doctor);
    event RecordRatified(uint256 indexed recordId, address indexed doctor, address indexed patient);
    event RatificationRejected(uint256 indexed recordId, address indexed doctor, string reason);
    event RecordAmended(uint256 indexed oldRecordId, uint256 indexed newRecordId, string reason);
    event RecordDisputed(uint256 indexed recordId, address indexed patient, string reason);
    event HistoricalAccessPurged(address indexed patient, address indexed doctor);

    modifier onlyDoctor() {
        require(
            roleManager.getRole(msg.sender) == RoleManager.Role.DOCTOR,
            "Only registered doctor"
        );
        _;
    }

    modifier onlyPatient() {
        require(
            roleManager.getRole(msg.sender) == RoleManager.Role.PATIENT,
            "Only registered patient"
        );
        _;
    }

    constructor(address _accessControl, address _roleManager) {
        accessControl = MediAccessControl(_accessControl);
        roleManager = RoleManager(_roleManager);
    }

    // ── Doctor uploads clinical record directly ──

    function uploadRecord(
        address patientAddress,
        bytes32 contentHash,
        string calldata ipfsCID,
        RecordCategory category,
        string calldata title,
        bool isEmergencyRelevant
    ) external onlyDoctor nonReentrant returns (uint256) {
        require(patientAddress != address(0), "Invalid patient");
        require(
            accessControl.hasActiveAccess(msg.sender, patientAddress),
            "No active write access to patient"
        );
        require(bytes(ipfsCID).length > 0, "IPFS CID required");

        _recordIdCounter++;
        uint256 newId = _recordIdCounter;

        records[newId] = ClinicalRecord({
            recordId: newId,
            originalRecordId: newId,
            previousVersionId: 0,
            nextVersionId: 0,
            patientAddress: patientAddress,
            uploaderDoctor: msg.sender,
            submittedBy: msg.sender,
            contentHash: contentHash,
            ipfsCID: ipfsCID,
            category: category,
            status: RecordStatus.CLINICAL,
            title: title,
            uploadedAt: block.timestamp,
            lastAmendedAt: 0,
            amendmentReason: "",
            isSuperseded: false,
            isEmergencyRelevant: isEmergencyRelevant
        });

        patientRecords[patientAddress].push(newId);
        doctorUploads[msg.sender].push(newId);
        if (isEmergencyRelevant) patientEmergencyRecords[patientAddress].push(newId);
        _recordTreatment(msg.sender, patientAddress);

        emit RecordUploaded(newId, patientAddress, msg.sender, category);
        return newId;
    }

    // ── Patient submits a prior record for ratification by a doctor ──

    function submitForRatification(
        bytes32 contentHash,
        string calldata ipfsCID,
        RecordCategory category,
        string calldata title,
        address targetDoctor
    ) external onlyPatient nonReentrant returns (uint256) {
        require(bytes(ipfsCID).length > 0, "IPFS CID required");
        require(targetDoctor != address(0), "Target doctor required");
        require(
            roleManager.getRole(targetDoctor) == RoleManager.Role.DOCTOR,
            "Target must be a doctor"
        );

        _recordIdCounter++;
        uint256 newId = _recordIdCounter;

        records[newId] = ClinicalRecord({
            recordId: newId,
            originalRecordId: newId,
            previousVersionId: 0,
            nextVersionId: 0,
            patientAddress: msg.sender,
            uploaderDoctor: targetDoctor,
            submittedBy: msg.sender,
            contentHash: contentHash,
            ipfsCID: ipfsCID,
            category: category,
            status: RecordStatus.PENDING_RATIFICATION,
            title: title,
            uploadedAt: block.timestamp,
            lastAmendedAt: 0,
            amendmentReason: "",
            isSuperseded: false,
            isEmergencyRelevant: false
        });

        patientRecords[msg.sender].push(newId);
        doctorPendingRatifications[targetDoctor].push(newId);

        emit RatificationRequested(newId, msg.sender, targetDoctor);
        return newId;
    }

    function ratifyRecord(uint256 recordId) external onlyDoctor nonReentrant {
        ClinicalRecord storage rec = records[recordId];
        require(rec.recordId != 0, "Record does not exist");
        require(rec.status == RecordStatus.PENDING_RATIFICATION, "Not pending ratification");
        require(rec.uploaderDoctor == msg.sender, "Not the designated doctor");

        rec.status = RecordStatus.CLINICAL;
        rec.uploadedAt = block.timestamp; // reset for amendment window

        doctorUploads[msg.sender].push(recordId);
        _recordTreatment(msg.sender, rec.patientAddress);

        emit RecordRatified(recordId, msg.sender, rec.patientAddress);
    }

    function rejectRatification(uint256 recordId, string calldata reason) external onlyDoctor {
        ClinicalRecord storage rec = records[recordId];
        require(rec.recordId != 0, "Record does not exist");
        require(rec.status == RecordStatus.PENDING_RATIFICATION, "Not pending ratification");
        require(rec.uploaderDoctor == msg.sender, "Not the designated doctor");

        rec.status = RecordStatus.REJECTED_RATIFICATION;
        rec.amendmentReason = reason;

        emit RatificationRejected(recordId, msg.sender, reason);
    }

    // ── Amend a clinical record within the window ──

    function amendRecord(
        uint256 oldRecordId,
        bytes32 newContentHash,
        string calldata newIpfsCID,
        string calldata reason
    ) external onlyDoctor nonReentrant returns (uint256) {
        ClinicalRecord storage old = records[oldRecordId];
        require(old.recordId != 0, "Record does not exist");
        require(old.status == RecordStatus.CLINICAL, "Can only amend clinical records");
        require(!old.isSuperseded, "Already superseded");
        require(old.uploaderDoctor == msg.sender, "Only uploader can amend");
        require(block.timestamp <= old.uploadedAt + AMENDMENT_WINDOW, "Amendment window expired");
        require(bytes(reason).length > 0, "Reason required");

        // Cap from original upload
        uint256 origId = old.originalRecordId;
        ClinicalRecord storage orig = records[origId];
        require(block.timestamp <= orig.uploadedAt + MAX_AMENDMENT_AGE, "Past max amendment age");

        _recordIdCounter++;
        uint256 newId = _recordIdCounter;

        records[newId] = ClinicalRecord({
            recordId: newId,
            originalRecordId: origId,
            previousVersionId: oldRecordId,
            nextVersionId: 0,
            patientAddress: old.patientAddress,
            uploaderDoctor: msg.sender,
            submittedBy: msg.sender,
            contentHash: newContentHash,
            ipfsCID: newIpfsCID,
            category: old.category,
            status: RecordStatus.CLINICAL,
            title: old.title,
            uploadedAt: block.timestamp,
            lastAmendedAt: block.timestamp,
            amendmentReason: reason,
            isSuperseded: false,
            isEmergencyRelevant: old.isEmergencyRelevant
        });

        old.isSuperseded = true;
        old.nextVersionId = newId;
        old.status = RecordStatus.AMENDED;

        patientRecords[old.patientAddress].push(newId);
        doctorUploads[msg.sender].push(newId);

        emit RecordAmended(oldRecordId, newId, reason);
        return newId;
    }

    // ── Dispute flag (infrastructure for future arbitration) ──

    function disputeRecord(uint256 recordId, string calldata reason) external {
        ClinicalRecord storage rec = records[recordId];
        require(rec.recordId != 0, "Record does not exist");
        require(msg.sender == rec.patientAddress, "Only patient can dispute");
        require(bytes(reason).length > 0, "Reason required");
        emit RecordDisputed(recordId, msg.sender, reason);
    }

    // ── Historical read access purge ──

    function purgeHistoricalAccess(address doctor) external {
        require(firstTreatedAt[doctor][msg.sender] != 0, "No history with this doctor");
        purgedHistoricalAccess[msg.sender][doctor] = true;
        emit HistoricalAccessPurged(msg.sender, doctor);
    }

    function hasHistoricalReadAccess(address doctor, address patient) external view returns (bool) {
        if (purgedHistoricalAccess[patient][doctor]) return false;
        return firstTreatedAt[doctor][patient] != 0;
    }

    // ── Treatment history ──

    function _recordTreatment(address doctor, address patient) internal {
        if (firstTreatedAt[doctor][patient] == 0) {
            firstTreatedAt[doctor][patient] = block.timestamp;
            doctorPatientList[doctor].push(patient);
        }
        lastInteractionAt[doctor][patient] = block.timestamp;
    }

    function getDoctorPatients(address doctor) external view returns (address[] memory) {
        return doctorPatientList[doctor];
    }

    function getPatientTreatmentInfo(address doctor, address patient)
        external
        view
        returns (uint256 firstAt, uint256 lastAt)
    {
        return (firstTreatedAt[doctor][patient], lastInteractionAt[doctor][patient]);
    }

    // ── Views ──

    function getRecord(uint256 recordId) external view returns (ClinicalRecord memory) {
        return records[recordId];
    }

    function getPatientRecords(address patient) external view returns (uint256[] memory) {
        return patientRecords[patient];
    }

    function getPatientEmergencyRecords(address patient) external view returns (uint256[] memory) {
        // Return non-superseded emergency-flagged records only
        uint256[] storage all = patientEmergencyRecords[patient];
        uint256 count = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (!records[all[i]].isSuperseded && records[all[i]].status == RecordStatus.CLINICAL) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (!records[all[i]].isSuperseded && records[all[i]].status == RecordStatus.CLINICAL) {
                result[idx++] = all[i];
            }
        }
        return result;
    }

    function getDoctorUploads(address doctor) external view returns (uint256[] memory) {
        return doctorUploads[doctor];
    }

    function getPendingRatifications(address doctor) external view returns (uint256[] memory) {
        uint256[] storage all = doctorPendingRatifications[doctor];
        uint256 count = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (records[all[i]].status == RecordStatus.PENDING_RATIFICATION) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (records[all[i]].status == RecordStatus.PENDING_RATIFICATION) {
                result[idx] = all[i];
                idx++;
            }
        }
        return result;
    }
}
