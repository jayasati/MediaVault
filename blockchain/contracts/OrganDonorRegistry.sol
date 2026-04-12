// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PatientRegistry.sol";

/**
 * @title OrganDonorRegistry
 * @notice On-chain organ donation and transplant waitlist with deterministic,
 *         manipulation-proof matching.
 *
 * MATCHING ALGORITHM (findBestMatch):
 * ───────────────────────────────────
 * 1. Filter: only entries where organNeeded matches AND isMatched == false.
 * 2. Blood type compatibility scoring:
 *    - Exact match                    → priority 3 (highest)
 *    - Universal donor O- to any      → priority 2
 *    - Compatible group (same letter) → priority 1
 *    - Incompatible                   → priority 0 (excluded)
 * 3. Within same blood-type priority tier, sort by urgencyScore DESCENDING
 *    (10 = most urgent, 1 = least).
 * 4. Within same urgency, sort by waitingSince ASCENDING (longest wait first).
 *
 * This algorithm is fully deterministic: given the same on-chain state, any
 * caller gets the same result. No admin override exists for ordering. The only
 * way to change ranking is to change urgencyScore via updateUrgency(), which
 * emits an auditable event.
 */
contract OrganDonorRegistry is Ownable, ReentrancyGuard {
    PatientRegistry public patientRegistry;

    struct DonorProfile {
        address patientAddress;
        string bloodType;
        string[] organsAvailable;
        uint256 registeredAt;
        bool isActive;
    }

    struct WaitlistEntry {
        uint256 entryId;
        address patientAddress;
        string bloodType;
        string organNeeded;
        uint8 urgencyScore;     // 1-10, set by verified hospital
        uint256 waitingSince;
        bool isMatched;
        address matchedDonor;
    }

    struct TransplantRecord {
        uint256 transplantId;
        address donorAddress;
        address recipientAddress;
        string organ;
        uint256 performedAt;
        address hospitalAddress;
    }

    uint256 private _entryIdCounter;
    uint256 private _transplantIdCounter;

    mapping(address => DonorProfile) private donors;
    mapping(string => uint256[]) private organWaitlists;    // organType → entryIds
    mapping(uint256 => WaitlistEntry) private waitlistEntries;
    mapping(uint256 => TransplantRecord) private transplants;
    mapping(address => bool) public verifiedHospitals;

    uint256[] private allTransplantIds;

    event DonorRegistered(address indexed donor, string[] organs);
    event DonorDeregistered(address indexed donor);
    event WaitlistJoined(uint256 indexed entryId, address indexed patient, string organ, uint8 urgency);
    event UrgencyUpdated(uint256 indexed entryId, uint8 oldScore, uint8 newScore, address indexed hospital);
    event TransplantRecorded(uint256 indexed transplantId, address indexed donor, address indexed recipient, string organ);

    modifier onlyHospital() {
        require(verifiedHospitals[msg.sender], "Not a verified hospital");
        _;
    }

    constructor(address _patientRegistry) Ownable(msg.sender) {
        patientRegistry = PatientRegistry(_patientRegistry);
    }

    function verifyHospital(address hospital) external onlyOwner {
        verifiedHospitals[hospital] = true;
    }

    // ── Donor functions ──

    function registerDonor(string[] calldata organsAvailable) external nonReentrant {
        require(organsAvailable.length > 0, "Must offer at least one organ");
        require(!donors[msg.sender].isActive, "Already registered as donor");

        // Must be a registered patient
        PatientRegistry.Patient memory patient = patientRegistry.getPatientByWallet(msg.sender);
        require(patient.walletAddress != address(0) && patient.isActive, "Not a registered patient");

        donors[msg.sender] = DonorProfile({
            patientAddress: msg.sender,
            bloodType: patient.bloodType,
            organsAvailable: organsAvailable,
            registeredAt: block.timestamp,
            isActive: true
        });

        emit DonorRegistered(msg.sender, organsAvailable);
    }

    function deregisterDonor() external {
        require(donors[msg.sender].isActive, "Not registered as donor");
        donors[msg.sender].isActive = false;
        emit DonorDeregistered(msg.sender);
    }

    function getDonorProfile(address donor) external view returns (
        address patientAddress,
        string memory bloodType,
        string[] memory organsAvailable,
        uint256 registeredAt,
        bool isActive
    ) {
        DonorProfile storage d = donors[donor];
        return (d.patientAddress, d.bloodType, d.organsAvailable, d.registeredAt, d.isActive);
    }

    // ── Waitlist functions ──

    function joinWaitlist(
        address patientAddress,
        string calldata organNeeded,
        string calldata bloodType,
        uint8 urgencyScore
    ) external onlyHospital nonReentrant {
        require(urgencyScore >= 1 && urgencyScore <= 10, "Urgency must be 1-10");
        require(bytes(organNeeded).length > 0, "Organ type required");
        require(bytes(bloodType).length > 0, "Blood type required");

        _entryIdCounter++;
        uint256 newId = _entryIdCounter;

        waitlistEntries[newId] = WaitlistEntry({
            entryId: newId,
            patientAddress: patientAddress,
            bloodType: bloodType,
            organNeeded: organNeeded,
            urgencyScore: urgencyScore,
            waitingSince: block.timestamp,
            isMatched: false,
            matchedDonor: address(0)
        });

        organWaitlists[organNeeded].push(newId);

        emit WaitlistJoined(newId, patientAddress, organNeeded, urgencyScore);
    }

    function updateUrgency(uint256 entryId, uint8 newScore) external onlyHospital {
        require(newScore >= 1 && newScore <= 10, "Urgency must be 1-10");
        WaitlistEntry storage entry = waitlistEntries[entryId];
        require(entry.entryId != 0, "Entry does not exist");
        require(!entry.isMatched, "Already matched");

        uint8 oldScore = entry.urgencyScore;
        entry.urgencyScore = newScore;

        emit UrgencyUpdated(entryId, oldScore, newScore, msg.sender);
    }

    /**
     * @notice Deterministic matching: returns up to `maxResults` best-matching
     *         waitlist entry IDs for the given organ and donor blood type.
     *
     *         Ranking (descending priority):
     *         1. Blood compatibility tier (exact > universal > compatible > incompatible)
     *         2. Urgency score (10 highest)
     *         3. Wait time (longest first)
     */
    function findBestMatch(
        string calldata organNeeded,
        string calldata donorBloodType,
        uint256 maxResults
    ) external view returns (uint256[] memory) {
        uint256[] storage ids = organWaitlists[organNeeded];

        // Collect eligible candidates with their sort keys
        uint256 eligibleCount = 0;
        uint256[] memory tempIds = new uint256[](ids.length);
        uint256[] memory sortKeys = new uint256[](ids.length);

        for (uint256 i = 0; i < ids.length; i++) {
            WaitlistEntry storage e = waitlistEntries[ids[i]];
            if (e.isMatched) continue;

            uint8 compat = _bloodCompatibility(donorBloodType, e.bloodType);
            if (compat == 0) continue; // Incompatible, skip

            // Sort key: [compat 8 bits][urgency 8 bits][inverted waitingSince 240 bits]
            // Higher key = better match
            uint256 invertedWait = type(uint240).max - uint240(e.waitingSince);
            uint256 key = (uint256(compat) << 248) | (uint256(e.urgencyScore) << 240) | invertedWait;

            tempIds[eligibleCount] = ids[i];
            sortKeys[eligibleCount] = key;
            eligibleCount++;
        }

        // Simple insertion sort (waitlists are not expected to be huge)
        for (uint256 i = 1; i < eligibleCount; i++) {
            uint256 keyI = sortKeys[i];
            uint256 idI = tempIds[i];
            uint256 j = i;
            while (j > 0 && sortKeys[j - 1] < keyI) {
                sortKeys[j] = sortKeys[j - 1];
                tempIds[j] = tempIds[j - 1];
                j--;
            }
            sortKeys[j] = keyI;
            tempIds[j] = idI;
        }

        // Return top N
        uint256 resultCount = eligibleCount < maxResults ? eligibleCount : maxResults;
        uint256[] memory results = new uint256[](resultCount);
        for (uint256 i = 0; i < resultCount; i++) {
            results[i] = tempIds[i];
        }
        return results;
    }

    /**
     * @notice Blood type compatibility scoring.
     *         3 = exact match
     *         2 = universal donor (O-) to any recipient
     *         1 = same ABO group, different Rh
     *         0 = incompatible
     */
    function _bloodCompatibility(string memory donor, string memory recipient) internal pure returns (uint8) {
        bytes32 dHash = keccak256(bytes(donor));
        bytes32 rHash = keccak256(bytes(recipient));

        // Exact match
        if (dHash == rHash) return 3;

        // Universal donor O- can donate to anyone
        if (dHash == keccak256("O-")) return 2;

        // Same ABO letter, different Rh (e.g. A+ donor to A- recipient or vice versa)
        // Extract first character(s) before +/-
        bytes memory dBytes = bytes(donor);
        bytes memory rBytes = bytes(recipient);
        if (dBytes.length > 0 && rBytes.length > 0) {
            // Compare ABO portion (everything except the last character which is +/-)
            uint256 dAboLen = dBytes.length - 1;
            uint256 rAboLen = rBytes.length - 1;
            if (dAboLen == rAboLen && dAboLen > 0) {
                bool sameAbo = true;
                for (uint256 i = 0; i < dAboLen; i++) {
                    if (dBytes[i] != rBytes[i]) {
                        sameAbo = false;
                        break;
                    }
                }
                if (sameAbo) return 1;
            }
        }

        return 0;
    }

    function getWaitlistEntry(uint256 entryId) external view returns (WaitlistEntry memory) {
        return waitlistEntries[entryId];
    }

    function getWaitlist(string calldata organNeeded) external view returns (uint256[] memory) {
        return organWaitlists[organNeeded];
    }

    // ── Transplant recording ──

    function recordTransplant(
        address donorAddress,
        address recipientAddress,
        string calldata organ
    ) external onlyHospital nonReentrant {
        require(donors[donorAddress].isActive, "Donor not active");

        _transplantIdCounter++;
        uint256 newId = _transplantIdCounter;

        transplants[newId] = TransplantRecord({
            transplantId: newId,
            donorAddress: donorAddress,
            recipientAddress: recipientAddress,
            organ: organ,
            performedAt: block.timestamp,
            hospitalAddress: msg.sender
        });

        allTransplantIds.push(newId);

        // Mark matching waitlist entries as matched
        uint256[] storage ids = organWaitlists[organ];
        for (uint256 i = 0; i < ids.length; i++) {
            WaitlistEntry storage e = waitlistEntries[ids[i]];
            if (e.patientAddress == recipientAddress && !e.isMatched) {
                e.isMatched = true;
                e.matchedDonor = donorAddress;
                break;
            }
        }

        emit TransplantRecorded(newId, donorAddress, recipientAddress, organ);
    }

    function getTransplantRecord(uint256 transplantId) external view returns (TransplantRecord memory) {
        return transplants[transplantId];
    }

    function getTransplantHistory() external view returns (uint256[] memory) {
        return allTransplantIds;
    }
}
