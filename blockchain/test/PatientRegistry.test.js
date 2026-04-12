const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PatientRegistry", function () {
  let registry;
  let owner, patient1, patient2, stranger;

  const SAMPLE = {
    name: "QmNameHash123",
    bloodType: "O+",
    allergies: "QmAllergiesHash456",
    ipfsHash: "QmEmergencyProfile789",
  };

  beforeEach(async function () {
    [owner, patient1, patient2, stranger] = await ethers.getSigners();
    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    registry = await PatientRegistry.deploy();
  });

  async function registerPatient1() {
    return registry
      .connect(patient1)
      .registerPatient(SAMPLE.name, SAMPLE.bloodType, SAMPLE.allergies, SAMPLE.ipfsHash);
  }

  describe("Registration", function () {
    it("should register a new patient", async function () {
      await registerPatient1();
      const p = await registry.getPatientByWallet(patient1.address);
      expect(p.patientId).to.equal(1);
      expect(p.walletAddress).to.equal(patient1.address);
      expect(p.nameHash).to.equal(SAMPLE.name);
      expect(p.bloodType).to.equal(SAMPLE.bloodType);
      expect(p.allergiesHash).to.equal(SAMPLE.allergies);
      expect(p.emergencyIPFSHash).to.equal(SAMPLE.ipfsHash);
      expect(p.isActive).to.be.true;
      expect(p.isEmergencyDonor).to.be.false;
    });

    it("should emit PatientRegistered event", async function () {
      await expect(registerPatient1())
        .to.emit(registry, "PatientRegistered")
        .withArgs(1, patient1.address);
    });

    it("should auto-increment patient IDs", async function () {
      await registerPatient1();
      await registry
        .connect(patient2)
        .registerPatient("QmName2", "A-", "QmAllergies2", "QmIPFS2");
      const p1 = await registry.getPatientByWallet(patient1.address);
      const p2 = await registry.getPatientByWallet(patient2.address);
      expect(p1.patientId).to.equal(1);
      expect(p2.patientId).to.equal(2);
    });

    it("should reject duplicate registration", async function () {
      await registerPatient1();
      await expect(registerPatient1()).to.be.revertedWith("Already registered");
    });
  });

  describe("Emergency Profile Update", function () {
    beforeEach(async function () {
      await registerPatient1();
    });

    it("should update emergency IPFS hash", async function () {
      const newHash = "QmUpdatedEmergency999";
      await registry.connect(patient1).updateEmergencyProfile(newHash);
      const p = await registry.getPatientByWallet(patient1.address);
      expect(p.emergencyIPFSHash).to.equal(newHash);
    });

    it("should emit EmergencyProfileUpdated event", async function () {
      const newHash = "QmUpdatedEmergency999";
      await expect(registry.connect(patient1).updateEmergencyProfile(newHash))
        .to.emit(registry, "EmergencyProfileUpdated")
        .withArgs(1, newHash);
    });

    it("should reject update from unregistered address", async function () {
      await expect(
        registry.connect(stranger).updateEmergencyProfile("QmFake")
      ).to.be.revertedWith("Not a registered active patient");
    });
  });

  describe("Organ Donor Toggle", function () {
    beforeEach(async function () {
      await registerPatient1();
    });

    it("should toggle organ donor status on", async function () {
      await registry.connect(patient1).toggleOrganDonor();
      const p = await registry.getPatientByWallet(patient1.address);
      expect(p.isEmergencyDonor).to.be.true;
    });

    it("should toggle organ donor status off again", async function () {
      await registry.connect(patient1).toggleOrganDonor();
      await registry.connect(patient1).toggleOrganDonor();
      const p = await registry.getPatientByWallet(patient1.address);
      expect(p.isEmergencyDonor).to.be.false;
    });

    it("should emit OrganDonorStatusChanged event", async function () {
      await expect(registry.connect(patient1).toggleOrganDonor())
        .to.emit(registry, "OrganDonorStatusChanged")
        .withArgs(1, true);
    });

    it("should reject toggle from unregistered address", async function () {
      await expect(
        registry.connect(stranger).toggleOrganDonor()
      ).to.be.revertedWith("Not a registered active patient");
    });
  });

  describe("Lookup by ID (QR code)", function () {
    beforeEach(async function () {
      await registerPatient1();
    });

    it("should return patient by ID", async function () {
      const p = await registry.getPatientById(1);
      expect(p.walletAddress).to.equal(patient1.address);
      expect(p.bloodType).to.equal(SAMPLE.bloodType);
    });

    it("should return empty patient for non-existent ID", async function () {
      const p = await registry.getPatientById(999);
      expect(p.walletAddress).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Deactivation", function () {
    beforeEach(async function () {
      await registerPatient1();
    });

    it("should deactivate patient", async function () {
      await registry.connect(patient1).deactivatePatient();
      const p = await registry.getPatientByWallet(patient1.address);
      expect(p.isActive).to.be.false;
    });

    it("should emit PatientDeactivated event", async function () {
      await expect(registry.connect(patient1).deactivatePatient())
        .to.emit(registry, "PatientDeactivated")
        .withArgs(1);
    });

    it("should prevent deactivated patient from updating profile", async function () {
      await registry.connect(patient1).deactivatePatient();
      await expect(
        registry.connect(patient1).updateEmergencyProfile("QmNew")
      ).to.be.revertedWith("Not a registered active patient");
    });

    it("should prevent deactivated patient from toggling donor", async function () {
      await registry.connect(patient1).deactivatePatient();
      await expect(
        registry.connect(patient1).toggleOrganDonor()
      ).to.be.revertedWith("Not a registered active patient");
    });

    it("should reject deactivation from unregistered address", async function () {
      await expect(
        registry.connect(stranger).deactivatePatient()
      ).to.be.revertedWith("Not a registered active patient");
    });
  });
});
