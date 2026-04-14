const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RoleManager", function () {
  let roleManager;
  let superAdmin, admin1, admin2, adminOther, doctor, researcher, patient, stranger;

  const Role = { NONE: 0, PATIENT: 1, DOCTOR: 2, RESEARCHER: 3, ADMIN: 4, SUPER_ADMIN: 5 };
  const Status = { PENDING: 0, APPROVED: 1, REJECTED: 2 };

  const APOLLO_REG = "NABH-TN-0001";
  const NARAYANA_REG = "NABH-KA-0099";
  const APOLLO = ethers.keccak256(ethers.solidityPacked(["string"], [APOLLO_REG]));
  const NARAYANA = ethers.keccak256(ethers.solidityPacked(["string"], [NARAYANA_REG]));

  const DAY = 86400;
  const COOLDOWN = 7 * DAY;
  const TTL = 14 * DAY;

  // Bootstrap helper: register a hospital via the registry flow,
  // which atomically grants the applicant the ADMIN role bound to that hospital.
  async function registerHospital(applicantSigner, regNum, hospitalName, adminName) {
    await roleManager.connect(applicantSigner).applyForHospital(
      hospitalName, "Chennai", "Tamil Nadu", regNum, "QmHospitalDocs", adminName
    );
    const ids = await roleManager.getPendingHospitalApplications();
    await roleManager.connect(superAdmin).approveHospital(ids[ids.length - 1]);
  }

  beforeEach(async function () {
    [superAdmin, admin1, admin2, adminOther, doctor, researcher, patient, stranger] = await ethers.getSigners();
    const RoleManager = await ethers.getContractFactory("RoleManager");
    roleManager = await RoleManager.deploy();
  });

  describe("Deployment", function () {
    it("should set deployer as super admin", async function () {
      expect(await roleManager.getRole(superAdmin.address)).to.equal(Role.SUPER_ADMIN);
      expect(await roleManager.superAdmin()).to.equal(superAdmin.address);
    });

    it("should set super admin hospitalId to zero", async function () {
      const details = await roleManager.getUserDetails(superAdmin.address);
      expect(details.hospitalId).to.equal(ethers.ZeroHash);
    });
  });

  describe("Patient Self-Registration", function () {
    it("should allow anyone to register as patient", async function () {
      await roleManager.connect(patient).registerAsPatient("Ramesh Kumar");
      expect(await roleManager.getRole(patient.address)).to.equal(Role.PATIENT);
      const details = await roleManager.getUserDetails(patient.address);
      expect(details.displayName).to.equal("Ramesh Kumar");
    });

    it("should reject registration without display name", async function () {
      await expect(
        roleManager.connect(patient).registerAsPatient("")
      ).to.be.revertedWith("Display name required");
    });

    it("should reject duplicate registration", async function () {
      await roleManager.connect(patient).registerAsPatient("Ramesh Kumar");
      await expect(roleManager.connect(patient).registerAsPatient("Ramesh Kumar")).to.be.revertedWith("Already registered");
    });
  });

  describe("Admin Management (Super Admin Only)", function () {
    it("should allow super admin to add hospital admin", async function () {
      await roleManager.addAdmin(admin1.address, APOLLO, "Priya Sharma");
      expect(await roleManager.getRole(admin1.address)).to.equal(Role.ADMIN);
      const details = await roleManager.getUserDetails(admin1.address);
      expect(details.hospitalId).to.equal(APOLLO);
      expect(details.displayName).to.equal("Priya Sharma");
    });

    it("should reject addAdmin without display name", async function () {
      await expect(
        roleManager.addAdmin(admin1.address, APOLLO, "")
      ).to.be.revertedWith("Display name required");
    });

    it("should reject display name longer than 64 chars", async function () {
      const tooLong = "x".repeat(65);
      await expect(
        roleManager.addAdmin(admin1.address, APOLLO, tooLong)
      ).to.be.revertedWith("Display name too long");
    });

    it("should reject admin add without hospitalId", async function () {
      await expect(
        roleManager.addAdmin(admin1.address, ethers.ZeroHash, "Priya Sharma")
      ).to.be.revertedWith("Hospital ID required");
    });

    it("should reject non-super-admin adding admin", async function () {
      await expect(
        roleManager.connect(stranger).addAdmin(admin1.address, APOLLO, "Priya Sharma")
      ).to.be.revertedWith("Only super admin");
    });

    it("should allow super admin to remove admin", async function () {
      await roleManager.addAdmin(admin1.address, APOLLO, "Priya Sharma");
      await roleManager.removeAdmin(admin1.address);
      expect(await roleManager.getRole(admin1.address)).to.equal(Role.NONE);
      const details = await roleManager.getUserDetails(admin1.address);
      expect(details.hospitalId).to.equal(ethers.ZeroHash);
    });

    it("should emit AdminAdded event with hospitalId", async function () {
      await expect(roleManager.addAdmin(admin1.address, APOLLO, "Priya Sharma"))
        .to.emit(roleManager, "AdminAdded").withArgs(admin1.address, APOLLO, superAdmin.address);
    });
  });

  describe("Doctor / Researcher Application", function () {
    beforeEach(async function () {
      await registerHospital(admin1, APOLLO_REG, "Apollo Chennai", "Priya Sharma");
    });

    it("should allow applying for doctor at a hospital", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr. Smith", "Cardiology", "MCI-12345", "QmProfile");
      const app = await roleManager.getApplication(1);
      expect(app.applicant).to.equal(doctor.address);
      expect(app.requestedRole).to.equal(Role.DOCTOR);
      expect(app.hospitalId).to.equal(APOLLO);
      expect(app.status).to.equal(Status.PENDING);
      expect(app.licenseNumber).to.equal("MCI-12345");
      expect(app.profileIPFS).to.equal("QmProfile");
    });

    it("should reject application without hospitalId", async function () {
      await expect(
        roleManager.connect(doctor).applyForRole(Role.DOCTOR, ethers.ZeroHash, "Dr.", "Card", "MCI", "QmProfile")
      ).to.be.revertedWith("Hospital ID required");
    });

    it("should reject application targeting unknown hospital", async function () {
      const unknownHospital = ethers.keccak256(ethers.toUtf8Bytes("ghost"));
      await expect(
        roleManager.connect(doctor).applyForRole(Role.DOCTOR, unknownHospital, "Dr.", "Card", "MCI", "QmProfile")
      ).to.be.revertedWith("Unknown hospital");
    });

    it("should reject doctor application without license number", async function () {
      await expect(
        roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "", "QmProfile")
      ).to.be.revertedWith("License number required");
    });

    it("should reject application without profile IPFS CID", async function () {
      await expect(
        roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI", "")
      ).to.be.revertedWith("Profile IPFS CID required");
    });

    it("should allow researcher application without license number", async function () {
      await roleManager.connect(researcher).applyForRole(Role.RESEARCHER, APOLLO, "Researcher A", "Genomics", "", "QmProfile");
      const app = await roleManager.getApplication(1);
      expect(app.requestedRole).to.equal(Role.RESEARCHER);
      expect(app.licenseNumber).to.equal("");
    });

    it("should emit ApplicationSubmitted with hospitalId", async function () {
      await expect(
        roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr. Smith", "Cardiology", "MCI-12345", "QmProfile")
      ).to.emit(roleManager, "ApplicationSubmitted").withArgs(1, doctor.address, Role.DOCTOR, APOLLO);
    });

    it("should reject duplicate pending application", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI", "QmProfile");
      await expect(
        roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI", "QmProfile")
      ).to.be.revertedWith("Pending application already exists");
    });

    it("should reject applying for admin role", async function () {
      await expect(
        roleManager.connect(stranger).applyForRole(Role.ADMIN, APOLLO, "Hack", "", "NONE", "QmProfile")
      ).to.be.revertedWith("Can only apply for Doctor or Researcher");
    });
  });

  describe("Approval with Hospital Scoping", function () {
    beforeEach(async function () {
      await registerHospital(admin1, APOLLO_REG, "Apollo Chennai", "Priya Sharma");
      await registerHospital(adminOther, NARAYANA_REG, "Narayana Health", "Other Admin");
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr. Smith", "Cardiology", "MCI-12345", "QmProfile");
    });

    it("should allow same-hospital admin to approve", async function () {
      await roleManager.connect(admin1).approveApplication(1);
      expect(await roleManager.getRole(doctor.address)).to.equal(Role.DOCTOR);
      const details = await roleManager.getUserDetails(doctor.address);
      expect(details.hospitalId).to.equal(APOLLO);
    });

    it("should reject cross-hospital approval", async function () {
      await expect(
        roleManager.connect(adminOther).approveApplication(1)
      ).to.be.revertedWith("Different hospital - cannot approve");
    });

    it("should allow super admin to approve regardless of hospital", async function () {
      await roleManager.connect(superAdmin).approveApplication(1);
      expect(await roleManager.getRole(doctor.address)).to.equal(Role.DOCTOR);
    });

    it("should reject cross-hospital rejection", async function () {
      await expect(
        roleManager.connect(adminOther).rejectApplication(1, "test reason")
      ).to.be.revertedWith("Different hospital - cannot reject");
    });

    it("should allow same-hospital admin to reject", async function () {
      await roleManager.connect(admin1).rejectApplication(1, "test reason");
      const app = await roleManager.getApplication(1);
      expect(app.status).to.equal(Status.REJECTED);
    });

    it("should store rejection reason on rejected application", async function () {
      await roleManager.connect(admin1).rejectApplication(1, "License number invalid - please resubmit with MCI verification");
      const app = await roleManager.getApplication(1);
      expect(app.rejectionReason).to.equal("License number invalid - please resubmit with MCI verification");
    });

    it("should inherit hospitalId on approval", async function () {
      await roleManager.connect(admin1).approveApplication(1);
      const details = await roleManager.getUserDetails(doctor.address);
      expect(details.hospitalId).to.equal(APOLLO);
    });

    it("should store displayName and specialization on doctor approval", async function () {
      await roleManager.connect(admin1).approveApplication(1);
      const details = await roleManager.getUserDetails(doctor.address);
      expect(details.displayName).to.equal("Dr. Smith");
      expect(details.specialization).to.equal("Cardiology");
    });
  });

  describe("Super Admin Profile", function () {
    it("should set super admin displayName to 'Super Admin'", async function () {
      const details = await roleManager.getUserDetails(superAdmin.address);
      expect(details.displayName).to.equal("Super Admin");
    });
  });

  describe("Application Cooldown", function () {
    beforeEach(async function () {
      await registerHospital(admin1, APOLLO_REG, "Apollo Chennai", "Priya Sharma");
    });

    it("should reject re-application within cooldown period", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI", "QmProfile");
      await roleManager.connect(admin1).rejectApplication(1, "test reason");

      // Immediately try again
      await expect(
        roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI2", "QmProfile")
      ).to.be.revertedWith("Cooldown active - try again later");
    });

    it("should reject re-application after 6 days", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI", "QmProfile");
      await roleManager.connect(admin1).rejectApplication(1, "test reason");
      await time.increase(6 * DAY);

      await expect(
        roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI2", "QmProfile")
      ).to.be.revertedWith("Cooldown active - try again later");
    });

    it("should allow re-application after cooldown expires", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI", "QmProfile");
      await roleManager.connect(admin1).rejectApplication(1, "test reason");
      await time.increase(COOLDOWN + 1);

      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI2", "QmProfile");
      const app = await roleManager.getApplication(2);
      expect(app.status).to.equal(Status.PENDING);
    });
  });

  describe("Application Expiry", function () {
    beforeEach(async function () {
      await registerHospital(admin1, APOLLO_REG, "Apollo Chennai", "Priya Sharma");
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI", "QmProfile");
    });

    it("isApplicationExpired should be false before TTL", async function () {
      expect(await roleManager.isApplicationExpired(1)).to.be.false;
    });

    it("isApplicationExpired should be true after TTL", async function () {
      await time.increase(TTL + 1);
      expect(await roleManager.isApplicationExpired(1)).to.be.true;
    });

    it("should reject approval of expired application", async function () {
      await time.increase(TTL + 1);
      await expect(
        roleManager.connect(admin1).approveApplication(1)
      ).to.be.revertedWith("Application expired");
    });

    it("should exclude expired applications from getPendingApplications", async function () {
      let pending = await roleManager.getPendingApplications();
      expect(pending.length).to.equal(1);

      await time.increase(TTL + 1);
      pending = await roleManager.getPendingApplications();
      expect(pending.length).to.equal(0);
    });

    it("should allow re-application after pending expiry (treated like no prior)", async function () {
      await time.increase(TTL + 1);
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI2", "QmProfile");
      const app = await roleManager.getApplication(2);
      expect(app.status).to.equal(Status.PENDING);
    });
  });

  describe("Hospital-Filtered Pending Applications", function () {
    beforeEach(async function () {
      await registerHospital(admin1, APOLLO_REG, "Apollo Chennai", "Priya Sharma");
      await registerHospital(adminOther, NARAYANA_REG, "Narayana Health", "Other Admin");

      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr. A", "Card", "MCI-1", "QmProfile");
      await roleManager.connect(researcher).applyForRole(Role.RESEARCHER, NARAYANA, "Dr. B", "", "", "QmProfile");
    });

    it("should return only Apollo applications when filtered", async function () {
      const ids = await roleManager.getPendingApplicationsForHospital(APOLLO);
      expect(ids.length).to.equal(1);
      const app = await roleManager.getApplication(ids[0]);
      expect(app.applicant).to.equal(doctor.address);
    });

    it("should return only Narayana applications when filtered", async function () {
      const ids = await roleManager.getPendingApplicationsForHospital(NARAYANA);
      expect(ids.length).to.equal(1);
      const app = await roleManager.getApplication(ids[0]);
      expect(app.applicant).to.equal(researcher.address);
    });

    it("should return all via getPendingApplications", async function () {
      const all = await roleManager.getPendingApplications();
      expect(all.length).to.equal(2);
    });
  });

  describe("Revocation with Hospital Scoping", function () {
    beforeEach(async function () {
      await registerHospital(admin1, APOLLO_REG, "Apollo Chennai", "Priya Sharma");
      await registerHospital(adminOther, NARAYANA_REG, "Narayana Health", "Other Admin");
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI", "QmProfile");
      await roleManager.connect(admin1).approveApplication(1);
    });

    it("should allow same-hospital admin to revoke doctor", async function () {
      await roleManager.connect(admin1).revokeRole(doctor.address);
      expect(await roleManager.getRole(doctor.address)).to.equal(Role.NONE);
    });

    it("should reject cross-hospital revocation", async function () {
      await expect(
        roleManager.connect(adminOther).revokeRole(doctor.address)
      ).to.be.revertedWith("Different hospital - cannot revoke");
    });

    it("should allow super admin to revoke any doctor", async function () {
      await roleManager.connect(superAdmin).revokeRole(doctor.address);
      expect(await roleManager.getRole(doctor.address)).to.equal(Role.NONE);
    });

    it("should clear hospitalId on revocation", async function () {
      await roleManager.connect(admin1).revokeRole(doctor.address);
      const details = await roleManager.getUserDetails(doctor.address);
      expect(details.hospitalId).to.equal(ethers.ZeroHash);
    });
  });

  describe("Security: Cannot Bypass Role System", function () {
    it("patient cannot call admin functions", async function () {
      await roleManager.connect(patient).registerAsPatient("Ramesh Kumar");
      await expect(
        roleManager.connect(patient).addAdmin(stranger.address, APOLLO, "Hack")
      ).to.be.revertedWith("Only super admin");
    });

    it("doctor cannot approve other applications", async function () {
      await registerHospital(admin1, APOLLO_REG, "Apollo Chennai", "Priya Sharma");
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, APOLLO, "Dr.", "Card", "MCI", "QmProfile");
      await roleManager.connect(admin1).approveApplication(1);

      await roleManager.connect(researcher).applyForRole(Role.RESEARCHER, APOLLO, "Res.", "", "", "QmProfile");
      await expect(
        roleManager.connect(doctor).approveApplication(2)
      ).to.be.revertedWith("Only admin or super admin");
    });

    it("cannot revoke super admin", async function () {
      await expect(roleManager.revokeRole(superAdmin.address)).to.be.revertedWith("Cannot revoke super admin");
    });
  });
});
