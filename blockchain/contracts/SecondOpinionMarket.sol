// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MEDIToken.sol";

/**
 * @title SecondOpinionMarket
 * @notice Commit-reveal marketplace for medical second opinions.
 *
 * FLOW:
 *  1. Patient posts a request with a MEDI bounty (tokens transferred to contract).
 *  2. Doctors COMMIT a hash = keccak256(abi.encodePacked(opinionIPFSHash, salt))
 *     before the commit deadline.  No one can see the content yet.
 *  3. After the commit deadline, doctors REVEAL their opinion + salt.
 *     The contract verifies hash(opinion + salt) == stored commit hash.
 *  4. After the reveal deadline the patient SELECTS a winner.
 *     - 95% of bounty goes to the winning doctor.
 *     - 5% platform fee goes to contract owner.
 *  5. If no commits arrive, the patient can CANCEL and reclaim the bounty.
 */
contract SecondOpinionMarket is Ownable, ReentrancyGuard {
    MEDIToken public mediToken;

    uint256 public constant PLATFORM_FEE_BPS = 500; // 5%
    uint256 public constant REVEAL_WINDOW = 2 days;

    struct OpinionRequest {
        uint256 requestId;
        address patientAddress;
        string caseIPFSHash;
        uint256 bountyAmount;
        uint256 deadline;         // commit deadline
        uint256 revealDeadline;   // deadline + REVEAL_WINDOW
        bool isOpen;
        uint256 selectedOpinionId;
    }

    struct OpinionCommit {
        uint256 commitId;
        address doctorAddress;
        uint256 requestId;
        bytes32 commitHash;
        string revealedIPFSHash;
        string salt;
        bool isRevealed;
        bool isSelected;
    }

    uint256 private _requestIdCounter;
    uint256 private _commitIdCounter;

    mapping(uint256 => OpinionRequest) private requests;
    mapping(uint256 => OpinionCommit) private commits;
    mapping(uint256 => uint256[]) private requestCommits; // requestId → commitIds
    mapping(uint256 => mapping(address => bool)) private hasCommitted; // requestId → doctor → bool

    uint256[] private openRequestIds;

    event RequestPosted(uint256 indexed requestId, address indexed patient, uint256 bounty, uint256 deadline);
    event OpinionCommitted(uint256 indexed commitId, uint256 indexed requestId, address indexed doctor);
    event OpinionRevealed(uint256 indexed commitId, uint256 indexed requestId, address indexed doctor);
    event OpinionSelected(uint256 indexed requestId, uint256 indexed commitId, address indexed doctor);
    event BountyPaid(uint256 indexed requestId, address indexed doctor, uint256 doctorAmount, uint256 platformFee);
    event RequestCancelled(uint256 indexed requestId, address indexed patient, uint256 refundAmount);

    constructor(address _mediToken) Ownable(msg.sender) {
        mediToken = MEDIToken(_mediToken);
    }

    // ── Post request ──

    function postRequest(
        string calldata caseIPFSHash,
        uint256 bountyAmount,
        uint256 durationHours
    ) external nonReentrant {
        require(bytes(caseIPFSHash).length > 0, "Case IPFS hash required");
        require(bountyAmount > 0, "Bounty must be greater than zero");
        require(durationHours > 0, "Duration must be at least 1 hour");

        // Transfer MEDI from patient to this contract (escrow)
        require(
            mediToken.transferFrom(msg.sender, address(this), bountyAmount),
            "Token transfer failed"
        );

        _requestIdCounter++;
        uint256 newId = _requestIdCounter;
        uint256 commitDeadline = block.timestamp + (durationHours * 1 hours);

        requests[newId] = OpinionRequest({
            requestId: newId,
            patientAddress: msg.sender,
            caseIPFSHash: caseIPFSHash,
            bountyAmount: bountyAmount,
            deadline: commitDeadline,
            revealDeadline: commitDeadline + REVEAL_WINDOW,
            isOpen: true,
            selectedOpinionId: 0
        });

        openRequestIds.push(newId);

        emit RequestPosted(newId, msg.sender, bountyAmount, commitDeadline);
    }

    // ── Commit ──

    function commitOpinion(uint256 requestId, bytes32 commitHash) external {
        OpinionRequest storage req = requests[requestId];
        require(req.requestId != 0, "Request does not exist");
        require(req.isOpen, "Request is not open");
        require(block.timestamp <= req.deadline, "Commit deadline passed");
        require(msg.sender != req.patientAddress, "Patient cannot commit opinion");
        require(!hasCommitted[requestId][msg.sender], "Already committed to this request");
        require(commitHash != bytes32(0), "Invalid commit hash");

        _commitIdCounter++;
        uint256 newId = _commitIdCounter;

        commits[newId] = OpinionCommit({
            commitId: newId,
            doctorAddress: msg.sender,
            requestId: requestId,
            commitHash: commitHash,
            revealedIPFSHash: "",
            salt: "",
            isRevealed: false,
            isSelected: false
        });

        requestCommits[requestId].push(newId);
        hasCommitted[requestId][msg.sender] = true;

        emit OpinionCommitted(newId, requestId, msg.sender);
    }

    // ── Reveal ──

    function revealOpinion(
        uint256 commitId,
        string calldata opinionIPFSHash,
        string calldata salt
    ) external {
        OpinionCommit storage c = commits[commitId];
        require(c.commitId != 0, "Commit does not exist");
        require(msg.sender == c.doctorAddress, "Not your commit");
        require(!c.isRevealed, "Already revealed");

        OpinionRequest storage req = requests[c.requestId];
        require(block.timestamp > req.deadline, "Commit phase not ended");
        require(block.timestamp <= req.revealDeadline, "Reveal deadline passed");

        // Verify hash integrity
        bytes32 computed = keccak256(abi.encodePacked(opinionIPFSHash, salt));
        require(computed == c.commitHash, "Hash mismatch - invalid reveal");

        c.revealedIPFSHash = opinionIPFSHash;
        c.salt = salt;
        c.isRevealed = true;

        emit OpinionRevealed(commitId, c.requestId, msg.sender);
    }

    // ── Select winner ──

    function selectOpinion(uint256 requestId, uint256 commitId) external nonReentrant {
        OpinionRequest storage req = requests[requestId];
        require(req.requestId != 0, "Request does not exist");
        require(msg.sender == req.patientAddress, "Only patient can select");
        require(req.isOpen, "Request is not open");
        require(block.timestamp > req.revealDeadline, "Reveal phase not ended");

        OpinionCommit storage c = commits[commitId];
        require(c.requestId == requestId, "Commit does not belong to this request");
        require(c.isRevealed, "Opinion not revealed");

        // Mark selection
        c.isSelected = true;
        req.selectedOpinionId = commitId;
        req.isOpen = false;

        // Calculate payouts
        uint256 platformFee = (req.bountyAmount * PLATFORM_FEE_BPS) / 10000;
        uint256 doctorPayout = req.bountyAmount - platformFee;

        // Transfer tokens
        require(mediToken.transfer(c.doctorAddress, doctorPayout), "Doctor payout failed");
        if (platformFee > 0) {
            require(mediToken.transfer(owner(), platformFee), "Platform fee transfer failed");
        }

        emit OpinionSelected(requestId, commitId, c.doctorAddress);
        emit BountyPaid(requestId, c.doctorAddress, doctorPayout, platformFee);
    }

    // ── Cancel ──

    function cancelRequest(uint256 requestId) external nonReentrant {
        OpinionRequest storage req = requests[requestId];
        require(req.requestId != 0, "Request does not exist");
        require(msg.sender == req.patientAddress, "Only patient can cancel");
        require(req.isOpen, "Request is not open");
        require(requestCommits[requestId].length == 0, "Cannot cancel - commits exist");

        req.isOpen = false;

        // Refund bounty
        require(mediToken.transfer(msg.sender, req.bountyAmount), "Refund failed");

        emit RequestCancelled(requestId, msg.sender, req.bountyAmount);
    }

    // ── Views ──

    function getRequest(uint256 requestId) external view returns (OpinionRequest memory) {
        return requests[requestId];
    }

    function getCommit(uint256 commitId) external view returns (OpinionCommit memory) {
        return commits[commitId];
    }

    function getOpenRequests() external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < openRequestIds.length; i++) {
            if (requests[openRequestIds[i]].isOpen) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < openRequestIds.length; i++) {
            if (requests[openRequestIds[i]].isOpen) {
                result[idx] = openRequestIds[i];
                idx++;
            }
        }
        return result;
    }

    function getCommitsForRequest(uint256 requestId) external view returns (uint256[] memory) {
        return requestCommits[requestId];
    }

    function getRevealedOpinions(uint256 requestId) external view returns (uint256[] memory) {
        OpinionRequest storage req = requests[requestId];
        // Only return revealed opinions after reveal deadline
        if (block.timestamp <= req.revealDeadline) {
            return new uint256[](0);
        }

        uint256[] storage cids = requestCommits[requestId];
        uint256 count = 0;
        for (uint256 i = 0; i < cids.length; i++) {
            if (commits[cids[i]].isRevealed) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < cids.length; i++) {
            if (commits[cids[i]].isRevealed) {
                result[idx] = cids[i];
                idx++;
            }
        }
        return result;
    }
}
