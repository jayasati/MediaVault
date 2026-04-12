const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("MediAccessControl", function () {
  let registry, accessControl;
  let owner, doctor1, doctor2, patient1, patient2, stranger;

  const DAY = 86400;

  beforeEach(async function () {
    [owner, doctor1, doctor2, patient1, patient2, stranger] = await ethers.getSigners();

    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    registry = await PatientRegistry.deploy();

    const MediAccessControl = await ethers.getContractFactory("MediAccessControl");
    accessControl = await MediAccessControl.deploy(await registry.getAddress());

    // Register patients
    await registry.connect(patient1).registerPatient("QmName1", "O+", "QmAllergies1", "QmIPFS1");
    await registry.connect(patient2).registerPatient("QmName2", "A-", "QmAllergies2", "QmIPFS2");
  });

  describe("Requesting Access", function () {
    it("should create an access request", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Annual checkup");
      const req = await accessControl.getAccessRequest(1);
      expect(req.requestId).to.equal(1);
      expect(req.doctorAddress).to.equal(doctor1.address);
      expect(req.patientAddress).to.equal(patient1.address);
      expect(req.reason).to.equal("Annual checkup");
      expect(req.status).to.equal(0); // PENDING
    });

    it("should emit AccessRequested event", async function () {
      await expect(accessControl.connect(doctor1).requestAccess(patient1.address, "Checkup"))
        .to.emit(accessControl, "AccessRequested")
        .withArgs(1, doctor1.address, patient1.address);
    });

    it("should reject request to own records", async function () {
      await expect(
        accessControl.connect(patient1).requestAccess(patient1.address, "Self")
      ).to.be.revertedWith("Cannot request access to own records");
    });

    it("should reject request for unregistered patient", async function () {
      await expect(
        accessControl.connect(doctor1).requestAccess(stranger.address, "Reason")
      ).to.be.revertedWith("Patient is not registered or active");
    });

    it("should reject duplicate pending request", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "First");
      await expect(
        accessControl.connect(doctor1).requestAccess(patient1.address, "Second")
      ).to.be.revertedWith("A pending request already exists");
    });

    it("should allow new request after previous was rejected", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "First");
      await accessControl.connect(patient1).rejectAccess(1);
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Second try");
      const req = await accessControl.getAccessRequest(2);
      expect(req.status).to.equal(0); // PENDING
    });

    it("should reject request if active access already granted", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "First");
      await accessControl.connect(patient1).approveAccess(1, 30);
      await expect(
        accessControl.connect(doctor1).requestAccess(patient1.address, "Again")
      ).to.be.revertedWith("Active access already granted");
    });

    it("should track requests per doctor", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Reason1");
      await accessControl.connect(doctor1).requestAccess(patient2.address, "Reason2");
      const ids = await accessControl.connect(doctor1).getMyAccessRequests();
      expect(ids.length).to.equal(2);
    });
  });

  describe("Approving Access", function () {
    beforeEach(async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Checkup");
    });

    it("should approve and set expiry", async function () {
      await accessControl.connect(patient1).approveAccess(1, 30);
      const req = await accessControl.getAccessRequest(1);
      expect(req.status).to.equal(1); // APPROVED
      expect(req.expiresAt).to.be.gt(0);
    });

    it("should emit AccessApproved event", async function () {
      await expect(accessControl.connect(patient1).approveAccess(1, 30))
        .to.emit(accessControl, "AccessApproved");
    });

    it("should reject approval from non-patient", async function () {
      await expect(
        accessControl.connect(doctor1).approveAccess(1, 30)
      ).to.be.revertedWith("Only the patient can perform this action");
    });

    it("should reject approval of non-existent request", async function () {
      await expect(
        accessControl.connect(patient1).approveAccess(999, 30)
      ).to.be.revertedWith("Request does not exist");
    });

    it("should reject zero duration", async function () {
      await expect(
        accessControl.connect(patient1).approveAccess(1, 0)
      ).to.be.revertedWith("Duration must be at least 1 day");
    });

    it("should reject double approval", async function () {
      await accessControl.connect(patient1).approveAccess(1, 30);
      await expect(
        accessControl.connect(patient1).approveAccess(1, 30)
      ).to.be.revertedWith("Request is not pending");
    });
  });

  describe("Rejecting Access", function () {
    beforeEach(async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Checkup");
    });

    it("should reject a request", async function () {
      await accessControl.connect(patient1).rejectAccess(1);
      const req = await accessControl.getAccessRequest(1);
      expect(req.status).to.equal(2); // REJECTED
    });

    it("should emit AccessRejected event", async function () {
      await expect(accessControl.connect(patient1).rejectAccess(1))
        .to.emit(accessControl, "AccessRejected")
        .withArgs(1);
    });

    it("should reject from non-patient", async function () {
      await expect(
        accessControl.connect(stranger).rejectAccess(1)
      ).to.be.revertedWith("Only the patient can perform this action");
    });

    it("should reject already approved request", async function () {
      await accessControl.connect(patient1).approveAccess(1, 30);
      await expect(
        accessControl.connect(patient1).rejectAccess(1)
      ).to.be.revertedWith("Request is not pending");
    });
  });

  describe("Revoking Access", function () {
    beforeEach(async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Checkup");
      await accessControl.connect(patient1).approveAccess(1, 30);
    });

    it("should revoke approved access", async function () {
      await accessControl.connect(patient1).revokeAccess(1);
      const req = await accessControl.getAccessRequest(1);
      expect(req.status).to.equal(3); // REVOKED
    });

    it("should emit AccessRevoked event", async function () {
      await expect(accessControl.connect(patient1).revokeAccess(1))
        .to.emit(accessControl, "AccessRevoked")
        .withArgs(1);
    });

    it("should reject revocation from non-patient", async function () {
      await expect(
        accessControl.connect(doctor1).revokeAccess(1)
      ).to.be.revertedWith("Only the patient can perform this action");
    });

    it("should reject revocation of pending request", async function () {
      await accessControl.connect(doctor1).requestAccess(patient2.address, "Reason");
      await expect(
        accessControl.connect(patient2).revokeAccess(2)
      ).to.be.revertedWith("Request is not currently approved");
    });
  });

  describe("hasActiveAccess", function () {
    beforeEach(async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Checkup");
    });

    it("should return false for pending request", async function () {
      expect(await accessControl.hasActiveAccess(doctor1.address, patient1.address)).to.be.false;
    });

    it("should return true for approved request within expiry", async function () {
      await accessControl.connect(patient1).approveAccess(1, 30);
      expect(await accessControl.hasActiveAccess(doctor1.address, patient1.address)).to.be.true;
    });

    it("should return false after expiry", async function () {
      await accessControl.connect(patient1).approveAccess(1, 1); // 1 day
      await time.increase(2 * DAY);
      expect(await accessControl.hasActiveAccess(doctor1.address, patient1.address)).to.be.false;
    });

    it("should return false after revocation", async function () {
      await accessControl.connect(patient1).approveAccess(1, 30);
      await accessControl.connect(patient1).revokeAccess(1);
      expect(await accessControl.hasActiveAccess(doctor1.address, patient1.address)).to.be.false;
    });

    it("should return false for no request", async function () {
      expect(await accessControl.hasActiveAccess(doctor2.address, patient1.address)).to.be.false;
    });
  });

  describe("Pending Requests View", function () {
    it("should return only pending requests for a patient", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Reason1");
      await accessControl.connect(doctor2).requestAccess(patient1.address, "Reason2");
      await accessControl.connect(patient1).approveAccess(1, 30);

      const pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      expect(pending.length).to.equal(1);
      expect(pending[0]).to.equal(2);
    });

    it("should return empty array when no pending requests", async function () {
      const pending = await accessControl.getPendingRequestsForPatient(patient1.address);
      expect(pending.length).to.equal(0);
    });
  });

  describe("Re-request After Expiry", function () {
    it("should allow new request after previous expired", async function () {
      await accessControl.connect(doctor1).requestAccess(patient1.address, "First");
      await accessControl.connect(patient1).approveAccess(1, 1); // 1 day
      await time.increase(2 * DAY);

      // Access expired, should allow new request
      await accessControl.connect(doctor1).requestAccess(patient1.address, "Second");
      const req = await accessControl.getAccessRequest(2);
      expect(req.status).to.equal(0); // PENDING
    });
  });
});
