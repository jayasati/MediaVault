// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PatientRegistry.sol";

contract MediAccessControl is ReentrancyGuard {
    PatientRegistry public patientRegistry;

    enum AccessStatus { PENDING, APPROVED, REJECTED, REVOKED, EXPIRED }

    struct AccessRequest {
        uint256 requestId;
        address doctorAddress;
        address patientAddress;
        string reason;
        uint256 requestedAt;
        uint256 respondedAt;
        uint256 expiresAt;
        AccessStatus status;
    }

    uint256 private _requestIdCounter;

    mapping(uint256 => AccessRequest) private requests;
    mapping(address => mapping(address => uint256)) private latestRequest; // doctor → patient → requestId
    mapping(address => uint256[]) private patientRequests; // patient → requestIds
    mapping(address => uint256[]) private doctorRequests;  // doctor → requestIds

    event AccessRequested(uint256 indexed requestId, address indexed doctor, address indexed patient);
    event AccessApproved(uint256 indexed requestId, uint256 expiresAt);
    event AccessRejected(uint256 indexed requestId);
    event AccessRevoked(uint256 indexed requestId);
    event AccessExpired(uint256 indexed requestId);

    modifier onlyPatient(address patientAddress) {
        require(msg.sender == patientAddress, "Only the patient can perform this action");
        _;
    }

    modifier onlyDoctor(uint256 requestId) {
        require(msg.sender == requests[requestId].doctorAddress, "Only the requesting doctor can perform this action");
        _;
    }

    constructor(address _patientRegistry) {
        patientRegistry = PatientRegistry(_patientRegistry);
    }

    function requestAccess(address patientAddress, string calldata reason) external nonReentrant {
        require(msg.sender != patientAddress, "Cannot request access to own records");

        PatientRegistry.Patient memory patient = patientRegistry.getPatientByWallet(patientAddress);
        require(patient.isActive, "Patient is not registered or active");

        // If there's an existing pending request, revert
        uint256 existingId = latestRequest[msg.sender][patientAddress];
        if (existingId != 0) {
            AccessStatus currentStatus = requests[existingId].status;
            require(
                currentStatus != AccessStatus.PENDING,
                "A pending request already exists"
            );
            // If previously approved and not yet expired, revert
            if (currentStatus == AccessStatus.APPROVED && requests[existingId].expiresAt > block.timestamp) {
                revert("Active access already granted");
            }
        }

        _requestIdCounter++;
        uint256 newId = _requestIdCounter;

        requests[newId] = AccessRequest({
            requestId: newId,
            doctorAddress: msg.sender,
            patientAddress: patientAddress,
            reason: reason,
            requestedAt: block.timestamp,
            respondedAt: 0,
            expiresAt: 0,
            status: AccessStatus.PENDING
        });

        latestRequest[msg.sender][patientAddress] = newId;
        patientRequests[patientAddress].push(newId);
        doctorRequests[msg.sender].push(newId);

        emit AccessRequested(newId, msg.sender, patientAddress);
    }

    function approveAccess(uint256 requestId, uint256 durationDays) external {
        AccessRequest storage req = requests[requestId];
        require(req.requestId != 0, "Request does not exist");
        require(msg.sender == req.patientAddress, "Only the patient can perform this action");
        require(req.status == AccessStatus.PENDING, "Request is not pending");
        require(durationDays > 0, "Duration must be at least 1 day");

        uint256 duration = durationDays > 0 ? durationDays * 1 days : 30 days;

        req.status = AccessStatus.APPROVED;
        req.respondedAt = block.timestamp;
        req.expiresAt = block.timestamp + duration;

        emit AccessApproved(requestId, req.expiresAt);
    }

    function rejectAccess(uint256 requestId) external {
        AccessRequest storage req = requests[requestId];
        require(req.requestId != 0, "Request does not exist");
        require(msg.sender == req.patientAddress, "Only the patient can perform this action");
        require(req.status == AccessStatus.PENDING, "Request is not pending");

        req.status = AccessStatus.REJECTED;
        req.respondedAt = block.timestamp;

        emit AccessRejected(requestId);
    }

    function revokeAccess(uint256 requestId) external {
        AccessRequest storage req = requests[requestId];
        require(req.requestId != 0, "Request does not exist");
        require(msg.sender == req.patientAddress, "Only the patient can perform this action");
        require(req.status == AccessStatus.APPROVED, "Request is not currently approved");

        req.status = AccessStatus.REVOKED;
        req.respondedAt = block.timestamp;

        emit AccessRevoked(requestId);
    }

    function hasActiveAccess(address doctorAddress, address patientAddress) external view returns (bool) {
        uint256 reqId = latestRequest[doctorAddress][patientAddress];
        if (reqId == 0) return false;

        AccessRequest storage req = requests[reqId];
        return req.status == AccessStatus.APPROVED && req.expiresAt > block.timestamp;
    }

    function getAccessRequest(uint256 requestId) external view returns (AccessRequest memory) {
        return requests[requestId];
    }

    function getPendingRequestsForPatient(address patientAddress) external view returns (uint256[] memory) {
        uint256[] storage allRequests = patientRequests[patientAddress];
        uint256 count = 0;

        for (uint256 i = 0; i < allRequests.length; i++) {
            if (requests[allRequests[i]].status == AccessStatus.PENDING) {
                count++;
            }
        }

        uint256[] memory pending = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allRequests.length; i++) {
            if (requests[allRequests[i]].status == AccessStatus.PENDING) {
                pending[idx] = allRequests[i];
                idx++;
            }
        }

        return pending;
    }

    function getMyAccessRequests() external view returns (uint256[] memory) {
        return doctorRequests[msg.sender];
    }
}
