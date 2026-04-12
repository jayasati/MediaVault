// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MEDIToken.sol";

contract TreatmentCompliance is ReentrancyGuard {
    MEDIToken public mediToken;

    struct TreatmentPlan {
        uint256 planId;
        address doctorAddress;
        address patientAddress;
        string medicineName;
        uint256 totalDoses;
        uint256 dosesTaken;
        uint256 startDate;
        uint256 endDate;
        uint256 rewardAmount;
        bool isComplete;
        bool nextPrescriptionUnlocked;
    }

    struct DoseLog {
        uint256 logId;
        uint256 planId;
        address loggedBy;
        uint256 loggedAt;
        string note;
    }

    uint256 private _planIdCounter;
    uint256 private _logIdCounter;

    mapping(uint256 => TreatmentPlan) private plans;
    mapping(uint256 => DoseLog[]) private doseLogs;
    mapping(address => uint256[]) private patientPlans;
    mapping(address => bool) public registeredPharmacists;
    mapping(uint256 => bool) private rewardClaimed;

    address public admin;

    event PlanCreated(uint256 indexed planId, address indexed doctor, address indexed patient, string medicineName);
    event DoseLogged(uint256 indexed logId, uint256 indexed planId, address indexed loggedBy);
    event PlanCompleted(uint256 indexed planId, address indexed patient);
    event RewardClaimed(uint256 indexed planId, address indexed patient, uint256 amount);
    event PharmacistRegistered(address indexed pharmacist);

    constructor(address _mediToken, address _admin) {
        mediToken = MEDIToken(_mediToken);
        admin = _admin;
    }

    function registerPharmacist(address pharmacist) external {
        require(msg.sender == admin, "Only admin");
        registeredPharmacists[pharmacist] = true;
        emit PharmacistRegistered(pharmacist);
    }

    function createPlan(
        address patientAddress,
        string calldata medicineName,
        uint256 totalDoses,
        uint256 durationDays,
        uint256 rewardAmount
    ) external {
        require(patientAddress != address(0), "Invalid patient");
        require(totalDoses > 0, "Total doses must be > 0");
        require(durationDays > 0, "Duration must be > 0");
        require(bytes(medicineName).length > 0, "Medicine name required");

        _planIdCounter++;
        uint256 newId = _planIdCounter;

        plans[newId] = TreatmentPlan({
            planId: newId,
            doctorAddress: msg.sender,
            patientAddress: patientAddress,
            medicineName: medicineName,
            totalDoses: totalDoses,
            dosesTaken: 0,
            startDate: block.timestamp,
            endDate: block.timestamp + (durationDays * 1 days),
            rewardAmount: rewardAmount,
            isComplete: false,
            nextPrescriptionUnlocked: false
        });

        patientPlans[patientAddress].push(newId);

        emit PlanCreated(newId, msg.sender, patientAddress, medicineName);
    }

    function logDose(uint256 planId, string calldata note) external {
        TreatmentPlan storage plan = plans[planId];
        require(plan.planId != 0, "Plan does not exist");
        require(!plan.isComplete, "Plan already complete");
        require(
            msg.sender == plan.patientAddress || registeredPharmacists[msg.sender],
            "Not authorized to log dose"
        );

        plan.dosesTaken++;

        _logIdCounter++;
        doseLogs[planId].push(DoseLog({
            logId: _logIdCounter,
            planId: planId,
            loggedBy: msg.sender,
            loggedAt: block.timestamp,
            note: note
        }));

        emit DoseLogged(_logIdCounter, planId, msg.sender);

        if (plan.dosesTaken >= plan.totalDoses) {
            plan.isComplete = true;
            plan.nextPrescriptionUnlocked = true;
            emit PlanCompleted(planId, plan.patientAddress);
        }
    }

    function getComplianceScore(address patientAddress) external view returns (uint256) {
        uint256[] storage pIds = patientPlans[patientAddress];
        if (pIds.length == 0) return 0;

        uint256 completed = 0;
        for (uint256 i = 0; i < pIds.length; i++) {
            if (plans[pIds[i]].isComplete) completed++;
        }

        return (completed * 100) / pIds.length;
    }

    function getPlan(uint256 planId) external view returns (TreatmentPlan memory) {
        return plans[planId];
    }

    function getDoseLogs(uint256 planId) external view returns (DoseLog[] memory) {
        return doseLogs[planId];
    }

    function getPatientPlans(address patientAddress) external view returns (uint256[] memory) {
        return patientPlans[patientAddress];
    }

    function claimReward(uint256 planId) external nonReentrant {
        TreatmentPlan storage plan = plans[planId];
        require(plan.planId != 0, "Plan does not exist");
        require(msg.sender == plan.patientAddress, "Not the patient");
        require(plan.isComplete, "Plan not complete");
        require(!rewardClaimed[planId], "Reward already claimed");
        require(plan.rewardAmount > 0, "No reward set");

        rewardClaimed[planId] = true;

        require(
            mediToken.transfer(msg.sender, plan.rewardAmount),
            "Reward transfer failed"
        );

        emit RewardClaimed(planId, msg.sender, plan.rewardAmount);
    }
}
