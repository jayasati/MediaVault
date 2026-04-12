// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MediAccessControl.sol";

contract DoctorReputation is ReentrancyGuard {
    MediAccessControl public accessControl;

    struct Rating {
        uint256 ratingId;
        address patientAddress;
        address doctorAddress;
        uint256 accessRequestId;
        uint8 stars;
        string commentIPFSHash;
        uint256 givenAt;
    }

    struct DoctorProfile {
        address doctorAddress;
        uint256 totalRatings;
        uint256 totalStars;
        uint256 averageRating; // x100 (e.g. 470 = 4.70)
        bool isVerified;
        address verifiedBy;
        string specialization;
        address hospitalAddress;
    }

    uint256 private _ratingIdCounter;

    mapping(address => DoctorProfile) private doctors;
    mapping(uint256 => Rating) private ratings;
    mapping(address => uint256[]) private doctorRatings; // doctor -> ratingIds
    // patient -> doctor -> accessRequestId -> rated
    mapping(address => mapping(address => mapping(uint256 => bool))) private hasRated;

    mapping(address => bool) public hospitalAdmins;

    address[] private allDoctors;

    event DoctorRegistered(address indexed doctor, string specialization);
    event DoctorVerified(address indexed doctor, address indexed verifiedBy);
    event RatingSubmitted(uint256 indexed ratingId, address indexed patient, address indexed doctor, uint8 stars);
    event AverageUpdated(address indexed doctor, uint256 newAverage);

    constructor(address _accessControl) {
        accessControl = MediAccessControl(_accessControl);
    }

    function setHospitalAdmin(address admin, bool status) external {
        // Only existing admins or first-time setup (no admins yet)
        require(hospitalAdmins[msg.sender] || allDoctors.length == 0, "Not authorized");
        hospitalAdmins[admin] = status;
    }

    // -- Doctor Registration --

    function registerDoctor(string calldata specialization, address hospitalAddress) external {
        require(doctors[msg.sender].doctorAddress == address(0), "Already registered");
        require(bytes(specialization).length > 0, "Specialization required");

        doctors[msg.sender] = DoctorProfile({
            doctorAddress: msg.sender,
            totalRatings: 0,
            totalStars: 0,
            averageRating: 0,
            isVerified: false,
            verifiedBy: address(0),
            specialization: specialization,
            hospitalAddress: hospitalAddress
        });

        allDoctors.push(msg.sender);

        emit DoctorRegistered(msg.sender, specialization);
    }

    function verifyDoctor(address doctorAddress) external {
        require(hospitalAdmins[msg.sender], "Not a hospital admin");
        DoctorProfile storage doc = doctors[doctorAddress];
        require(doc.doctorAddress != address(0), "Doctor not registered");
        require(!doc.isVerified, "Already verified");

        doc.isVerified = true;
        doc.verifiedBy = msg.sender;

        emit DoctorVerified(doctorAddress, msg.sender);
    }

    // -- Rating --

    function rateDoctor(
        address doctorAddress,
        uint256 accessRequestId,
        uint8 stars,
        string calldata commentIPFSHash
    ) external nonReentrant {
        require(stars >= 1 && stars <= 5, "Stars must be 1-5");
        require(doctors[doctorAddress].doctorAddress != address(0), "Doctor not registered");
        require(msg.sender != doctorAddress, "Cannot rate yourself");
        require(!hasRated[msg.sender][doctorAddress][accessRequestId], "Already rated for this access");

        // Verify the access request was real and between this patient and doctor
        MediAccessControl.AccessRequest memory req = accessControl.getAccessRequest(accessRequestId);
        require(req.requestId != 0, "Access request does not exist");
        require(req.doctorAddress == doctorAddress, "Doctor mismatch");
        require(req.patientAddress == msg.sender, "Patient mismatch");
        require(uint8(req.status) == 1, "Access was not approved"); // APPROVED = 1

        hasRated[msg.sender][doctorAddress][accessRequestId] = true;

        _ratingIdCounter++;
        uint256 newId = _ratingIdCounter;

        ratings[newId] = Rating({
            ratingId: newId,
            patientAddress: msg.sender,
            doctorAddress: doctorAddress,
            accessRequestId: accessRequestId,
            stars: stars,
            commentIPFSHash: commentIPFSHash,
            givenAt: block.timestamp
        });

        doctorRatings[doctorAddress].push(newId);

        // Update average
        DoctorProfile storage doc = doctors[doctorAddress];
        doc.totalRatings++;
        doc.totalStars += stars;
        doc.averageRating = (doc.totalStars * 100) / doc.totalRatings;

        emit RatingSubmitted(newId, msg.sender, doctorAddress, stars);
        emit AverageUpdated(doctorAddress, doc.averageRating);
    }

    // -- Views --

    function getDoctorProfile(address doctorAddress) external view returns (DoctorProfile memory) {
        return doctors[doctorAddress];
    }

    function getRating(uint256 ratingId) external view returns (Rating memory) {
        return ratings[ratingId];
    }

    function getRatingsForDoctor(address doctorAddress) external view returns (uint256[] memory) {
        return doctorRatings[doctorAddress];
    }

    function isVerifiedDoctor(address doctorAddress) external view returns (bool) {
        return doctors[doctorAddress].isVerified;
    }

    /**
     * @notice Returns top doctors by averageRating for a given specialization.
     *         Uses insertion sort; gas-efficient for reasonable doctor counts.
     */
    function getTopDoctors(string calldata specialization, uint256 limit) external view returns (address[] memory) {
        bytes32 specHash = keccak256(bytes(specialization));

        // Collect matching doctors
        uint256 matchCount = 0;
        for (uint256 i = 0; i < allDoctors.length; i++) {
            DoctorProfile storage d = doctors[allDoctors[i]];
            if (keccak256(bytes(d.specialization)) == specHash && d.totalRatings > 0) {
                matchCount++;
            }
        }

        address[] memory matched = new address[](matchCount);
        uint256[] memory avgRatings = new uint256[](matchCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < allDoctors.length; i++) {
            DoctorProfile storage d = doctors[allDoctors[i]];
            if (keccak256(bytes(d.specialization)) == specHash && d.totalRatings > 0) {
                matched[idx] = allDoctors[i];
                avgRatings[idx] = d.averageRating;
                idx++;
            }
        }

        // Insertion sort descending by averageRating
        for (uint256 i = 1; i < matchCount; i++) {
            uint256 keyRating = avgRatings[i];
            address keyAddr = matched[i];
            uint256 j = i;
            while (j > 0 && avgRatings[j - 1] < keyRating) {
                avgRatings[j] = avgRatings[j - 1];
                matched[j] = matched[j - 1];
                j--;
            }
            avgRatings[j] = keyRating;
            matched[j] = keyAddr;
        }

        // Return top N
        uint256 resultLen = matchCount < limit ? matchCount : limit;
        address[] memory result = new address[](resultLen);
        for (uint256 i = 0; i < resultLen; i++) {
            result[i] = matched[i];
        }
        return result;
    }
}
