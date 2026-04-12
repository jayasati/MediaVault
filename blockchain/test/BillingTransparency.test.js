const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("BillingTransparency", function () {
  let billing;
  let owner, hospital, hospital2, patient, doctor, stranger;

  // Category enum values
  const CAT = { CONSULTATION: 0, MEDICINE: 1, PROCEDURE: 2, ROOM: 3, TEST: 4, OTHER: 5 };
  const STATUS = { PENDING: 0, PATIENT_ACKNOWLEDGED: 1, DISPUTED: 2, RESOLVED: 3 };

  beforeEach(async function () {
    [owner, hospital, hospital2, patient, doctor, stranger] = await ethers.getSigners();

    const BillingTransparency = await ethers.getContractFactory("BillingTransparency");
    billing = await BillingTransparency.deploy();

    await billing.registerHospital(hospital.address);
    await billing.registerHospital(hospital2.address);
  });

  // ── Billable Events ──

  describe("Logging Billable Events", function () {
    it("should log a billable event", async function () {
      await billing.connect(hospital).logBillableEvent(
        patient.address, "Cardiology consultation", 1200, CAT.CONSULTATION, doctor.address
      );
      const evt = await billing.getBillableEvent(1);
      expect(evt.eventId).to.equal(1);
      expect(evt.patientAddress).to.equal(patient.address);
      expect(evt.hospitalAddress).to.equal(hospital.address);
      expect(evt.description).to.equal("Cardiology consultation");
      expect(evt.amount).to.equal(1200);
      expect(evt.category).to.equal(CAT.CONSULTATION);
      expect(evt.doctorAddress).to.equal(doctor.address);
    });

    it("should emit EventLogged event", async function () {
      await expect(
        billing.connect(hospital).logBillableEvent(
          patient.address, "Blood panel", 650, CAT.TEST, doctor.address
        )
      )
        .to.emit(billing, "EventLogged")
        .withArgs(1, patient.address, hospital.address, 650, CAT.TEST);
    });

    it("should reject from non-hospital", async function () {
      await expect(
        billing.connect(stranger).logBillableEvent(
          patient.address, "Consultation", 500, CAT.CONSULTATION, doctor.address
        )
      ).to.be.revertedWith("Not a registered hospital");
    });

    it("should reject zero amount", async function () {
      await expect(
        billing.connect(hospital).logBillableEvent(
          patient.address, "Free", 0, CAT.OTHER, doctor.address
        )
      ).to.be.revertedWith("Amount must be greater than zero");
    });

    it("should reject empty description", async function () {
      await expect(
        billing.connect(hospital).logBillableEvent(
          patient.address, "", 100, CAT.OTHER, doctor.address
        )
      ).to.be.revertedWith("Description required");
    });

    it("should track events per patient", async function () {
      await billing.connect(hospital).logBillableEvent(patient.address, "Event 1", 100, CAT.CONSULTATION, doctor.address);
      await billing.connect(hospital).logBillableEvent(patient.address, "Event 2", 200, CAT.MEDICINE, doctor.address);
      const ids = await billing.getPatientEvents(patient.address);
      expect(ids.length).to.equal(2);
    });
  });

  // ── Final Bills ──

  describe("Generating Final Bills", function () {
    beforeEach(async function () {
      await billing.connect(hospital).logBillableEvent(patient.address, "Consultation", 1200, CAT.CONSULTATION, doctor.address);
      await billing.connect(hospital).logBillableEvent(patient.address, "Blood panel", 650, CAT.TEST, doctor.address);
      await billing.connect(hospital).logBillableEvent(patient.address, "Paracetamol", 50, CAT.MEDICINE, doctor.address);
    });

    it("should generate a valid bill", async function () {
      await billing.connect(hospital).generateFinalBill(patient.address, [1, 2, 3]);
      const [id, pat, hosp, evtIds, total, issuedAt, status] = await billing.getBill(1);
      expect(id).to.equal(1);
      expect(pat).to.equal(patient.address);
      expect(hosp).to.equal(hospital.address);
      expect(evtIds.length).to.equal(3);
      expect(total).to.equal(1900); // 1200 + 650 + 50
      expect(status).to.equal(STATUS.PENDING);
    });

    it("should emit BillGenerated event", async function () {
      await expect(billing.connect(hospital).generateFinalBill(patient.address, [1, 2]))
        .to.emit(billing, "BillGenerated")
        .withArgs(1, patient.address, hospital.address, 1850);
    });

    it("should auto-calculate total from events", async function () {
      await billing.connect(hospital).generateFinalBill(patient.address, [1, 3]);
      const [, , , , total] = await billing.getBill(1);
      expect(total).to.equal(1250); // 1200 + 50
    });

    it("should validate bill correctly", async function () {
      await billing.connect(hospital).generateFinalBill(patient.address, [1, 2, 3]);
      const [valid, reason] = await billing.validateBill(1);
      expect(valid).to.be.true;
      expect(reason).to.equal("Valid");
    });

    it("should reject bill with empty event list", async function () {
      await expect(
        billing.connect(hospital).generateFinalBill(patient.address, [])
      ).to.be.revertedWith("Must include at least one event");
    });

    it("should reject from non-hospital", async function () {
      await expect(
        billing.connect(stranger).generateFinalBill(patient.address, [1])
      ).to.be.revertedWith("Not a registered hospital");
    });
  });

  // ── Phantom Charges (events not logged) ──

  describe("Phantom Charge Prevention", function () {
    beforeEach(async function () {
      await billing.connect(hospital).logBillableEvent(patient.address, "Real event", 500, CAT.CONSULTATION, doctor.address);
    });

    it("should reject bill referencing non-existent event", async function () {
      await expect(
        billing.connect(hospital).generateFinalBill(patient.address, [1, 999])
      ).to.be.revertedWith("Event does not exist");
    });

    it("should reject bill referencing another patient's event", async function () {
      await billing.connect(hospital).logBillableEvent(stranger.address, "Other patient", 300, CAT.TEST, doctor.address);
      // Event 2 belongs to stranger, not patient
      await expect(
        billing.connect(hospital).generateFinalBill(patient.address, [1, 2])
      ).to.be.revertedWith("Event patient mismatch");
    });

    it("should reject bill referencing another hospital's event", async function () {
      await billing.connect(hospital2).logBillableEvent(patient.address, "Other hospital event", 300, CAT.TEST, doctor.address);
      // Event 2 was logged by hospital2, but hospital is generating the bill
      await expect(
        billing.connect(hospital).generateFinalBill(patient.address, [1, 2])
      ).to.be.revertedWith("Event hospital mismatch");
    });

    it("should return invalid for bill referencing deleted/phantom event via validateBill", async function () {
      await billing.connect(hospital).generateFinalBill(patient.address, [1]);
      // Bill 1 is valid
      const [valid] = await billing.validateBill(1);
      expect(valid).to.be.true;

      // Validate non-existent bill
      const [valid2, reason2] = await billing.validateBill(999);
      expect(valid2).to.be.false;
      expect(reason2).to.equal("Bill does not exist");
    });
  });

  // ── Bill Acknowledgement ──

  describe("Bill Acknowledgement", function () {
    beforeEach(async function () {
      await billing.connect(hospital).logBillableEvent(patient.address, "Consultation", 1000, CAT.CONSULTATION, doctor.address);
      await billing.connect(hospital).generateFinalBill(patient.address, [1]);
    });

    it("should allow patient to acknowledge", async function () {
      await billing.connect(patient).acknowledgeBill(1);
      const [, , , , , , status] = await billing.getBill(1);
      expect(status).to.equal(STATUS.PATIENT_ACKNOWLEDGED);
    });

    it("should emit BillAcknowledged event", async function () {
      await expect(billing.connect(patient).acknowledgeBill(1))
        .to.emit(billing, "BillAcknowledged")
        .withArgs(1, patient.address);
    });

    it("should reject acknowledgement from non-patient", async function () {
      await expect(
        billing.connect(stranger).acknowledgeBill(1)
      ).to.be.revertedWith("Only patient can acknowledge");
    });

    it("should reject acknowledging non-existent bill", async function () {
      await expect(
        billing.connect(patient).acknowledgeBill(999)
      ).to.be.revertedWith("Bill does not exist");
    });

    it("should reject double acknowledgement", async function () {
      await billing.connect(patient).acknowledgeBill(1);
      await expect(
        billing.connect(patient).acknowledgeBill(1)
      ).to.be.revertedWith("Bill is not pending");
    });

    it("should return unacknowledged bills", async function () {
      await billing.connect(hospital).logBillableEvent(patient.address, "Test", 200, CAT.TEST, doctor.address);
      await billing.connect(hospital).generateFinalBill(patient.address, [2]);
      // 2 pending bills
      let unack = await billing.getUnacknowledgedBills(patient.address);
      expect(unack.length).to.equal(2);

      // Acknowledge first
      await billing.connect(patient).acknowledgeBill(1);
      unack = await billing.getUnacknowledgedBills(patient.address);
      expect(unack.length).to.equal(1);
      expect(unack[0]).to.equal(2);
    });
  });

  // ── Dispute Flow ──

  describe("Dispute Flow", function () {
    beforeEach(async function () {
      await billing.connect(hospital).logBillableEvent(patient.address, "Consultation", 1000, CAT.CONSULTATION, doctor.address);
      await billing.connect(hospital).logBillableEvent(patient.address, "Suspicious charge", 5000, CAT.PROCEDURE, doctor.address);
      await billing.connect(hospital).generateFinalBill(patient.address, [1, 2]);
    });

    it("should allow patient to raise dispute", async function () {
      await billing.connect(patient).raiseDispute(1, "Suspicious charge not performed", 5000);
      const d = await billing.getDispute(1);
      expect(d.disputeId).to.equal(1);
      expect(d.billId).to.equal(1);
      expect(d.patientAddress).to.equal(patient.address);
      expect(d.reason).to.equal("Suspicious charge not performed");
      expect(d.contestedAmount).to.equal(5000);
      expect(d.isResolved).to.be.false;
    });

    it("should emit DisputeRaised event", async function () {
      await expect(billing.connect(patient).raiseDispute(1, "Overcharged", 3000))
        .to.emit(billing, "DisputeRaised")
        .withArgs(1, 1, patient.address, 3000);
    });

    it("should mark bill as disputed", async function () {
      await billing.connect(patient).raiseDispute(1, "Overcharged", 5000);
      const [, , , , , , status] = await billing.getBill(1);
      expect(status).to.equal(STATUS.DISPUTED);
    });

    it("should reject dispute from non-patient", async function () {
      await expect(
        billing.connect(stranger).raiseDispute(1, "Fraud", 1000)
      ).to.be.revertedWith("Only patient can dispute");
    });

    it("should reject duplicate dispute on same bill", async function () {
      await billing.connect(patient).raiseDispute(1, "First dispute", 5000);
      await expect(
        billing.connect(patient).raiseDispute(1, "Second dispute", 3000)
      ).to.be.revertedWith("Bill cannot be disputed");
    });

    it("should reject zero contested amount", async function () {
      await expect(
        billing.connect(patient).raiseDispute(1, "Reason", 0)
      ).to.be.revertedWith("Invalid contested amount");
    });

    it("should reject contested amount exceeding bill total", async function () {
      await expect(
        billing.connect(patient).raiseDispute(1, "Reason", 99999)
      ).to.be.revertedWith("Invalid contested amount");
    });

    it("should reject empty reason", async function () {
      await expect(
        billing.connect(patient).raiseDispute(1, "", 1000)
      ).to.be.revertedWith("Reason required");
    });

    it("should allow dispute on acknowledged bill", async function () {
      await billing.connect(patient).acknowledgeBill(1);
      await billing.connect(patient).raiseDispute(1, "Found error after review", 1000);
      const [, , , , , , status] = await billing.getBill(1);
      expect(status).to.equal(STATUS.DISPUTED);
    });

    it("should not allow acknowledgement on disputed bill", async function () {
      await billing.connect(patient).raiseDispute(1, "Issue", 1000);
      await expect(
        billing.connect(patient).acknowledgeBill(1)
      ).to.be.revertedWith("Bill is not pending");
    });

    // ── Resolution ──

    it("should allow admin to resolve dispute", async function () {
      await billing.connect(patient).raiseDispute(1, "Overcharged", 5000);
      await billing.resolveDispute(1);
      const d = await billing.getDispute(1);
      expect(d.isResolved).to.be.true;
      expect(d.resolvedAt).to.be.gt(0);
    });

    it("should emit DisputeResolved event", async function () {
      await billing.connect(patient).raiseDispute(1, "Overcharged", 5000);
      await expect(billing.resolveDispute(1))
        .to.emit(billing, "DisputeResolved")
        .withArgs(1, 1);
    });

    it("should mark bill as resolved", async function () {
      await billing.connect(patient).raiseDispute(1, "Overcharged", 5000);
      await billing.resolveDispute(1);
      const [, , , , , , status] = await billing.getBill(1);
      expect(status).to.equal(STATUS.RESOLVED);
    });

    it("should reject resolution from non-admin", async function () {
      await billing.connect(patient).raiseDispute(1, "Overcharged", 5000);
      await expect(
        billing.connect(hospital).resolveDispute(1)
      ).to.be.revertedWithCustomError(billing, "OwnableUnauthorizedAccount");
    });

    it("should reject resolving already resolved dispute", async function () {
      await billing.connect(patient).raiseDispute(1, "Overcharged", 5000);
      await billing.resolveDispute(1);
      await expect(billing.resolveDispute(1)).to.be.revertedWith("Already resolved");
    });

    it("should reject resolving non-existent dispute", async function () {
      await expect(billing.resolveDispute(999)).to.be.revertedWith("Dispute does not exist");
    });
  });

  // ── Bill Amount Mismatch Detection ──

  describe("Bill Amount Validation", function () {
    it("should auto-sum correctly for multiple events", async function () {
      await billing.connect(hospital).logBillableEvent(patient.address, "A", 100, CAT.CONSULTATION, doctor.address);
      await billing.connect(hospital).logBillableEvent(patient.address, "B", 250, CAT.MEDICINE, doctor.address);
      await billing.connect(hospital).logBillableEvent(patient.address, "C", 75, CAT.TEST, doctor.address);
      await billing.connect(hospital).generateFinalBill(patient.address, [1, 2, 3]);

      const [, , , , total] = await billing.getBill(1);
      expect(total).to.equal(425);

      const [valid] = await billing.validateBill(1);
      expect(valid).to.be.true;
    });

    it("should validate single-event bill", async function () {
      await billing.connect(hospital).logBillableEvent(patient.address, "Single", 999, CAT.PROCEDURE, doctor.address);
      await billing.connect(hospital).generateFinalBill(patient.address, [1]);
      const [valid, reason] = await billing.validateBill(1);
      expect(valid).to.be.true;
      expect(reason).to.equal("Valid");
    });
  });
});
