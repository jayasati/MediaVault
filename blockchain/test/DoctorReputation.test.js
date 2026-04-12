const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DoctorReputation", function () {
  let registry, accessControl, reputation;
  let owner, hospitalAdmin, doctor1, doctor2, doctor3, patient1, patient2, stranger;

  beforeEach(async function () {
    [owner, hospitalAdmin, doctor1, doctor2, doctor3, patient1, patient2, stranger] =
      await ethers.getSigners();

    // Deploy PatientRegistry
    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    registry = await PatientRegistry.deploy();

    // Deploy MediAccessControl
    const MediAccessControl = await ethers.getContractFactory("MediAccessControl");
    accessControl = await MediAccessControl.deploy(await registry.getAddress());

    // Deploy DoctorReputation
    const DoctorReputation = await ethers.getContractFactory("DoctorReputation");
    reputation = await DoctorReputation.deploy(await accessControl.getAddress());

    // Setup hospital admin (first call allowed since no doctors exist)
    await reputation.setHospitalAdmin(hospitalAdmin.address, true);

    // Register patients
    await registry.connect(patient1).registerPatient("QmP1", "O+", "QmA1", "QmE1");
    await registry.connect(patient2).registerPatient("QmP2", "A+", "QmA2", "QmE2");
  });

  // Helper: set up doctor with approved access from a patient
  async function setupDoctorWithAccess(doctor, patient) {
    // Register doctor
    await reputation.connect(doctor).registerDoctor("Cardiology", hospitalAdmin.address);
    // Doctor requests access
    await accessControl.connect(doctor).requestAccess(patient.address, "Consultation");
    // Patient approves
    const myRequests = await accessControl.getMyAccessRequests();
    // Find the latest request for this doctor
    let requestId;
    for (const id of myRequests) {
      const req = await accessControl.getAccessRequest(id);
      if (req.doctorAddress === doctor.address && req.patientAddress === patient.address) {
        requestId = id;
      }
    }
    // If no request found via doctor's view, get from pending
    if (!requestId) {
      const pending = await accessControl.getPendingRequestsForPatient(patient.address);
      requestId = pending[pending.length - 1];
    }
    await accessControl.connect(patient).approveAccess(requestId, 30);
    return requestId;
  }

  // -- Doctor Registration --

  describe("Doctor Registration", function () {
    it("should register a doctor", async function () {
      await reputation.connect(doctor1).registerDoctor("Cardiology", hospitalAdmin.address);
      const profile = await reputation.getDoctorProfile(doctor1.address);
      expect(profile.doctorAddress).to.equal(doctor1.address);
      expect(profile.specialization).to.equal("Cardiology");
      expect(profile.totalRatings).to.equal(0);
      expect(profile.averageRating).to.equal(0);
      expect(profile.isVerified).to.be.false;
    });

    it("should emit DoctorRegistered event", async function () {
      await expect(reputation.connect(doctor1).registerDoctor("Neurology", hospitalAdmin.address))
        .to.emit(reputation, "DoctorRegistered")
        .withArgs(doctor1.address, "Neurology");
    });

    it("should reject duplicate registration", async function () {
      await reputation.connect(doctor1).registerDoctor("Cardiology", hospitalAdmin.address);
      await expect(
        reputation.connect(doctor1).registerDoctor("Neurology", hospitalAdmin.address)
      ).to.be.revertedWith("Already registered");
    });

    it("should reject empty specialization", async function () {
      await expect(
        reputation.connect(doctor1).registerDoctor("", hospitalAdmin.address)
      ).to.be.revertedWith("Specialization required");
    });
  });

  // -- Doctor Verification --

  describe("Doctor Verification", function () {
    beforeEach(async function () {
      await reputation.connect(doctor1).registerDoctor("Cardiology", hospitalAdmin.address);
    });

    it("should verify doctor by hospital admin", async function () {
      await reputation.connect(hospitalAdmin).verifyDoctor(doctor1.address);
      const profile = await reputation.getDoctorProfile(doctor1.address);
      expect(profile.isVerified).to.be.true;
      expect(profile.verifiedBy).to.equal(hospitalAdmin.address);
    });

    it("should emit DoctorVerified event", async function () {
      await expect(reputation.connect(hospitalAdmin).verifyDoctor(doctor1.address))
        .to.emit(reputation, "DoctorVerified")
        .withArgs(doctor1.address, hospitalAdmin.address);
    });

    it("should reject verification from non-admin", async function () {
      await expect(
        reputation.connect(stranger).verifyDoctor(doctor1.address)
      ).to.be.revertedWith("Not a hospital admin");
    });

    it("should reject double verification", async function () {
      await reputation.connect(hospitalAdmin).verifyDoctor(doctor1.address);
      await expect(
        reputation.connect(hospitalAdmin).verifyDoctor(doctor1.address)
      ).to.be.revertedWith("Already verified");
    });

    it("should reject verification of unregistered doctor", async function () {
      await expect(
        reputation.connect(hospitalAdmin).verifyDoctor(stranger.address)
      ).to.be.revertedWith("Doctor not registered");
    });

    it("isVerifiedDoctor should return correct status", async function () {
      expect(await reputation.isVerifiedDoctor(doctor1.address)).to.be.false;
      await reputation.connect(hospitalAdmin).verifyDoctor(doctor1.address);
      expect(await reputation.isVerifiedDoctor(doctor1.address)).to.be.true;
    });
  });

  // -- Rating --

  describe("Rating with Valid Access Proof", function () {
    let accessRequestId;

    beforeEach(async function () {
      accessRequestId = await setupDoctorWithAccess(doctor1, patient1);
    });

    it("should allow patient to rate doctor", async function () {
      await reputation.connect(patient1).rateDoctor(doctor1.address, accessRequestId, 5, "QmGreatDoc");
      const profile = await reputation.getDoctorProfile(doctor1.address);
      expect(profile.totalRatings).to.equal(1);
      expect(profile.totalStars).to.equal(5);
      expect(profile.averageRating).to.equal(500); // 5.00 * 100
    });

    it("should emit RatingSubmitted and AverageUpdated events", async function () {
      const tx = reputation.connect(patient1).rateDoctor(doctor1.address, accessRequestId, 4, "");
      await expect(tx).to.emit(reputation, "RatingSubmitted").withArgs(1, patient1.address, doctor1.address, 4);
      await expect(tx).to.emit(reputation, "AverageUpdated").withArgs(doctor1.address, 400);
    });

    it("should store rating details", async function () {
      await reputation.connect(patient1).rateDoctor(doctor1.address, accessRequestId, 3, "QmComment");
      const rating = await reputation.getRating(1);
      expect(rating.patientAddress).to.equal(patient1.address);
      expect(rating.doctorAddress).to.equal(doctor1.address);
      expect(rating.accessRequestId).to.equal(accessRequestId);
      expect(rating.stars).to.equal(3);
      expect(rating.commentIPFSHash).to.equal("QmComment");
    });

    it("should track ratings per doctor", async function () {
      await reputation.connect(patient1).rateDoctor(doctor1.address, accessRequestId, 5, "");
      const ids = await reputation.getRatingsForDoctor(doctor1.address);
      expect(ids.length).to.equal(1);
    });
  });

  // -- Duplicate Rating Prevention --

  describe("Duplicate Rating Prevention", function () {
    let accessRequestId;

    beforeEach(async function () {
      accessRequestId = await setupDoctorWithAccess(doctor1, patient1);
    });

    it("should reject duplicate rating for same access request", async function () {
      await reputation.connect(patient1).rateDoctor(doctor1.address, accessRequestId, 5, "");
      await expect(
        reputation.connect(patient1).rateDoctor(doctor1.address, accessRequestId, 1, "")
      ).to.be.revertedWith("Already rated for this access");
    });

    it("should allow same patient to rate same doctor for different access requests", async function () {
      // First interaction already set up
      await reputation.connect(patient1).rateDoctor(doctor1.address, accessRequestId, 5, "");

      // New access request cycle
      await accessControl.connect(patient1).revokeAccess(accessRequestId);
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Follow-up");
      const pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      const newRequestId = pending[0];
      await accessControl.connect(patient1).approveAccess(newRequestId, 30);

      await reputation.connect(patient1).rateDoctor(doctor1.address, newRequestId, 4, "");
      const profile = await reputation.getDoctorProfile(doctor1.address);
      expect(profile.totalRatings).to.equal(2);
    });
  });

  // -- Invalid Access Proof --

  describe("Invalid Access Proof", function () {
    beforeEach(async function () {
      await reputation.connect(doctor1).registerDoctor("Cardiology", hospitalAdmin.address);
    });

    it("should reject rating with non-existent access request", async function () {
      await expect(
        reputation.connect(patient1).rateDoctor(doctor1.address, 999, 5, "")
      ).to.be.revertedWith("Access request does not exist");
    });

    it("should reject if access request doctor does not match", async function () {
      // Create access between doctor1 and patient1
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Reason");
      const pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(pending[0], 30);

      // Register doctor2, try to use doctor1's access proof to rate doctor2
      await reputation.connect(doctor2).registerDoctor("Dermatology", hospitalAdmin.address);
      await expect(
        reputation.connect(patient1).rateDoctor(doctor2.address, pending[0], 5, "")
      ).to.be.revertedWith("Doctor mismatch");
    });

    it("should reject if caller is not the patient in the access request", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Reason");
      const pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(pending[0], 30);

      // patient2 tries to rate using patient1's access
      await expect(
        reputation.connect(patient2).rateDoctor(doctor1.address, pending[0], 5, "")
      ).to.be.revertedWith("Patient mismatch");
    });

    it("should reject if access request was not approved", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Reason");
      const pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      // Don't approve -- reject instead
      await accessControl.connect(patient1).rejectAccess(pending[0]);

      await expect(
        reputation.connect(patient1).rateDoctor(doctor1.address, pending[0], 5, "")
      ).to.be.revertedWith("Access was not approved");
    });

    it("should reject self-rating", async function () {
      await expect(
        reputation.connect(doctor1).rateDoctor(doctor1.address, 1, 5, "")
      ).to.be.revertedWith("Cannot rate yourself");
    });

    it("should reject invalid star count", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Reason");
      const pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(pending[0], 30);

      await expect(
        reputation.connect(patient1).rateDoctor(doctor1.address, pending[0], 0, "")
      ).to.be.revertedWith("Stars must be 1-5");
      await expect(
        reputation.connect(patient1).rateDoctor(doctor1.address, pending[0], 6, "")
      ).to.be.revertedWith("Stars must be 1-5");
    });

    it("should reject rating unregistered doctor", async function () {
      await expect(
        reputation.connect(patient1).rateDoctor(stranger.address, 1, 5, "")
      ).to.be.revertedWith("Doctor not registered");
    });
  });

  // -- Average Calculation Accuracy --

  describe("Average Calculation Accuracy", function () {
    beforeEach(async function () {
      // Register doctor1 and set up access from two patients
      await reputation.connect(doctor1).registerDoctor("Cardiology", hospitalAdmin.address);
    });

    it("should calculate average correctly for single rating", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "R1");
      const p1 = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(p1[0], 30);

      await reputation.connect(patient1).rateDoctor(doctor1.address, p1[0], 4, "");
      const profile = await reputation.getDoctorProfile(doctor1.address);
      expect(profile.averageRating).to.equal(400); // 4.00
    });

    it("should calculate average correctly for multiple ratings", async function () {
      // Patient1 rates 5 stars
      await accessControl.connect(doctor1).requestAccess(patient1.address, "R1");
      let pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(pending[0], 30);
      await reputation.connect(patient1).rateDoctor(doctor1.address, pending[0], 5, "");

      // Patient2 rates 3 stars
      await accessControl.connect(doctor1).requestAccess(patient2.address, "R2");
      pending = await accessControl.getPendingRequestsForPatient(patient2.address);
      await accessControl.connect(patient2).approveAccess(pending[0], 30);
      await reputation.connect(patient2).rateDoctor(doctor1.address, pending[0], 3, "");

      const profile = await reputation.getDoctorProfile(doctor1.address);
      // (5 + 3) / 2 = 4.00 => 400
      expect(profile.totalRatings).to.equal(2);
      expect(profile.totalStars).to.equal(8);
      expect(profile.averageRating).to.equal(400);
    });

    it("should handle decimal averages (x100)", async function () {
      // 3 ratings: 5, 5, 4 => avg = 14/3 = 4.666... => 466 (integer division)
      await accessControl.connect(doctor1).requestAccess(patient1.address, "R1");
      let pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(pending[0], 30);
      await reputation.connect(patient1).rateDoctor(doctor1.address, pending[0], 5, "");

      await accessControl.connect(doctor1).requestAccess(patient2.address, "R2");
      pending = await accessControl.getPendingRequestsForPatient(patient2.address);
      await accessControl.connect(patient2).approveAccess(pending[0], 30);
      await reputation.connect(patient2).rateDoctor(doctor1.address, pending[0], 5, "");

      // Need a third patient for third rating
      // Revoke patient1's access, re-request
      await accessControl.connect(patient1).revokeAccess(1);
      await accessControl.connect(doctor1).requestAccess(patient1.address, "R3");
      pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(pending[0], 30);
      await reputation.connect(patient1).rateDoctor(doctor1.address, pending[0], 4, "");

      const profile = await reputation.getDoctorProfile(doctor1.address);
      // (5+5+4)*100 / 3 = 1400/3 = 466
      expect(profile.averageRating).to.equal(466);
    });

    it("should calculate 1-star average correctly", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "R1");
      const pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(pending[0], 30);
      await reputation.connect(patient1).rateDoctor(doctor1.address, pending[0], 1, "");

      const profile = await reputation.getDoctorProfile(doctor1.address);
      expect(profile.averageRating).to.equal(100);
    });
  });

  // -- Top Doctors --

  describe("Top Doctors Ranking", function () {
    beforeEach(async function () {
      // Register 3 cardiologists
      await reputation.connect(doctor1).registerDoctor("Cardiology", hospitalAdmin.address);
      await reputation.connect(doctor2).registerDoctor("Cardiology", hospitalAdmin.address);
      await reputation.connect(doctor3).registerDoctor("Neurology", hospitalAdmin.address);

      // Doctor1: rated 5 by patient1
      await accessControl.connect(doctor1).requestAccess(patient1.address, "R");
      let p = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(p[0], 30);
      await reputation.connect(patient1).rateDoctor(doctor1.address, p[0], 5, "");

      // Doctor2: rated 3 by patient1
      await accessControl.connect(doctor2).requestAccess(patient1.address, "R");
      p = await accessControl.getPendingRequestsForPatient(patient1.address);
      await accessControl.connect(patient1).approveAccess(p[0], 30);
      await reputation.connect(patient1).rateDoctor(doctor2.address, p[0], 3, "");

      // Doctor3 (Neurology): rated 4 by patient2
      await accessControl.connect(doctor3).requestAccess(patient2.address, "R");
      p = await accessControl.getPendingRequestsForPatient(patient2.address);
      await accessControl.connect(patient2).approveAccess(p[0], 30);
      await reputation.connect(patient2).rateDoctor(doctor3.address, p[0], 4, "");
    });

    it("should return top cardiologists sorted by rating", async function () {
      const top = await reputation.getTopDoctors("Cardiology", 10);
      expect(top.length).to.equal(2);
      expect(top[0]).to.equal(doctor1.address); // 5.00
      expect(top[1]).to.equal(doctor2.address); // 3.00
    });

    it("should filter by specialization", async function () {
      const neuro = await reputation.getTopDoctors("Neurology", 10);
      expect(neuro.length).to.equal(1);
      expect(neuro[0]).to.equal(doctor3.address);
    });

    it("should respect limit parameter", async function () {
      const top = await reputation.getTopDoctors("Cardiology", 1);
      expect(top.length).to.equal(1);
      expect(top[0]).to.equal(doctor1.address);
    });

    it("should return empty for specialization with no ratings", async function () {
      const top = await reputation.getTopDoctors("Dermatology", 10);
      expect(top.length).to.equal(0);
    });

    it("should exclude doctors with zero ratings", async function () {
      // Register another cardiologist but don't rate
      await reputation.connect(stranger).registerDoctor("Cardiology", hospitalAdmin.address);
      const top = await reputation.getTopDoctors("Cardiology", 10);
      // Should still only have 2 (the rated ones)
      expect(top.length).to.equal(2);
    });
  });
});
