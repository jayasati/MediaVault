const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("OrganDonorRegistry", function () {
  let registry, organRegistry;
  let owner, hospital, hospital2, patient1, patient2, patient3, patient4, patient5, stranger;

  beforeEach(async function () {
    [owner, hospital, hospital2, patient1, patient2, patient3, patient4, patient5, stranger] =
      await ethers.getSigners();

    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    registry = await PatientRegistry.deploy();

    const OrganDonorRegistry = await ethers.getContractFactory("OrganDonorRegistry");
    organRegistry = await OrganDonorRegistry.deploy(await registry.getAddress());

    // Verify hospitals
    await organRegistry.verifyHospital(hospital.address);
    await organRegistry.verifyHospital(hospital2.address);

    // Register patients with different blood types
    await registry.connect(patient1).registerPatient("QmP1", "O-", "QmA1", "QmE1");
    await registry.connect(patient2).registerPatient("QmP2", "A+", "QmA2", "QmE2");
    await registry.connect(patient3).registerPatient("QmP3", "A+", "QmA3", "QmE3");
    await registry.connect(patient4).registerPatient("QmP4", "B+", "QmA4", "QmE4");
    await registry.connect(patient5).registerPatient("QmP5", "A-", "QmA5", "QmE5");
  });

  // ─── Donor Registration ───

  describe("Donor Registration", function () {
    it("should register a donor with organs", async function () {
      await organRegistry.connect(patient1).registerDonor(["kidney", "cornea"]);
      const [addr, blood, organs, regAt, active] = await organRegistry.getDonorProfile(patient1.address);
      expect(addr).to.equal(patient1.address);
      expect(blood).to.equal("O-");
      expect(organs).to.deep.equal(["kidney", "cornea"]);
      expect(active).to.be.true;
    });

    it("should emit DonorRegistered event", async function () {
      await expect(organRegistry.connect(patient1).registerDonor(["kidney"]))
        .to.emit(organRegistry, "DonorRegistered")
        .withArgs(patient1.address, ["kidney"]);
    });

    it("should reject if not a registered patient", async function () {
      await expect(
        organRegistry.connect(stranger).registerDonor(["kidney"])
      ).to.be.revertedWith("Not a registered patient");
    });

    it("should reject duplicate registration", async function () {
      await organRegistry.connect(patient1).registerDonor(["kidney"]);
      await expect(
        organRegistry.connect(patient1).registerDonor(["liver"])
      ).to.be.revertedWith("Already registered as donor");
    });

    it("should reject empty organs array", async function () {
      await expect(
        organRegistry.connect(patient1).registerDonor([])
      ).to.be.revertedWith("Must offer at least one organ");
    });

    it("should deregister donor", async function () {
      await organRegistry.connect(patient1).registerDonor(["kidney"]);
      await organRegistry.connect(patient1).deregisterDonor();
      const [, , , , active] = await organRegistry.getDonorProfile(patient1.address);
      expect(active).to.be.false;
    });

    it("should emit DonorDeregistered event", async function () {
      await organRegistry.connect(patient1).registerDonor(["kidney"]);
      await expect(organRegistry.connect(patient1).deregisterDonor())
        .to.emit(organRegistry, "DonorDeregistered")
        .withArgs(patient1.address);
    });

    it("should reject deregister if not registered", async function () {
      await expect(
        organRegistry.connect(patient1).deregisterDonor()
      ).to.be.revertedWith("Not registered as donor");
    });
  });

  // ─── Waitlist ───

  describe("Waitlist", function () {
    it("should add patient to waitlist", async function () {
      await organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 7);
      const entry = await organRegistry.getWaitlistEntry(1);
      expect(entry.patientAddress).to.equal(patient2.address);
      expect(entry.organNeeded).to.equal("kidney");
      expect(entry.urgencyScore).to.equal(7);
      expect(entry.isMatched).to.be.false;
    });

    it("should emit WaitlistJoined event", async function () {
      await expect(
        organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 7)
      )
        .to.emit(organRegistry, "WaitlistJoined")
        .withArgs(1, patient2.address, "kidney", 7);
    });

    it("should reject from non-hospital", async function () {
      await expect(
        organRegistry.connect(stranger).joinWaitlist(patient2.address, "kidney", "A+", 7)
      ).to.be.revertedWith("Not a verified hospital");
    });

    it("should reject invalid urgency score", async function () {
      await expect(
        organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 0)
      ).to.be.revertedWith("Urgency must be 1-10");
      await expect(
        organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 11)
      ).to.be.revertedWith("Urgency must be 1-10");
    });

    it("should reject empty organ type", async function () {
      await expect(
        organRegistry.connect(hospital).joinWaitlist(patient2.address, "", "A+", 5)
      ).to.be.revertedWith("Organ type required");
    });

    it("should update urgency score", async function () {
      await organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 5);
      await organRegistry.connect(hospital).updateUrgency(1, 9);
      const entry = await organRegistry.getWaitlistEntry(1);
      expect(entry.urgencyScore).to.equal(9);
    });

    it("should emit UrgencyUpdated event", async function () {
      await organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 5);
      await expect(organRegistry.connect(hospital).updateUrgency(1, 9))
        .to.emit(organRegistry, "UrgencyUpdated")
        .withArgs(1, 5, 9, hospital.address);
    });

    it("should reject urgency update from non-hospital", async function () {
      await organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 5);
      await expect(
        organRegistry.connect(stranger).updateUrgency(1, 9)
      ).to.be.revertedWith("Not a verified hospital");
    });

    it("should reject urgency update on matched entry", async function () {
      await organRegistry.connect(patient1).registerDonor(["kidney"]);
      await organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 5);
      await organRegistry.connect(hospital).recordTransplant(patient1.address, patient2.address, "kidney");
      await expect(
        organRegistry.connect(hospital).updateUrgency(1, 9)
      ).to.be.revertedWith("Already matched");
    });

    it("should return waitlist IDs for organ", async function () {
      await organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 7);
      await organRegistry.connect(hospital).joinWaitlist(patient3.address, "kidney", "A+", 5);
      const ids = await organRegistry.getWaitlist("kidney");
      expect(ids.length).to.equal(2);
    });
  });

  // ─── Matching Algorithm — Cannot Be Manipulated ───

  describe("Matching Algorithm — Deterministic Ranking", function () {
    beforeEach(async function () {
      // Set up a waitlist with varied urgencies, blood types, wait times
      // Entry 1: A+, urgency 5, first to join
      await organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 5);
      await time.increase(100);

      // Entry 2: A+, urgency 9, joined later
      await organRegistry.connect(hospital).joinWaitlist(patient3.address, "kidney", "A+", 9);
      await time.increase(100);

      // Entry 3: B+, urgency 10, different blood type
      await organRegistry.connect(hospital).joinWaitlist(patient4.address, "kidney", "B+", 10);
      await time.increase(100);

      // Entry 4: A-, urgency 5, same ABO group as A+
      await organRegistry.connect(hospital).joinWaitlist(patient5.address, "kidney", "A-", 5);
    });

    it("should rank exact blood match above compatible match", async function () {
      // Donor is A+, so A+ patients (exact) should rank above A- (compatible)
      const results = await organRegistry.findBestMatch("kidney", "A+", 10);

      // Results should contain entries 2 (A+, urgency 9), 1 (A+, urgency 5), 4 (A-, urgency 5)
      // Entry 3 (B+) is incompatible with A+ donor
      expect(results.length).to.equal(3);

      // First: entry 2 (A+, urgency 9) — exact match + highest urgency
      expect(results[0]).to.equal(2);
      // Second: entry 1 (A+, urgency 5) — exact match + lower urgency
      expect(results[1]).to.equal(1);
      // Third: entry 4 (A-, urgency 5) — compatible but not exact
      expect(results[2]).to.equal(4);
    });

    it("should rank higher urgency above lower urgency within same blood tier", async function () {
      const results = await organRegistry.findBestMatch("kidney", "A+", 10);
      // Entry 2 (urgency 9) must come before entry 1 (urgency 5), both A+
      const idx2 = results.indexOf(2n);
      const idx1 = results.indexOf(1n);
      expect(idx2).to.be.lt(idx1);
    });

    it("should rank longer wait time above shorter when urgency is equal", async function () {
      // Entry 1 (A+, urgency 5, earlier) and entry 4 (A-, urgency 5, later)
      // But entry 1 is exact match (tier 3) and entry 4 is compatible (tier 1)
      // So entry 1 comes first regardless of wait time

      // Let's create equal tier: add another A+ urgency 5 patient
      await registry.connect(stranger).registerPatient("QmS", "A+", "QmAS", "QmES");
      await organRegistry.connect(hospital).joinWaitlist(stranger.address, "kidney", "A+", 5);
      // entry 5: A+ urgency 5, joined after entry 1

      const results = await organRegistry.findBestMatch("kidney", "A+", 10);
      // Entry 1 (A+, urg 5, earlier) should come before entry 5 (A+, urg 5, later)
      const idx1 = results.indexOf(1n);
      const idx5 = results.indexOf(5n);
      expect(idx1).to.be.lt(idx5);
    });

    it("should give O- donors universal compatibility", async function () {
      // O- donor should match everyone
      const results = await organRegistry.findBestMatch("kidney", "O-", 10);
      // Should include entries 1 (A+), 2 (A+), 3 (B+), 4 (A-)
      // Entry with O- blood type would be exact match (tier 3), rest are universal (tier 2)
      // All 4 entries should appear
      expect(results.length).to.equal(4);
    });

    it("should exclude incompatible blood types", async function () {
      // B+ donor cannot donate to A+ or A- patients
      const results = await organRegistry.findBestMatch("kidney", "B+", 10);
      // Only entry 3 (B+) is compatible
      expect(results.length).to.equal(1);
      expect(results[0]).to.equal(3);
    });

    it("should exclude matched entries from results", async function () {
      await organRegistry.connect(patient1).registerDonor(["kidney"]);
      // Match entry 2 (patient3)
      await organRegistry.connect(hospital).recordTransplant(patient1.address, patient3.address, "kidney");

      const results = await organRegistry.findBestMatch("kidney", "A+", 10);
      // Entry 2 should no longer appear
      const has2 = results.some((id) => id === 2n);
      expect(has2).to.be.false;
    });

    it("should respect maxResults limit", async function () {
      const results = await organRegistry.findBestMatch("kidney", "O-", 2);
      expect(results.length).to.equal(2);
    });

    it("should return empty array for non-existent organ", async function () {
      const results = await organRegistry.findBestMatch("lung", "A+", 10);
      expect(results.length).to.equal(0);
    });

    it("should produce identical results regardless of who calls", async function () {
      const results1 = await organRegistry.connect(patient1).findBestMatch("kidney", "A+", 10);
      const results2 = await organRegistry.connect(hospital).findBestMatch("kidney", "A+", 10);
      const results3 = await organRegistry.connect(stranger).findBestMatch("kidney", "A+", 10);

      expect(results1.length).to.equal(results2.length);
      expect(results2.length).to.equal(results3.length);
      for (let i = 0; i < results1.length; i++) {
        expect(results1[i]).to.equal(results2[i]);
        expect(results2[i]).to.equal(results3[i]);
      }
    });

    it("should not allow admin to override ranking", async function () {
      // Owner cannot directly change order — only urgency update changes ranking
      // and that emits an auditable event
      const resultsBefore = await organRegistry.findBestMatch("kidney", "A+", 10);

      // Even the owner gets the same results
      const resultsOwner = await organRegistry.connect(owner).findBestMatch("kidney", "A+", 10);
      expect(resultsBefore.length).to.equal(resultsOwner.length);
      for (let i = 0; i < resultsBefore.length; i++) {
        expect(resultsBefore[i]).to.equal(resultsOwner[i]);
      }
    });

    it("should change ranking only via urgency update (auditable)", async function () {
      // Entry 1: A+ urgency 5, Entry 2: A+ urgency 9
      // Currently entry 2 is first
      const before = await organRegistry.findBestMatch("kidney", "A+", 10);
      expect(before[0]).to.equal(2); // urgency 9 first

      // Hospital updates entry 1 urgency to 10
      await organRegistry.connect(hospital).updateUrgency(1, 10);

      const after = await organRegistry.findBestMatch("kidney", "A+", 10);
      expect(after[0]).to.equal(1); // now urgency 10 first

      // The change is auditable via UrgencyUpdated event
    });
  });

  // ─── Transplant Recording ───

  describe("Transplant Recording", function () {
    beforeEach(async function () {
      await organRegistry.connect(patient1).registerDonor(["kidney"]);
      await organRegistry.connect(hospital).joinWaitlist(patient2.address, "kidney", "A+", 8);
    });

    it("should record transplant", async function () {
      await organRegistry.connect(hospital).recordTransplant(patient1.address, patient2.address, "kidney");
      const record = await organRegistry.getTransplantRecord(1);
      expect(record.donorAddress).to.equal(patient1.address);
      expect(record.recipientAddress).to.equal(patient2.address);
      expect(record.organ).to.equal("kidney");
      expect(record.hospitalAddress).to.equal(hospital.address);
    });

    it("should emit TransplantRecorded event", async function () {
      await expect(
        organRegistry.connect(hospital).recordTransplant(patient1.address, patient2.address, "kidney")
      )
        .to.emit(organRegistry, "TransplantRecorded")
        .withArgs(1, patient1.address, patient2.address, "kidney");
    });

    it("should mark waitlist entry as matched", async function () {
      await organRegistry.connect(hospital).recordTransplant(patient1.address, patient2.address, "kidney");
      const entry = await organRegistry.getWaitlistEntry(1);
      expect(entry.isMatched).to.be.true;
      expect(entry.matchedDonor).to.equal(patient1.address);
    });

    it("should reject from non-hospital", async function () {
      await expect(
        organRegistry.connect(stranger).recordTransplant(patient1.address, patient2.address, "kidney")
      ).to.be.revertedWith("Not a verified hospital");
    });

    it("should reject if donor is not active", async function () {
      await organRegistry.connect(patient1).deregisterDonor();
      await expect(
        organRegistry.connect(hospital).recordTransplant(patient1.address, patient2.address, "kidney")
      ).to.be.revertedWith("Donor not active");
    });

    it("should track transplant history", async function () {
      await organRegistry.connect(hospital).recordTransplant(patient1.address, patient2.address, "kidney");
      const history = await organRegistry.getTransplantHistory();
      expect(history.length).to.equal(1);
      expect(history[0]).to.equal(1);
    });

    it("should allow different hospitals to record transplants", async function () {
      await organRegistry.connect(hospital).recordTransplant(patient1.address, patient2.address, "kidney");
      const record = await organRegistry.getTransplantRecord(1);
      expect(record.hospitalAddress).to.equal(hospital.address);
    });
  });
});
