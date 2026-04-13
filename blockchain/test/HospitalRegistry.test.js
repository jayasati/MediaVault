const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RoleManager — Hospital Registry", function () {
  let roleManager;
  let superAdmin, applicant, applicant2, doctor, stranger;

  const Role = { NONE: 0, PATIENT: 1, DOCTOR: 2, RESEARCHER: 3, ADMIN: 4, SUPER_ADMIN: 5 };
  const Status = { PENDING: 0, APPROVED: 1, REJECTED: 2 };

  const DAY = 86400;
  const TTL = 14 * DAY;

  const APOLLO = {
    name: "Apollo Chennai",
    city: "Chennai",
    stateName: "Tamil Nadu",
    registrationNumber: "NABH-TN-0001",
    documentsIPFS: "QmApolloDocs",
  };

  const NARAYANA = {
    name: "Narayana Health",
    city: "Bangalore",
    stateName: "Karnataka",
    registrationNumber: "NABH-KA-0099",
    documentsIPFS: "QmNarayanaDocs",
  };

  const apolloId = ethers.keccak256(ethers.solidityPacked(["string"], [APOLLO.registrationNumber]));

  beforeEach(async function () {
    [superAdmin, applicant, applicant2, doctor, stranger] = await ethers.getSigners();
    const RoleManager = await ethers.getContractFactory("RoleManager");
    roleManager = await RoleManager.deploy();
  });

  const apply = (signer, h) =>
    roleManager
      .connect(signer)
      .applyForHospital(h.name, h.city, h.stateName, h.registrationNumber, h.documentsIPFS);

  describe("applyForHospital", function () {
    it("submits an application and emits HospitalApplied", async function () {
      await expect(apply(applicant, APOLLO))
        .to.emit(roleManager, "HospitalApplied")
        .withArgs(1, applicant.address, apolloId);

      const app = await roleManager.getHospitalApplication(1);
      expect(app.applicant).to.equal(applicant.address);
      expect(app.hospitalId).to.equal(apolloId);
      expect(app.name).to.equal(APOLLO.name);
      expect(app.status).to.equal(Status.PENDING);
    });

    it("rejects empty registration number", async function () {
      await expect(
        roleManager.connect(applicant).applyForHospital(APOLLO.name, APOLLO.city, APOLLO.stateName, "", APOLLO.documentsIPFS)
      ).to.be.revertedWith("Registration number required");
    });

    it("rejects empty IPFS CID", async function () {
      await expect(
        roleManager.connect(applicant).applyForHospital(APOLLO.name, APOLLO.city, APOLLO.stateName, APOLLO.registrationNumber, "")
      ).to.be.revertedWith("Documents IPFS CID required");
    });

    it("rejects application from existing privileged user (doctor)", async function () {
      // Seed: applicant becomes an admin via another hospital, then tries to apply again
      await apply(applicant, APOLLO);
      await roleManager.connect(superAdmin).approveHospital(1);
      await expect(apply(applicant, NARAYANA)).to.be.revertedWith("Already has a privileged role");
    });

    it("allows patient to apply (upgrade path)", async function () {
      await roleManager.connect(applicant).registerAsPatient();
      await expect(apply(applicant, APOLLO)).to.emit(roleManager, "HospitalApplied");
    });

    it("rejects duplicate pending application from same wallet", async function () {
      await apply(applicant, APOLLO);
      await expect(apply(applicant, NARAYANA)).to.be.revertedWith("Pending hospital application exists");
    });

    it("rejects re-application for an already-active hospital", async function () {
      await apply(applicant, APOLLO);
      await roleManager.connect(superAdmin).approveHospital(1);
      // A different wallet tries to register the same hospital
      await expect(apply(applicant2, APOLLO)).to.be.revertedWith("Hospital already registered");
    });
  });

  describe("approveHospital", function () {
    beforeEach(async function () {
      await apply(applicant, APOLLO);
    });

    it("creates hospital record and grants ADMIN role atomically", async function () {
      await expect(roleManager.connect(superAdmin).approveHospital(1))
        .to.emit(roleManager, "HospitalApproved")
        .withArgs(1, apolloId, applicant.address)
        .and.to.emit(roleManager, "AdminAdded")
        .withArgs(applicant.address, apolloId, superAdmin.address);

      expect(await roleManager.getRole(applicant.address)).to.equal(Role.ADMIN);
      const details = await roleManager.getUserDetails(applicant.address);
      expect(details.hospitalId).to.equal(apolloId);

      const hospital = await roleManager.getHospital(apolloId);
      expect(hospital.active).to.be.true;
      expect(hospital.name).to.equal(APOLLO.name);
      expect(hospital.currentAdmin).to.equal(applicant.address);
      expect(hospital.documentsIPFS).to.equal(APOLLO.documentsIPFS);
    });

    it("rejects approval by non-super-admin", async function () {
      await expect(roleManager.connect(stranger).approveHospital(1)).to.be.revertedWith("Only super admin");
    });

    it("rejects approval of nonexistent application", async function () {
      await expect(roleManager.connect(superAdmin).approveHospital(999)).to.be.revertedWith("Application does not exist");
    });

    it("rejects double approval", async function () {
      await roleManager.connect(superAdmin).approveHospital(1);
      await expect(roleManager.connect(superAdmin).approveHospital(1)).to.be.revertedWith("Not pending");
    });

    it("rejects approval of expired application", async function () {
      await time.increase(TTL + 1);
      await expect(roleManager.connect(superAdmin).approveHospital(1)).to.be.revertedWith("Application expired");
    });
  });

  describe("rejectHospital", function () {
    beforeEach(async function () {
      await apply(applicant, APOLLO);
    });

    it("marks application rejected with reason", async function () {
      await expect(roleManager.connect(superAdmin).rejectHospital(1, "Registration certificate unreadable"))
        .to.emit(roleManager, "HospitalRejected")
        .withArgs(1, applicant.address, "Registration certificate unreadable");

      const app = await roleManager.getHospitalApplication(1);
      expect(app.status).to.equal(Status.REJECTED);
      expect(app.rejectionReason).to.equal("Registration certificate unreadable");
    });

    it("does not grant ADMIN role on rejection", async function () {
      await roleManager.connect(superAdmin).rejectHospital(1, "nope");
      expect(await roleManager.getRole(applicant.address)).to.equal(Role.NONE);
    });

    it("rejects rejection by non-super-admin", async function () {
      await expect(roleManager.connect(stranger).rejectHospital(1, "x")).to.be.revertedWith("Only super admin");
    });

    it("does NOT create a Hospital record on rejection", async function () {
      await roleManager.connect(superAdmin).rejectHospital(1, "nope");
      const h = await roleManager.getHospital(apolloId);
      expect(h.active).to.be.false;
      expect(h.hospitalId).to.equal(ethers.ZeroHash);
    });
  });

  describe("Views", function () {
    it("getAllHospitals returns only active hospitals", async function () {
      expect((await roleManager.getAllHospitals()).length).to.equal(0);

      await apply(applicant, APOLLO);
      await roleManager.connect(superAdmin).approveHospital(1);

      await apply(applicant2, NARAYANA);
      await roleManager.connect(superAdmin).approveHospital(2);

      const list = await roleManager.getAllHospitals();
      expect(list.length).to.equal(2);
      expect(list[0].name).to.equal(APOLLO.name);
      expect(list[1].name).to.equal(NARAYANA.name);
    });

    it("getPendingHospitalApplications filters by status and expiry", async function () {
      await apply(applicant, APOLLO);
      await apply(applicant2, NARAYANA);

      let pending = await roleManager.getPendingHospitalApplications();
      expect(pending.length).to.equal(2);

      await roleManager.connect(superAdmin).approveHospital(1);
      pending = await roleManager.getPendingHospitalApplications();
      expect(pending.length).to.equal(1);
      expect(pending[0]).to.equal(2n);

      await time.increase(TTL + 1);
      pending = await roleManager.getPendingHospitalApplications();
      expect(pending.length).to.equal(0);
    });
  });

  describe("Security: doctor cannot apply for hospital", function () {
    it("approved doctor cannot call applyForHospital", async function () {
      // Bootstrap: create hospital + admin, then apply doctor
      await apply(applicant, APOLLO);
      await roleManager.connect(superAdmin).approveHospital(1);
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, apolloId, "Dr. Smith", "Cardiology", "MCI-12345");
      await roleManager.connect(applicant).approveApplication(1);
      expect(await roleManager.getRole(doctor.address)).to.equal(Role.DOCTOR);

      await expect(apply(doctor, NARAYANA)).to.be.revertedWith("Already has a privileged role");
    });
  });

  describe("removeAdmin deactivates hospital linkage", function () {
    it("clears currentAdmin and active flag when the bound admin is removed", async function () {
      await apply(applicant, APOLLO);
      await roleManager.connect(superAdmin).approveHospital(1);
      expect((await roleManager.getHospital(apolloId)).active).to.be.true;

      await roleManager.connect(superAdmin).removeAdmin(applicant.address);
      const h = await roleManager.getHospital(apolloId);
      expect(h.active).to.be.false;
      expect(h.currentAdmin).to.equal(ethers.ZeroAddress);
    });
  });
});
