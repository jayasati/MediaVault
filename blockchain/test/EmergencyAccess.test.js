const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EmergencyAccess", function () {
  let registry, emergencyAccess;
  let owner, responder1, responder2, patient, stranger;

  const PATIENT_DATA = {
    name: "QmNameHash",
    bloodType: "AB-",
    allergies: "QmAllergiesHash",
    ipfsHash: "QmEmergencyProfile_BloodType_Allergies_EmergencyContact",
  };

  beforeEach(async function () {
    [owner, responder1, responder2, patient, stranger] = await ethers.getSigners();

    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    registry = await PatientRegistry.deploy();

    const EmergencyAccess = await ethers.getContractFactory("EmergencyAccess");
    emergencyAccess = await EmergencyAccess.deploy(await registry.getAddress());

    // Register patient
    await registry
      .connect(patient)
      .registerPatient(PATIENT_DATA.name, PATIENT_DATA.bloodType, PATIENT_DATA.allergies, PATIENT_DATA.ipfsHash);
  });

  describe("Legitimate Emergency Access", function () {
    it("should grant emergency access and return patient data", async function () {
      const tx = await emergencyAccess
        .connect(responder1)
        .emergencyAccess(1, "Car accident, unconscious patient", "Highway 45, KM 12");

      const receipt = await tx.wait();

      // Verify the access record was created
      const record = await emergencyAccess.getAccessRecord(1);
      expect(record.accessId).to.equal(1);
      expect(record.responderAddress).to.equal(responder1.address);
      expect(record.patientId).to.equal(1);
      expect(record.reason).to.equal("Car accident, unconscious patient");
      expect(record.location).to.equal("Highway 45, KM 12");
      expect(record.wasNotified).to.be.false;
    });

    it("should emit EmergencyAccessGranted event", async function () {
      await expect(
        emergencyAccess.connect(responder1).emergencyAccess(1, "Cardiac arrest", "ER Bay 3")
      )
        .to.emit(emergencyAccess, "EmergencyAccessGranted")
        .withArgs(1, responder1.address, 1, "Cardiac arrest");
    });

    it("should return emergency profile via getEmergencyProfile", async function () {
      const [ipfsHash, bloodType, isDonor, isActive] = await emergencyAccess.getEmergencyProfile(1);
      expect(ipfsHash).to.equal(PATIENT_DATA.ipfsHash);
      expect(bloodType).to.equal("AB-");
      expect(isDonor).to.be.false;
      expect(isActive).to.be.true;
    });

    it("should work with empty location", async function () {
      await emergencyAccess.connect(responder1).emergencyAccess(1, "Emergency", "");
      const record = await emergencyAccess.getAccessRecord(1);
      expect(record.location).to.equal("");
    });

    it("should reject empty reason", async function () {
      await expect(
        emergencyAccess.connect(responder1).emergencyAccess(1, "", "Location")
      ).to.be.revertedWith("Reason is required");
    });

    it("should reject access to non-existent patient", async function () {
      await expect(
        emergencyAccess.connect(responder1).emergencyAccess(999, "Reason", "Location")
      ).to.be.revertedWith("Patient not found");
    });

    it("should reject access to deactivated patient", async function () {
      await registry.connect(patient).deactivatePatient();
      await expect(
        emergencyAccess.connect(responder1).emergencyAccess(1, "Emergency", "ER")
      ).to.be.revertedWith("Patient is not active");
    });

    it("should reflect organ donor status", async function () {
      await registry.connect(patient).toggleOrganDonor();
      const [, , isDonor] = await emergencyAccess.getEmergencyProfile(1);
      expect(isDonor).to.be.true;
    });
  });

  describe("Repeated Access Logging", function () {
    it("should log multiple accesses by different responders", async function () {
      await emergencyAccess.connect(responder1).emergencyAccess(1, "First response", "Scene A");
      await emergencyAccess.connect(responder2).emergencyAccess(1, "Hospital handoff", "ER Bay 1");

      const logs = await emergencyAccess.getEmergencyAccessLog(patient.address);
      expect(logs.length).to.equal(2);
      expect(logs[0]).to.equal(1);
      expect(logs[1]).to.equal(2);
    });

    it("should log repeated access by same responder", async function () {
      await emergencyAccess.connect(responder1).emergencyAccess(1, "Initial triage", "Ambulance");
      await emergencyAccess.connect(responder1).emergencyAccess(1, "Follow-up check", "Hospital");

      const logs = await emergencyAccess.getEmergencyAccessLog(patient.address);
      expect(logs.length).to.equal(2);
    });

    it("should track responder access history", async function () {
      await emergencyAccess.connect(responder1).emergencyAccess(1, "Emergency 1", "Loc 1");

      const responderLogs = await emergencyAccess.getResponderAccessLog(responder1.address);
      expect(responderLogs.length).to.equal(1);
      expect(responderLogs[0]).to.equal(1);
    });

    it("should auto-increment access IDs", async function () {
      await emergencyAccess.connect(responder1).emergencyAccess(1, "First", "A");
      await emergencyAccess.connect(responder2).emergencyAccess(1, "Second", "B");

      const r1 = await emergencyAccess.getAccessRecord(1);
      const r2 = await emergencyAccess.getAccessRecord(2);
      expect(r1.accessId).to.equal(1);
      expect(r2.accessId).to.equal(2);
    });

    it("should store timestamp for each access", async function () {
      await emergencyAccess.connect(responder1).emergencyAccess(1, "Emergency", "ER");
      const record = await emergencyAccess.getAccessRecord(1);
      expect(record.accessedAt).to.be.gt(0);
    });
  });

  describe("Patient Notification", function () {
    beforeEach(async function () {
      await emergencyAccess.connect(responder1).emergencyAccess(1, "Cardiac event", "Ambulance 7");
    });

    it("should allow patient to acknowledge access", async function () {
      await emergencyAccess.connect(patient).markNotified(1);
      const record = await emergencyAccess.getAccessRecord(1);
      expect(record.wasNotified).to.be.true;
    });

    it("should emit PatientNotified event", async function () {
      await expect(emergencyAccess.connect(patient).markNotified(1))
        .to.emit(emergencyAccess, "PatientNotified")
        .withArgs(1, patient.address);
    });

    it("should reject acknowledgement from non-patient", async function () {
      await expect(
        emergencyAccess.connect(stranger).markNotified(1)
      ).to.be.revertedWith("Only the patient can acknowledge");
    });

    it("should reject double acknowledgement", async function () {
      await emergencyAccess.connect(patient).markNotified(1);
      await expect(
        emergencyAccess.connect(patient).markNotified(1)
      ).to.be.revertedWith("Already acknowledged");
    });

    it("should reject acknowledgement of non-existent record", async function () {
      await expect(
        emergencyAccess.connect(patient).markNotified(999)
      ).to.be.revertedWith("Access record does not exist");
    });

    it("should return empty log for patient with no emergency accesses", async function () {
      const logs = await emergencyAccess.getEmergencyAccessLog(stranger.address);
      expect(logs.length).to.equal(0);
    });
  });
});
