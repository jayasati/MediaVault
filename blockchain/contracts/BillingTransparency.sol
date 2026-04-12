// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract BillingTransparency is Ownable, ReentrancyGuard {
    enum Category { CONSULTATION, MEDICINE, PROCEDURE, ROOM, TEST, OTHER }
    enum BillStatus { PENDING, PATIENT_ACKNOWLEDGED, DISPUTED, RESOLVED }

    struct BillableEvent {
        uint256 eventId;
        address patientAddress;
        address hospitalAddress;
        string description;
        uint256 amount;
        Category category;
        uint256 loggedAt;
        address doctorAddress;
    }

    struct FinalBill {
        uint256 billId;
        address patientAddress;
        address hospitalAddress;
        uint256[] eventIds;
        uint256 totalAmount;
        uint256 issuedAt;
        BillStatus status;
    }

    struct Dispute {
        uint256 disputeId;
        uint256 billId;
        address patientAddress;
        string reason;
        uint256 contestedAmount;
        uint256 raisedAt;
        uint256 resolvedAt;
        bool isResolved;
    }

    uint256 private _eventIdCounter;
    uint256 private _billIdCounter;
    uint256 private _disputeIdCounter;

    mapping(uint256 => BillableEvent) private events;
    mapping(uint256 => FinalBill) private bills;
    mapping(uint256 => Dispute) private disputes;

    mapping(address => uint256[]) private patientEvents;
    mapping(address => uint256[]) private patientBills;
    mapping(uint256 => uint256) private billToDispute; // billId → disputeId

    mapping(address => bool) public registeredHospitals;

    event EventLogged(uint256 indexed eventId, address indexed patient, address indexed hospital, uint256 amount, Category category);
    event BillGenerated(uint256 indexed billId, address indexed patient, address indexed hospital, uint256 totalAmount);
    event BillAcknowledged(uint256 indexed billId, address indexed patient);
    event DisputeRaised(uint256 indexed disputeId, uint256 indexed billId, address indexed patient, uint256 contestedAmount);
    event DisputeResolved(uint256 indexed disputeId, uint256 indexed billId);

    modifier onlyHospital() {
        require(registeredHospitals[msg.sender], "Not a registered hospital");
        _;
    }

    constructor() Ownable(msg.sender) {}

    function registerHospital(address hospital) external onlyOwner {
        registeredHospitals[hospital] = true;
    }

    // ── Billable Events ──

    function logBillableEvent(
        address patientAddress,
        string calldata description,
        uint256 amount,
        Category category,
        address doctorAddress
    ) external onlyHospital nonReentrant {
        require(patientAddress != address(0), "Invalid patient address");
        require(amount > 0, "Amount must be greater than zero");
        require(bytes(description).length > 0, "Description required");

        _eventIdCounter++;
        uint256 newId = _eventIdCounter;

        events[newId] = BillableEvent({
            eventId: newId,
            patientAddress: patientAddress,
            hospitalAddress: msg.sender,
            description: description,
            amount: amount,
            category: category,
            loggedAt: block.timestamp,
            doctorAddress: doctorAddress
        });

        patientEvents[patientAddress].push(newId);

        emit EventLogged(newId, patientAddress, msg.sender, amount, category);
    }

    function getBillableEvent(uint256 eventId) external view returns (BillableEvent memory) {
        return events[eventId];
    }

    function getPatientEvents(address patientAddress) external view returns (uint256[] memory) {
        return patientEvents[patientAddress];
    }

    // ── Final Bills ──

    function generateFinalBill(
        address patientAddress,
        uint256[] calldata eventIds
    ) external onlyHospital nonReentrant {
        require(eventIds.length > 0, "Must include at least one event");

        uint256 total = 0;
        for (uint256 i = 0; i < eventIds.length; i++) {
            BillableEvent storage evt = events[eventIds[i]];

            // Every referenced event must exist
            require(evt.eventId != 0, "Event does not exist");
            // Must belong to the same patient
            require(evt.patientAddress == patientAddress, "Event patient mismatch");
            // Must have been logged by this hospital
            require(evt.hospitalAddress == msg.sender, "Event hospital mismatch");

            total += evt.amount;
        }

        _billIdCounter++;
        uint256 newId = _billIdCounter;

        bills[newId] = FinalBill({
            billId: newId,
            patientAddress: patientAddress,
            hospitalAddress: msg.sender,
            eventIds: eventIds,
            totalAmount: total,
            issuedAt: block.timestamp,
            status: BillStatus.PENDING
        });

        patientBills[patientAddress].push(newId);

        emit BillGenerated(newId, patientAddress, msg.sender, total);
    }

    function acknowledgeBill(uint256 billId) external {
        FinalBill storage bill = bills[billId];
        require(bill.billId != 0, "Bill does not exist");
        require(msg.sender == bill.patientAddress, "Only patient can acknowledge");
        require(bill.status == BillStatus.PENDING, "Bill is not pending");

        bill.status = BillStatus.PATIENT_ACKNOWLEDGED;
        emit BillAcknowledged(billId, msg.sender);
    }

    function getBill(uint256 billId) external view returns (
        uint256 id,
        address patientAddress,
        address hospitalAddress,
        uint256[] memory eventIds,
        uint256 totalAmount,
        uint256 issuedAt,
        BillStatus status
    ) {
        FinalBill storage b = bills[billId];
        return (b.billId, b.patientAddress, b.hospitalAddress, b.eventIds, b.totalAmount, b.issuedAt, b.status);
    }

    function getMyBills(address patientAddress) external view returns (uint256[] memory) {
        return patientBills[patientAddress];
    }

    function getUnacknowledgedBills(address patientAddress) external view returns (uint256[] memory) {
        uint256[] storage all = patientBills[patientAddress];
        uint256 count = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (bills[all[i]].status == BillStatus.PENDING) count++;
        }

        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (bills[all[i]].status == BillStatus.PENDING) {
                result[idx] = all[i];
                idx++;
            }
        }
        return result;
    }

    /**
     * @notice Public validation: checks that every eventId in the bill exists,
     *         belongs to the correct patient and hospital, and that the sum of
     *         event amounts equals the bill's totalAmount.
     */
    function validateBill(uint256 billId) external view returns (bool valid, string memory reason) {
        FinalBill storage bill = bills[billId];
        if (bill.billId == 0) return (false, "Bill does not exist");

        uint256 computedTotal = 0;
        for (uint256 i = 0; i < bill.eventIds.length; i++) {
            BillableEvent storage evt = events[bill.eventIds[i]];
            if (evt.eventId == 0) return (false, "Referenced event does not exist");
            if (evt.patientAddress != bill.patientAddress) return (false, "Event patient mismatch");
            if (evt.hospitalAddress != bill.hospitalAddress) return (false, "Event hospital mismatch");
            computedTotal += evt.amount;
        }

        if (computedTotal != bill.totalAmount) return (false, "Total amount mismatch");

        return (true, "Valid");
    }

    // ── Disputes ──

    function raiseDispute(uint256 billId, string calldata disputeReason, uint256 contestedAmount) external {
        FinalBill storage bill = bills[billId];
        require(bill.billId != 0, "Bill does not exist");
        require(msg.sender == bill.patientAddress, "Only patient can dispute");
        require(
            bill.status == BillStatus.PENDING || bill.status == BillStatus.PATIENT_ACKNOWLEDGED,
            "Bill cannot be disputed"
        );
        require(billToDispute[billId] == 0, "Dispute already exists for this bill");
        require(contestedAmount > 0 && contestedAmount <= bill.totalAmount, "Invalid contested amount");
        require(bytes(disputeReason).length > 0, "Reason required");

        _disputeIdCounter++;
        uint256 newId = _disputeIdCounter;

        disputes[newId] = Dispute({
            disputeId: newId,
            billId: billId,
            patientAddress: msg.sender,
            reason: disputeReason,
            contestedAmount: contestedAmount,
            raisedAt: block.timestamp,
            resolvedAt: 0,
            isResolved: false
        });

        billToDispute[billId] = newId;
        bill.status = BillStatus.DISPUTED;

        emit DisputeRaised(newId, billId, msg.sender, contestedAmount);
    }

    function resolveDispute(uint256 disputeId) external onlyOwner {
        Dispute storage d = disputes[disputeId];
        require(d.disputeId != 0, "Dispute does not exist");
        require(!d.isResolved, "Already resolved");

        d.isResolved = true;
        d.resolvedAt = block.timestamp;

        bills[d.billId].status = BillStatus.RESOLVED;

        emit DisputeResolved(disputeId, d.billId);
    }

    function getDispute(uint256 disputeId) external view returns (Dispute memory) {
        return disputes[disputeId];
    }
}
