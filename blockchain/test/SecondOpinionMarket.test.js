const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SecondOpinionMarket", function () {
  let mediToken, market;
  let owner, patient, doctor1, doctor2, doctor3, stranger;

  const HOUR = 3600;
  const DAY = 86400;
  const BOUNTY = ethers.parseEther("100"); // 100 MEDI

  // Helper: compute commit hash
  function computeHash(opinionIPFS, salt) {
    return ethers.keccak256(ethers.solidityPacked(["string", "string"], [opinionIPFS, salt]));
  }

  beforeEach(async function () {
    [owner, patient, doctor1, doctor2, doctor3, stranger] = await ethers.getSigners();

    // Deploy MEDIToken
    const MEDIToken = await ethers.getContractFactory("MEDIToken");
    mediToken = await MEDIToken.deploy();

    // Deploy SecondOpinionMarket
    const SecondOpinionMarket = await ethers.getContractFactory("SecondOpinionMarket");
    market = await SecondOpinionMarket.deploy(await mediToken.getAddress());

    // Approve market as platform so it can transferFrom
    await mediToken.approvePlatform(await market.getAddress());

    // Fund patient with MEDI tokens
    await mediToken.mint(patient.address, ethers.parseEther("10000"));
  });

  // Helper: post a standard request
  async function postStandardRequest() {
    await market.connect(patient).postRequest("QmCaseHash123", BOUNTY, 24); // 24h deadline
    return 1; // requestId
  }

  // Helper: full commit-reveal-select flow
  async function fullFlow() {
    const requestId = await postStandardRequest();
    const opinionIPFS = "QmOpinion1";
    const salt = "secret_salt_1";
    const hash = computeHash(opinionIPFS, salt);

    // Commit
    await market.connect(doctor1).commitOpinion(requestId, hash);

    // Advance past commit deadline
    await time.increase(25 * HOUR);

    // Reveal
    await market.connect(doctor1).revealOpinion(1, opinionIPFS, salt);

    // Advance past reveal deadline
    await time.increase(3 * DAY);

    return { requestId, commitId: 1, opinionIPFS, salt };
  }

  // ── Posting Requests ──

  describe("Posting Requests", function () {
    it("should post a request and escrow tokens", async function () {
      await postStandardRequest();
      const req = await market.getRequest(1);
      expect(req.requestId).to.equal(1);
      expect(req.patientAddress).to.equal(patient.address);
      expect(req.caseIPFSHash).to.equal("QmCaseHash123");
      expect(req.bountyAmount).to.equal(BOUNTY);
      expect(req.isOpen).to.be.true;

      // Tokens should be in the contract
      const marketBal = await mediToken.balanceOf(await market.getAddress());
      expect(marketBal).to.equal(BOUNTY);
    });

    it("should emit RequestPosted event", async function () {
      await expect(market.connect(patient).postRequest("QmCase", BOUNTY, 24))
        .to.emit(market, "RequestPosted");
    });

    it("should reject empty case hash", async function () {
      await expect(
        market.connect(patient).postRequest("", BOUNTY, 24)
      ).to.be.revertedWith("Case IPFS hash required");
    });

    it("should reject zero bounty", async function () {
      await expect(
        market.connect(patient).postRequest("QmCase", 0, 24)
      ).to.be.revertedWith("Bounty must be greater than zero");
    });

    it("should reject zero duration", async function () {
      await expect(
        market.connect(patient).postRequest("QmCase", BOUNTY, 0)
      ).to.be.revertedWith("Duration must be at least 1 hour");
    });

    it("should track open requests", async function () {
      await postStandardRequest();
      await market.connect(patient).postRequest("QmCase2", BOUNTY, 48);
      const open = await market.getOpenRequests();
      expect(open.length).to.equal(2);
    });
  });

  // ── Commit Phase ──

  describe("Commit Phase", function () {
    let requestId;

    beforeEach(async function () {
      requestId = await postStandardRequest();
    });

    it("should accept a valid commit", async function () {
      const hash = computeHash("QmOpinion1", "salt1");
      await market.connect(doctor1).commitOpinion(requestId, hash);
      const c = await market.getCommit(1);
      expect(c.commitId).to.equal(1);
      expect(c.doctorAddress).to.equal(doctor1.address);
      expect(c.commitHash).to.equal(hash);
      expect(c.isRevealed).to.be.false;
    });

    it("should emit OpinionCommitted event", async function () {
      const hash = computeHash("QmOp", "s");
      await expect(market.connect(doctor1).commitOpinion(requestId, hash))
        .to.emit(market, "OpinionCommitted")
        .withArgs(1, requestId, doctor1.address);
    });

    it("should accept multiple doctors committing", async function () {
      await market.connect(doctor1).commitOpinion(requestId, computeHash("QmA", "s1"));
      await market.connect(doctor2).commitOpinion(requestId, computeHash("QmB", "s2"));
      const cids = await market.getCommitsForRequest(requestId);
      expect(cids.length).to.equal(2);
    });

    it("should reject commit after deadline", async function () {
      await time.increase(25 * HOUR);
      await expect(
        market.connect(doctor1).commitOpinion(requestId, computeHash("Qm", "s"))
      ).to.be.revertedWith("Commit deadline passed");
    });

    it("should reject patient committing to own request", async function () {
      await expect(
        market.connect(patient).commitOpinion(requestId, computeHash("Qm", "s"))
      ).to.be.revertedWith("Patient cannot commit opinion");
    });

    it("should reject duplicate commit from same doctor", async function () {
      await market.connect(doctor1).commitOpinion(requestId, computeHash("Qm1", "s1"));
      await expect(
        market.connect(doctor1).commitOpinion(requestId, computeHash("Qm2", "s2"))
      ).to.be.revertedWith("Already committed to this request");
    });

    it("should reject zero commit hash", async function () {
      await expect(
        market.connect(doctor1).commitOpinion(requestId, ethers.ZeroHash)
      ).to.be.revertedWith("Invalid commit hash");
    });

    it("should reject commit to non-existent request", async function () {
      await expect(
        market.connect(doctor1).commitOpinion(999, computeHash("Qm", "s"))
      ).to.be.revertedWith("Request does not exist");
    });
  });

  // ── Reveal Phase — Commit-Reveal Integrity ──

  describe("Reveal Phase — Commit-Reveal Integrity", function () {
    let requestId;
    const opinionIPFS = "QmOpinionContent123";
    const salt = "my_secret_salt";

    beforeEach(async function () {
      requestId = await postStandardRequest();
      const hash = computeHash(opinionIPFS, salt);
      await market.connect(doctor1).commitOpinion(requestId, hash);
      // Move past commit deadline
      await time.increase(25 * HOUR);
    });

    it("should reveal successfully with correct hash + salt", async function () {
      await market.connect(doctor1).revealOpinion(1, opinionIPFS, salt);
      const c = await market.getCommit(1);
      expect(c.isRevealed).to.be.true;
      expect(c.revealedIPFSHash).to.equal(opinionIPFS);
      expect(c.salt).to.equal(salt);
    });

    it("should emit OpinionRevealed event", async function () {
      await expect(market.connect(doctor1).revealOpinion(1, opinionIPFS, salt))
        .to.emit(market, "OpinionRevealed")
        .withArgs(1, requestId, doctor1.address);
    });

    it("should reject reveal with wrong IPFS hash", async function () {
      await expect(
        market.connect(doctor1).revealOpinion(1, "QmWrongHash", salt)
      ).to.be.revertedWith("Hash mismatch - invalid reveal");
    });

    it("should reject reveal with wrong salt", async function () {
      await expect(
        market.connect(doctor1).revealOpinion(1, opinionIPFS, "wrong_salt")
      ).to.be.revertedWith("Hash mismatch - invalid reveal");
    });

    it("should reject reveal with both wrong", async function () {
      await expect(
        market.connect(doctor1).revealOpinion(1, "QmFake", "fake_salt")
      ).to.be.revertedWith("Hash mismatch - invalid reveal");
    });

    it("should reject reveal before commit deadline", async function () {
      // Post another request and commit immediately
      await market.connect(patient).postRequest("QmCase2", BOUNTY, 48);
      const hash2 = computeHash("QmOp2", "s2");
      await market.connect(doctor2).commitOpinion(2, hash2);
      // Don't advance time — still in commit phase
      await expect(
        market.connect(doctor2).revealOpinion(2, "QmOp2", "s2")
      ).to.be.revertedWith("Commit phase not ended");
    });

    it("should reject reveal after reveal deadline", async function () {
      await time.increase(3 * DAY); // past reveal deadline
      await expect(
        market.connect(doctor1).revealOpinion(1, opinionIPFS, salt)
      ).to.be.revertedWith("Reveal deadline passed");
    });

    it("should reject duplicate reveal", async function () {
      await market.connect(doctor1).revealOpinion(1, opinionIPFS, salt);
      await expect(
        market.connect(doctor1).revealOpinion(1, opinionIPFS, salt)
      ).to.be.revertedWith("Already revealed");
    });

    it("should reject reveal by non-author", async function () {
      await expect(
        market.connect(doctor2).revealOpinion(1, opinionIPFS, salt)
      ).to.be.revertedWith("Not your commit");
    });

    it("should not expose opinions before reveal deadline via getRevealedOpinions", async function () {
      await market.connect(doctor1).revealOpinion(1, opinionIPFS, salt);
      // Still within reveal window (commit deadline + 2 days)
      // getRevealedOpinions should return empty until reveal deadline passes
      const revealed = await market.getRevealedOpinions(requestId);
      expect(revealed.length).to.equal(0);

      // Advance past reveal deadline
      await time.increase(3 * DAY);
      const revealedAfter = await market.getRevealedOpinions(requestId);
      expect(revealedAfter.length).to.equal(1);
    });
  });

  // ── Selection & Bounty Payment ──

  describe("Selection & Bounty Payment", function () {
    it("should pay 95% to doctor and 5% to owner", async function () {
      const { requestId, commitId } = await fullFlow();

      const doctorBefore = await mediToken.balanceOf(doctor1.address);
      const ownerBefore = await mediToken.balanceOf(owner.address);

      await market.connect(patient).selectOpinion(requestId, commitId);

      const doctorAfter = await mediToken.balanceOf(doctor1.address);
      const ownerAfter = await mediToken.balanceOf(owner.address);

      const expectedDoctorPay = BOUNTY - (BOUNTY * 500n / 10000n); // 95 MEDI
      const expectedFee = BOUNTY * 500n / 10000n; // 5 MEDI

      expect(doctorAfter - doctorBefore).to.equal(expectedDoctorPay);
      expect(ownerAfter - ownerBefore).to.equal(expectedFee);
    });

    it("should emit OpinionSelected and BountyPaid events", async function () {
      const { requestId, commitId } = await fullFlow();
      const tx = market.connect(patient).selectOpinion(requestId, commitId);
      await expect(tx).to.emit(market, "OpinionSelected").withArgs(requestId, commitId, doctor1.address);
      await expect(tx).to.emit(market, "BountyPaid");
    });

    it("should mark request as closed and commit as selected", async function () {
      const { requestId, commitId } = await fullFlow();
      await market.connect(patient).selectOpinion(requestId, commitId);

      const req = await market.getRequest(requestId);
      expect(req.isOpen).to.be.false;
      expect(req.selectedOpinionId).to.equal(commitId);

      const c = await market.getCommit(commitId);
      expect(c.isSelected).to.be.true;
    });

    it("should reject selection before reveal deadline", async function () {
      await postStandardRequest();
      const hash = computeHash("QmOp", "s");
      await market.connect(doctor1).commitOpinion(1, hash);
      await time.increase(25 * HOUR);
      await market.connect(doctor1).revealOpinion(1, "QmOp", "s");
      // Don't advance past reveal deadline
      await expect(
        market.connect(patient).selectOpinion(1, 1)
      ).to.be.revertedWith("Reveal phase not ended");
    });

    it("should reject selection of unrevealed opinion", async function () {
      await postStandardRequest();
      const hash = computeHash("QmOp", "s");
      await market.connect(doctor1).commitOpinion(1, hash);
      await time.increase(25 * HOUR + 3 * DAY);
      // Doctor never revealed
      await expect(
        market.connect(patient).selectOpinion(1, 1)
      ).to.be.revertedWith("Opinion not revealed");
    });

    it("should reject selection by non-patient", async function () {
      const { requestId, commitId } = await fullFlow();
      await expect(
        market.connect(stranger).selectOpinion(requestId, commitId)
      ).to.be.revertedWith("Only patient can select");
    });

    it("should reject selecting commit from different request", async function () {
      // Two requests, cross-select
      await market.connect(patient).postRequest("QmCase1", BOUNTY, 24);
      await market.connect(patient).postRequest("QmCase2", BOUNTY, 24);
      await market.connect(doctor1).commitOpinion(1, computeHash("Qm1", "s1"));
      await market.connect(doctor2).commitOpinion(2, computeHash("Qm2", "s2"));
      await time.increase(25 * HOUR);
      await market.connect(doctor1).revealOpinion(1, "Qm1", "s1");
      await market.connect(doctor2).revealOpinion(2, "Qm2", "s2");
      await time.increase(3 * DAY);

      // Try to select commit 2 (belongs to request 2) on request 1
      await expect(
        market.connect(patient).selectOpinion(1, 2)
      ).to.be.revertedWith("Commit does not belong to this request");
    });
  });

  // ── Cancellation & Refund ──

  describe("Cancellation & Refund", function () {
    it("should refund bounty on cancellation", async function () {
      await postStandardRequest();
      const balBefore = await mediToken.balanceOf(patient.address);
      await market.connect(patient).cancelRequest(1);
      const balAfter = await mediToken.balanceOf(patient.address);
      expect(balAfter - balBefore).to.equal(BOUNTY);
    });

    it("should emit RequestCancelled event", async function () {
      await postStandardRequest();
      await expect(market.connect(patient).cancelRequest(1))
        .to.emit(market, "RequestCancelled")
        .withArgs(1, patient.address, BOUNTY);
    });

    it("should mark request as closed", async function () {
      await postStandardRequest();
      await market.connect(patient).cancelRequest(1);
      const req = await market.getRequest(1);
      expect(req.isOpen).to.be.false;
    });

    it("should reject cancel if commits exist", async function () {
      await postStandardRequest();
      await market.connect(doctor1).commitOpinion(1, computeHash("Qm", "s"));
      await expect(
        market.connect(patient).cancelRequest(1)
      ).to.be.revertedWith("Cannot cancel - commits exist");
    });

    it("should reject cancel by non-patient", async function () {
      await postStandardRequest();
      await expect(
        market.connect(stranger).cancelRequest(1)
      ).to.be.revertedWith("Only patient can cancel");
    });

    it("should reject cancel on already closed request", async function () {
      await postStandardRequest();
      await market.connect(patient).cancelRequest(1);
      await expect(
        market.connect(patient).cancelRequest(1)
      ).to.be.revertedWith("Request is not open");
    });
  });

  // ── Multi-doctor Scenario ──

  describe("Multi-Doctor Complete Flow", function () {
    it("should handle 3 doctors committing, 2 revealing, 1 selected", async function () {
      await postStandardRequest();

      // 3 doctors commit
      await market.connect(doctor1).commitOpinion(1, computeHash("QmOp1", "salt1"));
      await market.connect(doctor2).commitOpinion(1, computeHash("QmOp2", "salt2"));
      await market.connect(doctor3).commitOpinion(1, computeHash("QmOp3", "salt3"));

      // Past commit deadline
      await time.increase(25 * HOUR);

      // Only doctor1 and doctor2 reveal (doctor3 misses deadline)
      await market.connect(doctor1).revealOpinion(1, "QmOp1", "salt1");
      await market.connect(doctor2).revealOpinion(2, "QmOp2", "salt2");

      // Past reveal deadline
      await time.increase(3 * DAY);

      // Doctor3 can't reveal anymore
      await expect(
        market.connect(doctor3).revealOpinion(3, "QmOp3", "salt3")
      ).to.be.revertedWith("Reveal deadline passed");

      // Only 2 revealed opinions visible
      const revealed = await market.getRevealedOpinions(1);
      expect(revealed.length).to.equal(2);

      // Patient selects doctor2
      await market.connect(patient).selectOpinion(1, 2);

      const c2 = await market.getCommit(2);
      expect(c2.isSelected).to.be.true;

      // Doctor2 received payment
      const doc2Bal = await mediToken.balanceOf(doctor2.address);
      expect(doc2Bal).to.equal(ethers.parseEther("95")); // 95% of 100
    });
  });
});
