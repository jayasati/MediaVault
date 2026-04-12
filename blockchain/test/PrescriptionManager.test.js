const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("PrescriptionManager", function () {
  let registry, accessControl, prescriptionManager;
  let owner, doctor, patient, pharmacist, stranger;

  const DAY = 86400;

  beforeEach(async function () {
    [owner, doctor, patient, pharmacist, stranger] = await ethers.getSigners();

    // Deploy dependency chain
    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    registry = await PatientRegistry.deploy();

    const MediAccessControl = await ethers.getContractFactory("MediAccessControl");
    accessControl = await MediAccessControl.deploy(await registry.getAddress());

    const PrescriptionManager = await ethers.getContractFactory("PrescriptionManager");
    prescriptionManager = await PrescriptionManager.deploy(await accessControl.getAddress());

    // Setup: register patient, request + approve doctor access
    await registry.connect(patient).registerPatient("QmName", "O+", "QmAllergies", "QmIPFS");
    await accessControl.connect(doctor).requestAccess(patient.address, "Treatment");
    await accessControl.connect(patient).approveAccess(1, 90); // 90 days

    // Register pharmacist
    await prescriptionManager.registerPharmacist(pharmacist.address);
  });

  describe("Writing Prescriptions", function () {
    it("should write a valid prescription", async function () {
      await prescriptionManager.connect(doctor).writePrescription(
        patient.address, "Amoxicillin", "500mg 3x daily", 7, false, "QmRxHash1"
      );

      const rx = await prescriptionManager.getPrescription(1);
      expect(rx.prescriptionId).to.equal(1);
      expect(rx.doctorAddress).to.equal(doctor.address);
      expect(rx.patientAddress).to.equal(patient.address);
      expect(rx.medicineName).to.equal("Amoxicillin");
      expect(rx.dosage).to.equal("500mg 3x daily");
      expect(rx.durationDays).to.equal(7);
      expect(rx.isControlled).to.be.false;
      expect(rx.isActive).to.be.true;
      expect(rx.isDispensed).to.be.false;
    });

    it("should emit PrescriptionWritten event", async function () {
      await expect(
        prescriptionManager.connect(doctor).writePrescription(
          patient.address, "Ibuprofen", "400mg 2x daily", 5, false, "QmRxHash2"
        )
      )
        .to.emit(prescriptionManager, "PrescriptionWritten")
        .withArgs(1, doctor.address, patient.address, "Ibuprofen");
    });

    it("should reject if doctor has no active access", async function () {
      await expect(
        prescriptionManager.connect(stranger).writePrescription(
          patient.address, "Aspirin", "100mg daily", 30, false, "QmRxHash3"
        )
      ).to.be.revertedWith("No active access to patient");
    });

    it("should reject self-prescription", async function () {
      await expect(
        prescriptionManager.connect(doctor).writePrescription(
          doctor.address, "Aspirin", "100mg", 5, false, "QmHash"
        )
      ).to.be.revertedWith("Doctor cannot prescribe to self");
    });

    it("should reject zero duration", async function () {
      await expect(
        prescriptionManager.connect(doctor).writePrescription(
          patient.address, "Aspirin", "100mg", 0, false, "QmHash"
        )
      ).to.be.revertedWith("Duration must be at least 1 day");
    });

    it("should reject empty medicine name", async function () {
      await expect(
        prescriptionManager.connect(doctor).writePrescription(
          patient.address, "", "100mg", 5, false, "QmHash"
        )
      ).to.be.revertedWith("Medicine name required");
    });

    it("should track prescriptions per patient", async function () {
      await prescriptionManager.connect(doctor).writePrescription(
        patient.address, "MedA", "100mg", 7, false, "QmA"
      );
      await prescriptionManager.connect(doctor).writePrescription(
        patient.address, "MedB", "200mg", 14, false, "QmB"
      );

      const active = await prescriptionManager.getActivePrescriptions(patient.address);
      expect(active.length).to.equal(2);
    });
  });

  describe("Controlled Substance Flagging", function () {
    it("should emit ControlledSubstanceAlert for controlled drugs", async function () {
      await expect(
        prescriptionManager.connect(doctor).writePrescription(
          patient.address, "Oxycodone", "10mg 2x daily", 7, true, "QmControlled1"
        )
      )
        .to.emit(prescriptionManager, "ControlledSubstanceAlert")
        .withArgs(1, doctor.address, patient.address, "Oxycodone");
    });

    it("should not emit ControlledSubstanceAlert for non-controlled drugs", async function () {
      await expect(
        prescriptionManager.connect(doctor).writePrescription(
          patient.address, "Paracetamol", "500mg", 3, false, "QmNormal"
        )
      ).to.not.emit(prescriptionManager, "ControlledSubstanceAlert");
    });

    it("should store isControlled flag correctly", async function () {
      await prescriptionManager.connect(doctor).writePrescription(
        patient.address, "Morphine", "5mg", 3, true, "QmControlled2"
      );
      const rx = await prescriptionManager.getPrescription(1);
      expect(rx.isControlled).to.be.true;
    });
  });

  describe("Duplicate Detection", function () {
    beforeEach(async function () {
      await prescriptionManager.connect(doctor).writePrescription(
        patient.address, "Amoxicillin", "500mg 3x daily", 7, false, "QmRx1"
      );
    });

    it("should detect duplicate active prescription", async function () {
      expect(
        await prescriptionManager.checkDuplicate(patient.address, "Amoxicillin")
      ).to.be.true;
    });

    it("should return false for different medicine", async function () {
      expect(
        await prescriptionManager.checkDuplicate(patient.address, "Ibuprofen")
      ).to.be.false;
    });

    it("should block and revert on duplicate prescription", async function () {
      await expect(
        prescriptionManager.connect(doctor).writePrescription(
          patient.address, "Amoxicillin", "250mg 2x daily", 5, false, "QmRx2"
        )
      ).to.be.revertedWith("Active prescription already exists for this medicine");
    });

    it("should allow same medicine after previous expires", async function () {
      await time.increase(8 * DAY); // 7-day prescription expired

      expect(
        await prescriptionManager.checkDuplicate(patient.address, "Amoxicillin")
      ).to.be.false;

      await prescriptionManager.connect(doctor).writePrescription(
        patient.address, "Amoxicillin", "250mg 2x daily", 5, false, "QmRx3"
      );
      const rx = await prescriptionManager.getPrescription(2);
      expect(rx.medicineName).to.equal("Amoxicillin");
    });
  });

  describe("Dispensing", function () {
    beforeEach(async function () {
      await prescriptionManager.connect(doctor).writePrescription(
        patient.address, "Amoxicillin", "500mg 3x daily", 7, false, "QmRx1"
      );
    });

    it("should allow registered pharmacist to dispense", async function () {
      await prescriptionManager.connect(pharmacist).dispensePrescription(1);
      const rx = await prescriptionManager.getPrescription(1);
      expect(rx.isDispensed).to.be.true;
      expect(rx.dispensedBy).to.equal(pharmacist.address);
      expect(rx.dispensedAt).to.be.gt(0);
    });

    it("should emit PrescriptionDispensed event", async function () {
      await expect(prescriptionManager.connect(pharmacist).dispensePrescription(1))
        .to.emit(prescriptionManager, "PrescriptionDispensed")
        .withArgs(1, pharmacist.address);
    });

    it("should reject dispensing by non-pharmacist", async function () {
      await expect(
        prescriptionManager.connect(stranger).dispensePrescription(1)
      ).to.be.revertedWith("Not a registered pharmacist");
    });

    it("should reject double dispensing", async function () {
      await prescriptionManager.connect(pharmacist).dispensePrescription(1);
      await expect(
        prescriptionManager.connect(pharmacist).dispensePrescription(1)
      ).to.be.revertedWith("Already dispensed");
    });

    it("should reject dispensing expired prescription", async function () {
      await time.increase(8 * DAY);
      await expect(
        prescriptionManager.connect(pharmacist).dispensePrescription(1)
      ).to.be.revertedWith("Prescription has expired");
    });

    it("should reject dispensing non-existent prescription", async function () {
      await expect(
        prescriptionManager.connect(pharmacist).dispensePrescription(999)
      ).to.be.revertedWith("Prescription does not exist");
    });
  });

  describe("Active Prescriptions View", function () {
    it("should return only active non-expired prescriptions", async function () {
      await prescriptionManager.connect(doctor).writePrescription(
        patient.address, "MedA", "100mg", 2, false, "QmA"
      );
      await prescriptionManager.connect(doctor).writePrescription(
        patient.address, "MedB", "200mg", 30, false, "QmB"
      );

      // Expire the first one
      await time.increase(3 * DAY);

      const active = await prescriptionManager.getActivePrescriptions(patient.address);
      expect(active.length).to.equal(1);
      expect(active[0]).to.equal(2); // MedB still active
    });

    it("should return empty array for patient with no prescriptions", async function () {
      const active = await prescriptionManager.getActivePrescriptions(stranger.address);
      expect(active.length).to.equal(0);
    });
  });

  describe("Pharmacist Registration", function () {
    it("should allow owner to register pharmacist", async function () {
      await prescriptionManager.registerPharmacist(stranger.address);
      expect(await prescriptionManager.registeredPharmacists(stranger.address)).to.be.true;
    });

    it("should emit PharmacistRegistered event", async function () {
      await expect(prescriptionManager.registerPharmacist(stranger.address))
        .to.emit(prescriptionManager, "PharmacistRegistered")
        .withArgs(stranger.address);
    });

    it("should reject pharmacist registration from non-owner", async function () {
      await expect(
        prescriptionManager.connect(stranger).registerPharmacist(stranger.address)
      ).to.be.revertedWithCustomError(prescriptionManager, "OwnableUnauthorizedAccount");
    });
  });
});
