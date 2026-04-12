const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RoleManager", function () {
  let roleManager;
  let superAdmin, admin1, admin2, doctor, researcher, patient, stranger;

  const Role = { NONE: 0, PATIENT: 1, DOCTOR: 2, RESEARCHER: 3, ADMIN: 4, SUPER_ADMIN: 5 };
  const Status = { PENDING: 0, APPROVED: 1, REJECTED: 2 };

  beforeEach(async function () {
    [superAdmin, admin1, admin2, doctor, researcher, patient, stranger] = await ethers.getSigners();
    const RoleManager = await ethers.getContractFactory("RoleManager");
    roleManager = await RoleManager.deploy();
  });

  describe("Deployment", function () {
    it("should set deployer as super admin", async function () {
      expect(await roleManager.getRole(superAdmin.address)).to.equal(Role.SUPER_ADMIN);
      expect(await roleManager.superAdmin()).to.equal(superAdmin.address);
    });
  });

  describe("Patient Self-Registration", function () {
    it("should allow anyone to register as patient", async function () {
      await roleManager.connect(patient).registerAsPatient();
      expect(await roleManager.getRole(patient.address)).to.equal(Role.PATIENT);
      expect(await roleManager.isPatient(patient.address)).to.be.true;
    });

    it("should reject duplicate registration", async function () {
      await roleManager.connect(patient).registerAsPatient();
      await expect(roleManager.connect(patient).registerAsPatient()).to.be.revertedWith("Already registered");
    });

    it("should emit PatientRegistered event", async function () {
      await expect(roleManager.connect(patient).registerAsPatient())
        .to.emit(roleManager, "PatientRegistered").withArgs(patient.address);
    });
  });

  describe("Admin Management (Super Admin Only)", function () {
    it("should allow super admin to add admin", async function () {
      await roleManager.addAdmin(admin1.address);
      expect(await roleManager.getRole(admin1.address)).to.equal(Role.ADMIN);
      expect(await roleManager.isAdmin(admin1.address)).to.be.true;
    });

    it("should reject non-super-admin adding admin", async function () {
      await expect(roleManager.connect(stranger).addAdmin(admin1.address)).to.be.revertedWith("Only super admin");
    });

    it("should reject adding admin to wallet with privileged role", async function () {
      await roleManager.addAdmin(admin1.address);
      await expect(roleManager.addAdmin(admin1.address)).to.be.revertedWith("Already has a role");
    });

    it("should allow super admin to remove admin", async function () {
      await roleManager.addAdmin(admin1.address);
      await roleManager.removeAdmin(admin1.address);
      expect(await roleManager.getRole(admin1.address)).to.equal(Role.NONE);
    });

    it("should reject non-super-admin removing admin", async function () {
      await roleManager.addAdmin(admin1.address);
      await expect(roleManager.connect(admin1).removeAdmin(admin1.address)).to.be.revertedWith("Only super admin");
    });

    it("should allow promoting a patient to admin", async function () {
      await roleManager.connect(admin1).registerAsPatient();
      await roleManager.addAdmin(admin1.address);
      expect(await roleManager.getRole(admin1.address)).to.equal(Role.ADMIN);
    });
  });

  describe("Doctor Application & Approval", function () {
    beforeEach(async function () {
      await roleManager.addAdmin(admin1.address);
    });

    it("should allow applying for doctor role", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-12345");
      const app = await roleManager.getApplication(1);
      expect(app.applicant).to.equal(doctor.address);
      expect(app.requestedRole).to.equal(Role.DOCTOR);
      expect(app.status).to.equal(Status.PENDING);
    });

    it("should emit ApplicationSubmitted event", async function () {
      await expect(roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-12345"))
        .to.emit(roleManager, "ApplicationSubmitted").withArgs(1, doctor.address, Role.DOCTOR);
    });

    it("should allow admin to approve", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-12345");
      await roleManager.connect(admin1).approveApplication(1);
      expect(await roleManager.getRole(doctor.address)).to.equal(Role.DOCTOR);
      expect(await roleManager.isDoctor(doctor.address)).to.be.true;
    });

    it("should allow admin to reject", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Fake", "Fake", "NONE");
      await roleManager.connect(admin1).rejectApplication(1);
      const app = await roleManager.getApplication(1);
      expect(app.status).to.equal(Status.REJECTED);
      expect(await roleManager.getRole(doctor.address)).to.equal(Role.NONE);
    });

    it("should reject duplicate pending application", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-12345");
      await expect(
        roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-12345")
      ).to.be.revertedWith("Pending application already exists");
    });

    it("should allow re-application after rejection", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-12345");
      await roleManager.connect(admin1).rejectApplication(1);
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-99999");
      const app = await roleManager.getApplication(2);
      expect(app.status).to.equal(Status.PENDING);
    });

    it("should reject non-admin approving", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-12345");
      await expect(roleManager.connect(stranger).approveApplication(1)).to.be.revertedWith("Only admin or super admin");
    });

    it("should reject applying for admin role", async function () {
      await expect(
        roleManager.connect(stranger).applyForRole(Role.ADMIN, "Hacker", "", "NONE")
      ).to.be.revertedWith("Can only apply for Doctor or Researcher");
    });

    it("should reject applying if already has privileged role", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-12345");
      await roleManager.connect(admin1).approveApplication(1);
      await expect(
        roleManager.connect(doctor).applyForRole(Role.RESEARCHER, "Dr. Smith", "", "CRED")
      ).to.be.revertedWith("Already has a privileged role");
    });
  });

  describe("Researcher Application & Approval", function () {
    beforeEach(async function () {
      await roleManager.addAdmin(admin1.address);
    });

    it("should approve researcher application", async function () {
      await roleManager.connect(researcher).applyForRole(Role.RESEARCHER, "Dr. Researcher", "", "PHD-2025");
      await roleManager.connect(admin1).approveApplication(1);
      expect(await roleManager.getRole(researcher.address)).to.equal(Role.RESEARCHER);
      expect(await roleManager.isResearcher(researcher.address)).to.be.true;
    });
  });

  describe("Role Revocation", function () {
    beforeEach(async function () {
      await roleManager.addAdmin(admin1.address);
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. Smith", "Cardiology", "MCI-12345");
      await roleManager.connect(admin1).approveApplication(1);
    });

    it("should allow admin to revoke doctor", async function () {
      await roleManager.connect(admin1).revokeRole(doctor.address);
      expect(await roleManager.getRole(doctor.address)).to.equal(Role.NONE);
    });

    it("should not allow admin to revoke another admin", async function () {
      await roleManager.addAdmin(admin2.address);
      await expect(roleManager.connect(admin1).revokeRole(admin2.address)).to.be.revertedWith("Only super admin can revoke admins");
    });

    it("should allow super admin to revoke admin", async function () {
      await roleManager.revokeRole(admin1.address);
      expect(await roleManager.getRole(admin1.address)).to.equal(Role.NONE);
    });

    it("should not allow revoking super admin", async function () {
      await expect(roleManager.revokeRole(superAdmin.address)).to.be.revertedWith("Cannot revoke super admin");
    });

    it("should reject revocation from non-admin", async function () {
      await expect(roleManager.connect(stranger).revokeRole(doctor.address)).to.be.revertedWith("Only admin or super admin");
    });
  });

  describe("Pending Applications View", function () {
    beforeEach(async function () {
      await roleManager.addAdmin(admin1.address);
    });

    it("should return pending applications", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. A", "Cardiology", "MCI-1");
      await roleManager.connect(researcher).applyForRole(Role.RESEARCHER, "Dr. B", "", "PHD-1");
      const pending = await roleManager.getPendingApplications();
      expect(pending.length).to.equal(2);
    });

    it("should exclude approved/rejected from pending", async function () {
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr. A", "Cardiology", "MCI-1");
      await roleManager.connect(researcher).applyForRole(Role.RESEARCHER, "Dr. B", "", "PHD-1");
      await roleManager.connect(admin1).approveApplication(1);
      const pending = await roleManager.getPendingApplications();
      expect(pending.length).to.equal(1);
      expect(pending[0]).to.equal(2);
    });
  });

  describe("Security: Cannot Bypass Role System", function () {
    it("patient cannot call admin functions", async function () {
      await roleManager.connect(patient).registerAsPatient();
      await expect(roleManager.connect(patient).addAdmin(stranger.address)).to.be.revertedWith("Only super admin");
    });

    it("doctor cannot approve applications", async function () {
      await roleManager.addAdmin(admin1.address);
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr.", "Card", "MCI");
      await roleManager.connect(admin1).approveApplication(1);
      await roleManager.connect(researcher).applyForRole(Role.RESEARCHER, "Res.", "", "PHD");
      await expect(roleManager.connect(doctor).approveApplication(2)).to.be.revertedWith("Only admin or super admin");
    });

    it("getMyApplication returns latest for wallet", async function () {
      await roleManager.addAdmin(admin1.address);
      await roleManager.connect(doctor).applyForRole(Role.DOCTOR, "Dr.", "Card", "MCI");
      const app = await roleManager.getMyApplication(doctor.address);
      expect(app.applicant).to.equal(doctor.address);
    });
  });
});
