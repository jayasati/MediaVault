const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MediVault", function () {
  let medivault;
  let owner, doctor, patient;

  beforeEach(async function () {
    [owner, doctor, patient] = await ethers.getSigners();
    const MediVault = await ethers.getContractFactory("MediVault");
    medivault = await MediVault.deploy();
  });

  describe("Patient Registration", function () {
    it("should register a new patient", async function () {
      const tx = await medivault.connect(patient).registerPatient("QmTestHash123");
      await tx.wait();

      const records = await medivault.connect(patient).getMyRecords();
      expect(records.length).to.equal(1);
    });

    it("should store correct patient data", async function () {
      await medivault.connect(patient).registerPatient("QmTestHash123");

      const record = await medivault.connect(patient).getPatient(1);
      expect(record.dataHash).to.equal("QmTestHash123");
      expect(record.owner).to.equal(patient.address);
    });
  });

  describe("Access Control", function () {
    beforeEach(async function () {
      await medivault.connect(patient).registerPatient("QmTestHash123");
    });

    it("should grant access to a doctor", async function () {
      await medivault.connect(patient).grantAccess(1, doctor.address);
      const record = await medivault.connect(doctor).getPatient(1);
      expect(record.dataHash).to.equal("QmTestHash123");
    });

    it("should revoke access from a doctor", async function () {
      await medivault.connect(patient).grantAccess(1, doctor.address);
      await medivault.connect(patient).revokeAccess(1, doctor.address);

      await expect(
        medivault.connect(doctor).getPatient(1)
      ).to.be.revertedWith("Not authorized");
    });

    it("should not allow unauthorized access", async function () {
      await expect(
        medivault.connect(doctor).getPatient(1)
      ).to.be.revertedWith("Not authorized");
    });
  });

  describe("Record Updates", function () {
    beforeEach(async function () {
      await medivault.connect(patient).registerPatient("QmTestHash123");
    });

    it("should allow owner to update record", async function () {
      await medivault.connect(patient).updateRecord(1, "QmNewHash456");
      const record = await medivault.connect(patient).getPatient(1);
      expect(record.dataHash).to.equal("QmNewHash456");
    });

    it("should allow authorized doctor to update record", async function () {
      await medivault.connect(patient).grantAccess(1, doctor.address);
      await medivault.connect(doctor).updateRecord(1, "QmDoctorHash789");
      const record = await medivault.connect(doctor).getPatient(1);
      expect(record.dataHash).to.equal("QmDoctorHash789");
    });
  });
});
