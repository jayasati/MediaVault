// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RoleManager.sol";

/**
 * @title AppointmentSystem
 * @notice Public doctor directory + appointment booking.
 *
 * FEATURES:
 *  - Verified doctors self-list with city, specialization, bio, fee.
 *  - Patients search by city, specialization, or both.
 *  - Patients book appointments; doctors confirm/reject.
 *  - Appointments lifecycle: REQUESTED → CONFIRMED → COMPLETED | CANCELLED | REJECTED.
 *  - All name / hospital-level search is done off-chain using the returned address list.
 */
contract AppointmentSystem is ReentrancyGuard {
    RoleManager public roleManager;

    struct DoctorProfile {
        address wallet;
        string name;
        string specialization;
        bytes32 cityHash;
        string cityDisplay;
        bytes32 hospitalId;
        string bio;
        uint256 consultationFeeMEDI;
        bool isListed;
        uint256 listedAt;
    }

    enum AppointmentStatus { REQUESTED, CONFIRMED, REJECTED, COMPLETED, CANCELLED }

    struct Appointment {
        uint256 appointmentId;
        address patient;
        address doctor;
        uint256 requestedAt;
        uint256 scheduledFor;
        uint256 completedAt;
        AppointmentStatus status;
        string reason;
        string notes;
    }

    mapping(address => DoctorProfile) private profiles;
    mapping(bytes32 => address[]) private doctorsByCity;
    mapping(bytes32 => address[]) private doctorsBySpecialization;
    address[] private allListedDoctors;

    uint256 private _appointmentIdCounter;
    mapping(uint256 => Appointment) private appointments;
    mapping(address => uint256[]) private patientAppointments;
    mapping(address => uint256[]) private doctorAppointments;

    event ProfileCreated(address indexed doctor, bytes32 indexed cityHash, bytes32 indexed specializationHash);
    event ProfileUpdated(address indexed doctor);
    event ProfileDelisted(address indexed doctor);
    event AppointmentRequested(uint256 indexed id, address indexed patient, address indexed doctor, uint256 scheduledFor);
    event AppointmentConfirmed(uint256 indexed id);
    event AppointmentRejected(uint256 indexed id, string reason);
    event AppointmentCompleted(uint256 indexed id);
    event AppointmentCancelled(uint256 indexed id, address by);

    constructor(address _roleManager) {
        roleManager = RoleManager(_roleManager);
    }

    // ── Doctor profile ──

    function createProfile(
        string calldata name,
        string calldata specialization,
        string calldata city,
        string calldata bio,
        uint256 consultationFeeMEDI
    ) external {
        require(
            roleManager.getRole(msg.sender) == RoleManager.Role.DOCTOR,
            "Only registered doctor"
        );
        require(!profiles[msg.sender].isListed, "Already listed");
        require(bytes(name).length > 0, "Name required");
        require(bytes(city).length > 0, "City required");
        require(bytes(specialization).length > 0, "Specialization required");

        RoleManager.UserRole memory user = roleManager.getUserDetails(msg.sender);

        bytes32 cityHash = keccak256(bytes(_toLower(city)));
        bytes32 specHash = keccak256(bytes(_toLower(specialization)));

        profiles[msg.sender] = DoctorProfile({
            wallet: msg.sender,
            name: name,
            specialization: specialization,
            cityHash: cityHash,
            cityDisplay: city,
            hospitalId: user.hospitalId,
            bio: bio,
            consultationFeeMEDI: consultationFeeMEDI,
            isListed: true,
            listedAt: block.timestamp
        });

        doctorsByCity[cityHash].push(msg.sender);
        doctorsBySpecialization[specHash].push(msg.sender);
        allListedDoctors.push(msg.sender);

        emit ProfileCreated(msg.sender, cityHash, specHash);
    }

    function updateProfile(string calldata bio, uint256 consultationFeeMEDI) external {
        require(profiles[msg.sender].isListed, "Not listed");
        profiles[msg.sender].bio = bio;
        profiles[msg.sender].consultationFeeMEDI = consultationFeeMEDI;
        emit ProfileUpdated(msg.sender);
    }

    function delistProfile() external {
        require(profiles[msg.sender].isListed, "Not listed");
        profiles[msg.sender].isListed = false;
        emit ProfileDelisted(msg.sender);
    }

    // ── Appointment booking ──

    function bookAppointment(
        address doctor,
        uint256 scheduledFor,
        string calldata reason
    ) external nonReentrant returns (uint256) {
        require(
            roleManager.getRole(msg.sender) == RoleManager.Role.PATIENT,
            "Only patients can book"
        );
        require(profiles[doctor].isListed, "Doctor not available");
        require(scheduledFor > block.timestamp, "Must schedule in future");
        require(bytes(reason).length > 0, "Reason required");

        _appointmentIdCounter++;
        uint256 newId = _appointmentIdCounter;

        appointments[newId] = Appointment({
            appointmentId: newId,
            patient: msg.sender,
            doctor: doctor,
            requestedAt: block.timestamp,
            scheduledFor: scheduledFor,
            completedAt: 0,
            status: AppointmentStatus.REQUESTED,
            reason: reason,
            notes: ""
        });

        patientAppointments[msg.sender].push(newId);
        doctorAppointments[doctor].push(newId);

        emit AppointmentRequested(newId, msg.sender, doctor, scheduledFor);
        return newId;
    }

    function confirmAppointment(uint256 appointmentId) external {
        Appointment storage apt = appointments[appointmentId];
        require(apt.appointmentId != 0, "Does not exist");
        require(msg.sender == apt.doctor, "Only doctor can confirm");
        require(apt.status == AppointmentStatus.REQUESTED, "Not requested");
        apt.status = AppointmentStatus.CONFIRMED;
        emit AppointmentConfirmed(appointmentId);
    }

    function rejectAppointment(uint256 appointmentId, string calldata reason) external {
        Appointment storage apt = appointments[appointmentId];
        require(apt.appointmentId != 0, "Does not exist");
        require(msg.sender == apt.doctor, "Only doctor can reject");
        require(apt.status == AppointmentStatus.REQUESTED, "Not requested");
        apt.status = AppointmentStatus.REJECTED;
        apt.notes = reason;
        emit AppointmentRejected(appointmentId, reason);
    }

    function completeAppointment(uint256 appointmentId, string calldata notes) external {
        Appointment storage apt = appointments[appointmentId];
        require(apt.appointmentId != 0, "Does not exist");
        require(msg.sender == apt.doctor, "Only doctor can complete");
        require(apt.status == AppointmentStatus.CONFIRMED, "Not confirmed");
        apt.status = AppointmentStatus.COMPLETED;
        apt.completedAt = block.timestamp;
        apt.notes = notes;
        emit AppointmentCompleted(appointmentId);
    }

    function cancelAppointment(uint256 appointmentId) external {
        Appointment storage apt = appointments[appointmentId];
        require(apt.appointmentId != 0, "Does not exist");
        require(msg.sender == apt.patient || msg.sender == apt.doctor, "Not authorized");
        require(
            apt.status == AppointmentStatus.REQUESTED || apt.status == AppointmentStatus.CONFIRMED,
            "Cannot cancel in current state"
        );
        apt.status = AppointmentStatus.CANCELLED;
        emit AppointmentCancelled(appointmentId, msg.sender);
    }

    // ── Search ──

    function searchByCity(string calldata city) external view returns (address[] memory) {
        bytes32 cityHash = keccak256(bytes(_toLower(city)));
        return _filterListed(doctorsByCity[cityHash]);
    }

    function searchBySpecialization(string calldata specialization) external view returns (address[] memory) {
        bytes32 specHash = keccak256(bytes(_toLower(specialization)));
        return _filterListed(doctorsBySpecialization[specHash]);
    }

    function searchByCityAndSpecialization(
        string calldata city,
        string calldata specialization
    ) external view returns (address[] memory) {
        bytes32 cityHash = keccak256(bytes(_toLower(city)));
        bytes32 specHash = keccak256(bytes(_toLower(specialization)));

        address[] storage cityList = doctorsByCity[cityHash];
        uint256 count = 0;
        for (uint256 i = 0; i < cityList.length; i++) {
            DoctorProfile storage p = profiles[cityList[i]];
            if (p.isListed && keccak256(bytes(_toLower(p.specialization))) == specHash) {
                count++;
            }
        }

        address[] memory result = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < cityList.length; i++) {
            DoctorProfile storage p = profiles[cityList[i]];
            if (p.isListed && keccak256(bytes(_toLower(p.specialization))) == specHash) {
                result[idx] = cityList[i];
                idx++;
            }
        }
        return result;
    }

    function getAllDoctors() external view returns (address[] memory) {
        return _filterListed(allListedDoctors);
    }

    function _filterListed(address[] storage list) internal view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < list.length; i++) {
            if (profiles[list[i]].isListed) count++;
        }
        address[] memory result = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < list.length; i++) {
            if (profiles[list[i]].isListed) {
                result[idx] = list[i];
                idx++;
            }
        }
        return result;
    }

    function getProfile(address doctor) external view returns (DoctorProfile memory) {
        return profiles[doctor];
    }

    function getAppointment(uint256 id) external view returns (Appointment memory) {
        return appointments[id];
    }

    function getPatientAppointments(address patient) external view returns (uint256[] memory) {
        return patientAppointments[patient];
    }

    function getDoctorAppointments(address doctor) external view returns (uint256[] memory) {
        return doctorAppointments[doctor];
    }

    // ── Utilities ──

    function _toLower(string memory str) internal pure returns (string memory) {
        bytes memory bStr = bytes(str);
        bytes memory bLower = new bytes(bStr.length);
        for (uint256 i = 0; i < bStr.length; i++) {
            if ((uint8(bStr[i]) >= 65) && (uint8(bStr[i]) <= 90)) {
                bLower[i] = bytes1(uint8(bStr[i]) + 32);
            } else {
                bLower[i] = bStr[i];
            }
        }
        return string(bLower);
    }
}
