const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TreatmentCompliance", function () {
  let mediToken, compliance;
  let owner, doctor, patient, pharmacist, stranger;

  const REWARD = ethers.parseEther("50");

  beforeEach(async function () {
    [owner, doctor, patient, pharmacist, stranger] = await ethers.getSigners();

    const MEDIToken = await ethers.getContractFactory("MEDIToken");
    mediToken = await MEDIToken.deploy();

    const TreatmentCompliance = await ethers.getContractFactory("TreatmentCompliance");
    compliance = await TreatmentCompliance.deploy(await mediToken.getAddress(), owner.address);

    // Fund contract with MEDI for rewards
    await mediToken.transfer(await compliance.getAddress(), ethers.parseEther("1000"));

    // Register pharmacist
    await compliance.registerPharmacist(pharmacist.address);
  });

  describe("Plan Creation", function () {
    it("should create a treatment plan", async function () {
      await compliance.connect(doctor).createPlan(patient.address, "Metformin", 30, 30, REWARD);
      const plan = await compliance.getPlan(1);
      expect(plan.planId).to.equal(1);
      expect(plan.doctorAddress).to.equal(doctor.address);
      expect(plan.patientAddress).to.equal(patient.address);
      expect(plan.medicineName).to.equal("Metformin");
      expect(plan.totalDoses).to.equal(30);
      expect(plan.dosesTaken).to.equal(0);
      expect(plan.rewardAmount).to.equal(REWARD);
      expect(plan.isComplete).to.be.false;
    });

    it("should emit PlanCreated event", async function () {
      await expect(compliance.connect(doctor).createPlan(patient.address, "Aspirin", 10, 10, REWARD))
        .to.emit(compliance, "PlanCreated")
        .withArgs(1, doctor.address, patient.address, "Aspirin");
    });

    it("should reject zero doses", async function () {
      await expect(
        compliance.connect(doctor).createPlan(patient.address, "Med", 0, 10, REWARD)
      ).to.be.revertedWith("Total doses must be > 0");
    });

    it("should reject zero duration", async function () {
      await expect(
        compliance.connect(doctor).createPlan(patient.address, "Med", 10, 0, REWARD)
      ).to.be.revertedWith("Duration must be > 0");
    });

    it("should reject empty medicine name", async function () {
      await expect(
        compliance.connect(doctor).createPlan(patient.address, "", 10, 10, REWARD)
      ).to.be.revertedWith("Medicine name required");
    });

    it("should track plans per patient", async function () {
      await compliance.connect(doctor).createPlan(patient.address, "MedA", 10, 10, REWARD);
      await compliance.connect(doctor).createPlan(patient.address, "MedB", 20, 30, REWARD);
      const ids = await compliance.getPatientPlans(patient.address);
      expect(ids.length).to.equal(2);
    });
  });

  describe("Dose Logging", function () {
    beforeEach(async function () {
      await compliance.connect(doctor).createPlan(patient.address, "Metformin", 3, 30, REWARD);
    });

    it("should allow patient to log dose", async function () {
      await compliance.connect(patient).logDose(1, "Morning dose");
      const plan = await compliance.getPlan(1);
      expect(plan.dosesTaken).to.equal(1);
    });

    it("should allow pharmacist to log dose", async function () {
      await compliance.connect(pharmacist).logDose(1, "Dispensed and verified");
      const plan = await compliance.getPlan(1);
      expect(plan.dosesTaken).to.equal(1);
    });

    it("should emit DoseLogged event", async function () {
      await expect(compliance.connect(patient).logDose(1, "Taken"))
        .to.emit(compliance, "DoseLogged")
        .withArgs(1, 1, patient.address);
    });

    it("should reject dose from unauthorized address", async function () {
      await expect(
        compliance.connect(stranger).logDose(1, "Hack")
      ).to.be.revertedWith("Not authorized to log dose");
    });

    it("should reject dose for non-existent plan", async function () {
      await expect(
        compliance.connect(patient).logDose(999, "Note")
      ).to.be.revertedWith("Plan does not exist");
    });

    it("should store dose logs", async function () {
      await compliance.connect(patient).logDose(1, "Dose 1");
      await compliance.connect(patient).logDose(1, "Dose 2");
      const logs = await compliance.getDoseLogs(1);
      expect(logs.length).to.equal(2);
      expect(logs[0].note).to.equal("Dose 1");
      expect(logs[1].note).to.equal("Dose 2");
    });
  });

  describe("Plan Completion", function () {
    beforeEach(async function () {
      await compliance.connect(doctor).createPlan(patient.address, "Metformin", 3, 30, REWARD);
    });

    it("should mark plan complete when all doses taken", async function () {
      await compliance.connect(patient).logDose(1, "1");
      await compliance.connect(patient).logDose(1, "2");
      await compliance.connect(patient).logDose(1, "3");
      const plan = await compliance.getPlan(1);
      expect(plan.isComplete).to.be.true;
      expect(plan.nextPrescriptionUnlocked).to.be.true;
    });

    it("should emit PlanCompleted on last dose", async function () {
      await compliance.connect(patient).logDose(1, "1");
      await compliance.connect(patient).logDose(1, "2");
      await expect(compliance.connect(patient).logDose(1, "3"))
        .to.emit(compliance, "PlanCompleted")
        .withArgs(1, patient.address);
    });

    it("should reject dose after completion", async function () {
      await compliance.connect(patient).logDose(1, "1");
      await compliance.connect(patient).logDose(1, "2");
      await compliance.connect(patient).logDose(1, "3");
      await expect(
        compliance.connect(patient).logDose(1, "4")
      ).to.be.revertedWith("Plan already complete");
    });
  });

  describe("Compliance Score", function () {
    it("should return 0 for no plans", async function () {
      expect(await compliance.getComplianceScore(patient.address)).to.equal(0);
    });

    it("should return 100 when all plans complete", async function () {
      await compliance.connect(doctor).createPlan(patient.address, "MedA", 1, 10, 0);
      await compliance.connect(patient).logDose(1, "Done");
      expect(await compliance.getComplianceScore(patient.address)).to.equal(100);
    });

    it("should return 50 when half plans complete", async function () {
      await compliance.connect(doctor).createPlan(patient.address, "MedA", 1, 10, 0);
      await compliance.connect(doctor).createPlan(patient.address, "MedB", 1, 10, 0);
      await compliance.connect(patient).logDose(1, "Done");
      expect(await compliance.getComplianceScore(patient.address)).to.equal(50);
    });

    it("should return 0 when no plans complete", async function () {
      await compliance.connect(doctor).createPlan(patient.address, "MedA", 10, 30, 0);
      expect(await compliance.getComplianceScore(patient.address)).to.equal(0);
    });
  });

  describe("Reward Claiming", function () {
    beforeEach(async function () {
      await compliance.connect(doctor).createPlan(patient.address, "Metformin", 2, 30, REWARD);
      await compliance.connect(patient).logDose(1, "1");
      await compliance.connect(patient).logDose(1, "2"); // completes
    });

    it("should transfer MEDI reward to patient", async function () {
      const before = await mediToken.balanceOf(patient.address);
      await compliance.connect(patient).claimReward(1);
      const after = await mediToken.balanceOf(patient.address);
      expect(after - before).to.equal(REWARD);
    });

    it("should emit RewardClaimed event", async function () {
      await expect(compliance.connect(patient).claimReward(1))
        .to.emit(compliance, "RewardClaimed")
        .withArgs(1, patient.address, REWARD);
    });

    it("should reject double claim", async function () {
      await compliance.connect(patient).claimReward(1);
      await expect(
        compliance.connect(patient).claimReward(1)
      ).to.be.revertedWith("Reward already claimed");
    });

    it("should reject claim on incomplete plan", async function () {
      await compliance.connect(doctor).createPlan(patient.address, "Other", 10, 30, REWARD);
      await expect(
        compliance.connect(patient).claimReward(2)
      ).to.be.revertedWith("Plan not complete");
    });

    it("should reject claim by non-patient", async function () {
      await expect(
        compliance.connect(stranger).claimReward(1)
      ).to.be.revertedWith("Not the patient");
    });

    it("should handle zero-reward plan", async function () {
      await compliance.connect(doctor).createPlan(patient.address, "Free", 1, 10, 0);
      await compliance.connect(patient).logDose(2, "Done");
      await expect(
        compliance.connect(patient).claimReward(2)
      ).to.be.revertedWith("No reward set");
    });
  });

  describe("Pharmacist Registration", function () {
    it("should allow admin to register pharmacist", async function () {
      await compliance.registerPharmacist(stranger.address);
      expect(await compliance.registeredPharmacists(stranger.address)).to.be.true;
    });

    it("should reject from non-admin", async function () {
      await expect(
        compliance.connect(stranger).registerPharmacist(stranger.address)
      ).to.be.revertedWith("Only admin");
    });
  });
});
