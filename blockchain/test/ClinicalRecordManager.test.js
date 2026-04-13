const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("ClinicalRecordManager", function () {
  let registry, accessControl, roleManager, crm;
  let superAdmin, admin1, doctor1, doctor2, patient, stranger;

  const APOLLO = ethers.keccak256(ethers.toUtf8Bytes("apollo-bangalore"));
  const DAY = 86400;
  const CATEGORY = { LAB: 0, SCAN: 1, DIAGNOSIS: 2, PRESCRIPTION: 3, PROCEDURE: 4, DISCHARGE: 5, VITALS: 6, IMPORT: 7, OTHER: 8 };
  const STATUS = { PENDING_RATIFICATION: 0, CLINICAL: 1, AMENDED: 2, REJECTED_RATIFICATION: 3 };

  async function setupDoctorWithAccess() {
    // Register patient
    await roleManager.connect(patient).registerAsPatient();
    await registry.connect(patient).registerPatient("Alice", "O+", "Peanuts", "QmEmergency");
    // Approve doctor1 via RoleManager
    await roleManager
      .connect(doctor1)
      .applyForRole(2, APOLLO, "Dr. Smith", "Cardiology", "MCI-1234");
    await roleManager.connect(admin1).approveApplication(1);
    // Doctor1 requests and patient approves access
    await accessControl.connect(doctor1).requestAccess(patient.address, "Checkup");
    const pending = await accessControl.getPendingRequestsForPatient(patient.address);
    await accessControl.connect(patient).approveAccess(pending[0], 30);
  }

  beforeEach(async function () {
    [superAdmin, admin1, doctor1, doctor2, patient, stranger] = await ethers.getSigners();

    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    registry = await PatientRegistry.deploy();

    const MediAccessControl = await ethers.getContractFactory("MediAccessControl");
    accessControl = await MediAccessControl.deploy(await registry.getAddress());

    const RoleManager = await ethers.getContractFactory("RoleManager");
    roleManager = await RoleManager.deploy();

    const ClinicalRecordManager = await ethers.getContractFactory("ClinicalRecordManager");
    crm = await ClinicalRecordManager.deploy(
      await accessControl.getAddress(),
      await roleManager.getAddress()
    );

    await roleManager.addAdmin(admin1.address, APOLLO);
  });

  describe("Direct Record Upload", function () {
    beforeEach(async function () {
      await setupDoctorWithAccess();
    });

    it("should allow a doctor with active access to upload", async function () {
      const tx = await crm
        .connect(doctor1)
        .uploadRecord(
          patient.address,
          ethers.keccak256(ethers.toUtf8Bytes("content1")),
          "QmTestCID1",
          CATEGORY.LAB,
          "Blood panel"
        );
      await tx.wait();

      const rec = await crm.getRecord(1);
      expect(rec.patientAddress).to.equal(patient.address);
      expect(rec.uploaderDoctor).to.equal(doctor1.address);
      expect(rec.status).to.equal(STATUS.CLINICAL);
      expect(rec.category).to.equal(CATEGORY.LAB);
      expect(rec.title).to.equal("Blood panel");
    });

    it("should emit RecordUploaded event", async function () {
      await expect(
        crm
          .connect(doctor1)
          .uploadRecord(
            patient.address,
            ethers.keccak256(ethers.toUtf8Bytes("c")),
            "QmCID",
            CATEGORY.LAB,
            "Test"
          )
      )
        .to.emit(crm, "RecordUploaded")
        .withArgs(1, patient.address, doctor1.address, CATEGORY.LAB);
    });

    it("should reject upload without active access", async function () {
      // Register doctor2 but don't grant access
      await roleManager
        .connect(doctor2)
        .applyForRole(2, APOLLO, "Dr. Jones", "Neurology", "MCI-5678");
      await roleManager.connect(admin1).approveApplication(2);

      await expect(
        crm
          .connect(doctor2)
          .uploadRecord(
            patient.address,
            ethers.keccak256(ethers.toUtf8Bytes("c")),
            "QmCID",
            CATEGORY.LAB,
            "Unauthorized"
          )
      ).to.be.revertedWith("No active write access to patient");
    });

    it("should reject upload from non-doctor", async function () {
      await expect(
        crm
          .connect(stranger)
          .uploadRecord(
            patient.address,
            ethers.keccak256(ethers.toUtf8Bytes("c")),
            "QmCID",
            CATEGORY.LAB,
            "Hack"
          )
      ).to.be.revertedWith("Only registered doctor");
    });

    it("should reject empty IPFS CID", async function () {
      await expect(
        crm
          .connect(doctor1)
          .uploadRecord(
            patient.address,
            ethers.keccak256(ethers.toUtf8Bytes("c")),
            "",
            CATEGORY.LAB,
            "Empty"
          )
      ).to.be.revertedWith("IPFS CID required");
    });

    it("should track uploads per doctor and records per patient", async function () {
      await crm
        .connect(doctor1)
        .uploadRecord(patient.address, ethers.ZeroHash, "QmA", CATEGORY.LAB, "T1");
      await crm
        .connect(doctor1)
        .uploadRecord(patient.address, ethers.ZeroHash, "QmB", CATEGORY.SCAN, "T2");

      const patientRecs = await crm.getPatientRecords(patient.address);
      expect(patientRecs.length).to.equal(2);

      const doctorUploads = await crm.getDoctorUploads(doctor1.address);
      expect(doctorUploads.length).to.equal(2);
    });

    it("should auto-record treatment history on upload", async function () {
      await crm
        .connect(doctor1)
        .uploadRecord(patient.address, ethers.ZeroHash, "QmA", CATEGORY.LAB, "T1");

      const [firstAt, lastAt] = await crm.getPatientTreatmentInfo(doctor1.address, patient.address);
      expect(firstAt).to.be.gt(0);
      expect(lastAt).to.be.gt(0);

      const patients = await crm.getDoctorPatients(doctor1.address);
      expect(patients.length).to.equal(1);
      expect(patients[0]).to.equal(patient.address);
    });
  });

  describe("Ratification Flow", function () {
    beforeEach(async function () {
      await setupDoctorWithAccess();
    });

    it("should allow patient to submit for ratification", async function () {
      const tx = await crm
        .connect(patient)
        .submitForRatification(
          ethers.ZeroHash,
          "QmImported",
          CATEGORY.IMPORT,
          "Old X-ray",
          doctor1.address
        );
      await tx.wait();

      const rec = await crm.getRecord(1);
      expect(rec.patientAddress).to.equal(patient.address);
      expect(rec.uploaderDoctor).to.equal(doctor1.address);
      expect(rec.submittedBy).to.equal(patient.address);
      expect(rec.status).to.equal(STATUS.PENDING_RATIFICATION);
    });

    it("should emit RatificationRequested event", async function () {
      await expect(
        crm
          .connect(patient)
          .submitForRatification(
            ethers.ZeroHash,
            "QmImported",
            CATEGORY.IMPORT,
            "X-ray",
            doctor1.address
          )
      )
        .to.emit(crm, "RatificationRequested")
        .withArgs(1, patient.address, doctor1.address);
    });

    it("should appear in doctor's pending ratifications", async function () {
      await crm
        .connect(patient)
        .submitForRatification(ethers.ZeroHash, "QmA", CATEGORY.IMPORT, "R1", doctor1.address);
      const pending = await crm.getPendingRatifications(doctor1.address);
      expect(pending.length).to.equal(1);
      expect(pending[0]).to.equal(1);
    });

    it("should allow doctor to ratify", async function () {
      await crm
        .connect(patient)
        .submitForRatification(ethers.ZeroHash, "QmA", CATEGORY.IMPORT, "R1", doctor1.address);
      await crm.connect(doctor1).ratifyRecord(1);
      const rec = await crm.getRecord(1);
      expect(rec.status).to.equal(STATUS.CLINICAL);
    });

    it("should add to treatment history on ratification", async function () {
      // Clean slate patient — different from setupDoctorWithAccess's
      const [, , , , , other] = await ethers.getSigners();
      await roleManager.connect(other).registerAsPatient();
      await registry.connect(other).registerPatient("Bob", "A+", "None", "Qm");
      await crm
        .connect(other)
        .submitForRatification(ethers.ZeroHash, "QmZ", CATEGORY.IMPORT, "R", doctor1.address);
      await crm.connect(doctor1).ratifyRecord(1);
      const [firstAt] = await crm.getPatientTreatmentInfo(doctor1.address, other.address);
      expect(firstAt).to.be.gt(0);
    });

    it("should reject ratification by wrong doctor", async function () {
      await roleManager
        .connect(doctor2)
        .applyForRole(2, APOLLO, "Dr. Jones", "Cardiology", "MCI-22");
      await roleManager.connect(admin1).approveApplication(2);

      await crm
        .connect(patient)
        .submitForRatification(ethers.ZeroHash, "QmA", CATEGORY.IMPORT, "R", doctor1.address);
      await expect(crm.connect(doctor2).ratifyRecord(1)).to.be.revertedWith(
        "Not the designated doctor"
      );
    });

    it("should allow doctor to reject ratification with reason", async function () {
      await crm
        .connect(patient)
        .submitForRatification(ethers.ZeroHash, "QmA", CATEGORY.IMPORT, "R", doctor1.address);
      await crm.connect(doctor1).rejectRatification(1, "Illegible scan");
      const rec = await crm.getRecord(1);
      expect(rec.status).to.equal(STATUS.REJECTED_RATIFICATION);
      expect(rec.amendmentReason).to.equal("Illegible scan");
    });

    it("should reject ratification submission if target is not a doctor", async function () {
      await expect(
        crm
          .connect(patient)
          .submitForRatification(
            ethers.ZeroHash,
            "QmA",
            CATEGORY.IMPORT,
            "R",
            stranger.address
          )
      ).to.be.revertedWith("Target must be a doctor");
    });

    it("should reject ratification submission by non-patient", async function () {
      await expect(
        crm
          .connect(stranger)
          .submitForRatification(ethers.ZeroHash, "QmA", CATEGORY.IMPORT, "R", doctor1.address)
      ).to.be.revertedWith("Only registered patient");
    });
  });

  describe("Amendment Flow", function () {
    let recordId;
    beforeEach(async function () {
      await setupDoctorWithAccess();
      const tx = await crm
        .connect(doctor1)
        .uploadRecord(patient.address, ethers.ZeroHash, "QmOriginal", CATEGORY.LAB, "Blood panel");
      await tx.wait();
      recordId = 1;
    });

    it("should allow original uploader to amend within 7 days", async function () {
      await time.increase(DAY);
      await crm
        .connect(doctor1)
        .amendRecord(recordId, ethers.ZeroHash, "QmCorrected", "Dosage typo fix");
      const newRec = await crm.getRecord(2);
      expect(newRec.status).to.equal(STATUS.CLINICAL);
      expect(newRec.previousVersionId).to.equal(1);
      expect(newRec.amendmentReason).to.equal("Dosage typo fix");

      const oldRec = await crm.getRecord(1);
      expect(oldRec.isSuperseded).to.be.true;
      expect(oldRec.nextVersionId).to.equal(2);
      expect(oldRec.status).to.equal(STATUS.AMENDED);
    });

    it("should emit RecordAmended event", async function () {
      await expect(
        crm.connect(doctor1).amendRecord(recordId, ethers.ZeroHash, "QmNew", "Fix")
      )
        .to.emit(crm, "RecordAmended")
        .withArgs(1, 2, "Fix");
    });

    it("should reject amendment after 7 days", async function () {
      await time.increase(8 * DAY);
      await expect(
        crm.connect(doctor1).amendRecord(recordId, ethers.ZeroHash, "QmNew", "Late")
      ).to.be.revertedWith("Amendment window expired");
    });

    it("should reject amendment by non-uploader", async function () {
      await roleManager
        .connect(doctor2)
        .applyForRole(2, APOLLO, "Dr. Jones", "Cardiology", "MCI-22");
      await roleManager.connect(admin1).approveApplication(2);
      await expect(
        crm.connect(doctor2).amendRecord(recordId, ethers.ZeroHash, "QmNew", "Steal")
      ).to.be.revertedWith("Only uploader can amend");
    });

    it("should reject amendment of already-superseded record", async function () {
      await crm.connect(doctor1).amendRecord(recordId, ethers.ZeroHash, "QmV2", "Fix 1");
      // Once amended, the record status becomes AMENDED, so the clinical check fails first
      await expect(
        crm.connect(doctor1).amendRecord(recordId, ethers.ZeroHash, "QmV3", "Fix 2")
      ).to.be.revertedWith("Can only amend clinical records");
    });

    it("should allow amendment chain within 30-day cap", async function () {
      // Amend on day 2
      await time.increase(2 * DAY);
      await crm.connect(doctor1).amendRecord(1, ethers.ZeroHash, "QmV2", "Typo");
      // Amend again on day 4 (second amendment window is from v2's upload)
      await time.increase(2 * DAY);
      await crm.connect(doctor1).amendRecord(2, ethers.ZeroHash, "QmV3", "Another fix");
      const rec = await crm.getRecord(3);
      expect(rec.originalRecordId).to.equal(1);
    });

    it("should reject amendment past 30-day cap from original", async function () {
      // Keep amending within the 7-day window each time to stay ahead of AMENDMENT_WINDOW
      // but accumulate time toward the 30-day MAX cap from the ORIGINAL record
      // Day 5: amend v1 → v2 (within 7d window)
      await time.increase(5 * DAY);
      await crm.connect(doctor1).amendRecord(1, ethers.ZeroHash, "QmV2", "Fix 1");
      // Day 10: amend v2 → v3 (within 7d of v2)
      await time.increase(5 * DAY);
      await crm.connect(doctor1).amendRecord(2, ethers.ZeroHash, "QmV3", "Fix 2");
      // Day 15: amend v3 → v4
      await time.increase(5 * DAY);
      await crm.connect(doctor1).amendRecord(3, ethers.ZeroHash, "QmV4", "Fix 3");
      // Day 20: amend v4 → v5
      await time.increase(5 * DAY);
      await crm.connect(doctor1).amendRecord(4, ethers.ZeroHash, "QmV5", "Fix 4");
      // Day 25: amend v5 → v6
      await time.increase(5 * DAY);
      await crm.connect(doctor1).amendRecord(5, ethers.ZeroHash, "QmV6", "Fix 5");
      // Day 31: past 30-day cap from original → fails
      await time.increase(6 * DAY);
      await expect(
        crm.connect(doctor1).amendRecord(6, ethers.ZeroHash, "QmV7", "Too late")
      ).to.be.revertedWith("Past max amendment age");
    });

    it("should reject amendment with empty reason", async function () {
      await expect(
        crm.connect(doctor1).amendRecord(recordId, ethers.ZeroHash, "QmNew", "")
      ).to.be.revertedWith("Reason required");
    });
  });

  describe("Dispute Flag", function () {
    beforeEach(async function () {
      await setupDoctorWithAccess();
      await crm
        .connect(doctor1)
        .uploadRecord(patient.address, ethers.ZeroHash, "QmA", CATEGORY.DIAGNOSIS, "Diagnosis");
    });

    it("should emit RecordDisputed when patient flags", async function () {
      await expect(
        crm.connect(patient).disputeRecord(1, "I never had this diagnosis")
      )
        .to.emit(crm, "RecordDisputed")
        .withArgs(1, patient.address, "I never had this diagnosis");
    });

    it("should reject dispute from non-patient", async function () {
      await expect(
        crm.connect(stranger).disputeRecord(1, "Hack")
      ).to.be.revertedWith("Only patient can dispute");
    });

    it("should reject dispute with empty reason", async function () {
      await expect(crm.connect(patient).disputeRecord(1, "")).to.be.revertedWith(
        "Reason required"
      );
    });
  });

  describe("Historical Access Purge", function () {
    beforeEach(async function () {
      await setupDoctorWithAccess();
      await crm
        .connect(doctor1)
        .uploadRecord(patient.address, ethers.ZeroHash, "QmA", CATEGORY.LAB, "T");
    });

    it("should grant historical read access after first treatment", async function () {
      expect(
        await crm.hasHistoricalReadAccess(doctor1.address, patient.address)
      ).to.be.true;
    });

    it("should allow patient to purge historical access", async function () {
      await crm.connect(patient).purgeHistoricalAccess(doctor1.address);
      expect(
        await crm.hasHistoricalReadAccess(doctor1.address, patient.address)
      ).to.be.false;
    });

    it("should emit HistoricalAccessPurged event", async function () {
      await expect(crm.connect(patient).purgeHistoricalAccess(doctor1.address))
        .to.emit(crm, "HistoricalAccessPurged")
        .withArgs(patient.address, doctor1.address);
    });

    it("should reject purge if no history exists", async function () {
      await expect(
        crm.connect(patient).purgeHistoricalAccess(doctor2.address)
      ).to.be.revertedWith("No history with this doctor");
    });
  });
});
