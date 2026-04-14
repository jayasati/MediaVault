const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("AppointmentSystem", function () {
  let roleManager, appointments;
  let superAdmin, admin1, doctor1, doctor2, doctor3, patient, stranger;

  const APOLLO_REG = "NABH-TN-0001";
  const APOLLO = ethers.keccak256(ethers.solidityPacked(["string"], [APOLLO_REG]));
  const DAY = 86400;
  const Status = { REQUESTED: 0, CONFIRMED: 1, REJECTED: 2, COMPLETED: 3, CANCELLED: 4 };

  async function registerDoctor(signer, name, spec, cred) {
    await roleManager.connect(signer).applyForRole(2, APOLLO, name, spec, cred, "QmProfile");
  }

  beforeEach(async function () {
    [superAdmin, admin1, doctor1, doctor2, doctor3, patient, stranger] = await ethers.getSigners();

    const RoleManager = await ethers.getContractFactory("RoleManager");
    roleManager = await RoleManager.deploy();

    const AppointmentSystem = await ethers.getContractFactory("AppointmentSystem");
    appointments = await AppointmentSystem.deploy(await roleManager.getAddress());

    // Bootstrap hospital via the registry flow (atomically grants admin1 the ADMIN role).
    await roleManager.connect(admin1).applyForHospital(
      "Apollo Chennai", "Chennai", "Tamil Nadu", APOLLO_REG, "QmHospitalDocs", "Hospital Admin"
    );
    await roleManager.connect(superAdmin).approveHospital(1);
    await roleManager.connect(patient).registerAsPatient("Test Patient");
  });

  describe("Doctor Profile", function () {
    beforeEach(async function () {
      await registerDoctor(doctor1, "Dr. Smith", "Cardiology", "MCI-1");
      await roleManager.connect(admin1).approveApplication(1);
    });

    it("should allow a verified doctor to create a profile", async function () {
      await appointments
        .connect(doctor1)
        .createProfile("Dr. Smith", "Cardiology", "Delhi", "Senior cardiologist", ethers.parseEther("50"));

      const profile = await appointments.getProfile(doctor1.address);
      expect(profile.name).to.equal("Dr. Smith");
      expect(profile.specialization).to.equal("Cardiology");
      expect(profile.cityDisplay).to.equal("Delhi");
      expect(profile.isListed).to.be.true;
      expect(profile.consultationFeeMEDI).to.equal(ethers.parseEther("50"));
    });

    it("should emit ProfileCreated event", async function () {
      await expect(
        appointments
          .connect(doctor1)
          .createProfile("Dr. Smith", "Cardiology", "Delhi", "Bio", 100)
      ).to.emit(appointments, "ProfileCreated");
    });

    it("should reject profile creation from non-doctor", async function () {
      await expect(
        appointments.connect(stranger).createProfile("Fake", "Spec", "Delhi", "Bio", 100)
      ).to.be.revertedWith("Only registered doctor");
    });

    it("should reject duplicate profile creation", async function () {
      await appointments.connect(doctor1).createProfile("Dr. S", "Card", "Delhi", "B", 100);
      await expect(
        appointments.connect(doctor1).createProfile("Dr. S", "Card", "Delhi", "B", 100)
      ).to.be.revertedWith("Already listed");
    });

    it("should reject empty city", async function () {
      await expect(
        appointments.connect(doctor1).createProfile("Dr.", "Card", "", "B", 100)
      ).to.be.revertedWith("City required");
    });

    it("should allow profile update", async function () {
      await appointments.connect(doctor1).createProfile("Dr. S", "Card", "Delhi", "Old bio", 100);
      await appointments.connect(doctor1).updateProfile("New bio", 200);
      const profile = await appointments.getProfile(doctor1.address);
      expect(profile.bio).to.equal("New bio");
      expect(profile.consultationFeeMEDI).to.equal(200);
    });

    it("should allow delisting", async function () {
      await appointments.connect(doctor1).createProfile("Dr. S", "Card", "Delhi", "B", 100);
      await appointments.connect(doctor1).delistProfile();
      const profile = await appointments.getProfile(doctor1.address);
      expect(profile.isListed).to.be.false;
    });
  });

  describe("Search", function () {
    beforeEach(async function () {
      // Set up 3 doctors with different cities/specializations
      await registerDoctor(doctor1, "Dr. Smith", "Cardiology", "MCI-1");
      await registerDoctor(doctor2, "Dr. Jones", "Cardiology", "MCI-2");
      await registerDoctor(doctor3, "Dr. Patel", "Neurology", "MCI-3");
      await roleManager.connect(admin1).approveApplication(1);
      await roleManager.connect(admin1).approveApplication(2);
      await roleManager.connect(admin1).approveApplication(3);

      await appointments
        .connect(doctor1)
        .createProfile("Dr. Smith", "Cardiology", "Delhi", "", 100);
      await appointments
        .connect(doctor2)
        .createProfile("Dr. Jones", "Cardiology", "Mumbai", "", 120);
      await appointments
        .connect(doctor3)
        .createProfile("Dr. Patel", "Neurology", "Delhi", "", 150);
    });

    it("should find doctors by city (case-insensitive)", async function () {
      const delhi = await appointments.searchByCity("DELHI");
      expect(delhi.length).to.equal(2);
      expect(delhi).to.include.members([doctor1.address, doctor3.address]);
    });

    it("should find doctors by specialization", async function () {
      const cards = await appointments.searchBySpecialization("cardiology");
      expect(cards.length).to.equal(2);
      expect(cards).to.include.members([doctor1.address, doctor2.address]);
    });

    it("should find doctors by city AND specialization", async function () {
      const delhiCard = await appointments.searchByCityAndSpecialization("Delhi", "Cardiology");
      expect(delhiCard.length).to.equal(1);
      expect(delhiCard[0]).to.equal(doctor1.address);
    });

    it("should return empty for unknown city", async function () {
      const res = await appointments.searchByCity("Paris");
      expect(res.length).to.equal(0);
    });

    it("should exclude delisted doctors from search", async function () {
      await appointments.connect(doctor1).delistProfile();
      const cards = await appointments.searchBySpecialization("Cardiology");
      expect(cards.length).to.equal(1);
      expect(cards[0]).to.equal(doctor2.address);
    });

    it("should return all listed doctors", async function () {
      const all = await appointments.getAllDoctors();
      expect(all.length).to.equal(3);
    });
  });

  describe("Appointment Booking", function () {
    let scheduledFor;

    beforeEach(async function () {
      await registerDoctor(doctor1, "Dr. Smith", "Cardiology", "MCI-1");
      await roleManager.connect(admin1).approveApplication(1);
      await appointments
        .connect(doctor1)
        .createProfile("Dr. Smith", "Cardiology", "Delhi", "", 100);
      scheduledFor = (await time.latest()) + 7 * DAY;
    });

    it("should allow patient to book an appointment", async function () {
      await appointments
        .connect(patient)
        .bookAppointment(doctor1.address, scheduledFor, "Chest pain consultation");
      const apt = await appointments.getAppointment(1);
      expect(apt.patient).to.equal(patient.address);
      expect(apt.doctor).to.equal(doctor1.address);
      expect(apt.status).to.equal(Status.REQUESTED);
      expect(apt.reason).to.equal("Chest pain consultation");
    });

    it("should emit AppointmentRequested event", async function () {
      await expect(
        appointments.connect(patient).bookAppointment(doctor1.address, scheduledFor, "Reason")
      ).to.emit(appointments, "AppointmentRequested");
    });

    it("should reject booking by non-patient", async function () {
      await expect(
        appointments.connect(stranger).bookAppointment(doctor1.address, scheduledFor, "Reason")
      ).to.be.revertedWith("Only patients can book");
    });

    it("should reject booking with unlisted doctor", async function () {
      await expect(
        appointments.connect(patient).bookAppointment(doctor2.address, scheduledFor, "Reason")
      ).to.be.revertedWith("Doctor not available");
    });

    it("should reject past scheduled time", async function () {
      const past = (await time.latest()) - DAY;
      await expect(
        appointments.connect(patient).bookAppointment(doctor1.address, past, "Reason")
      ).to.be.revertedWith("Must schedule in future");
    });

    it("should reject empty reason", async function () {
      await expect(
        appointments.connect(patient).bookAppointment(doctor1.address, scheduledFor, "")
      ).to.be.revertedWith("Reason required");
    });

    it("should track patient and doctor appointment lists", async function () {
      await appointments.connect(patient).bookAppointment(doctor1.address, scheduledFor, "R1");
      const pList = await appointments.getPatientAppointments(patient.address);
      const dList = await appointments.getDoctorAppointments(doctor1.address);
      expect(pList.length).to.equal(1);
      expect(dList.length).to.equal(1);
    });
  });

  describe("Appointment Lifecycle", function () {
    let aptId, scheduledFor;

    beforeEach(async function () {
      await registerDoctor(doctor1, "Dr. Smith", "Cardiology", "MCI-1");
      await roleManager.connect(admin1).approveApplication(1);
      await appointments
        .connect(doctor1)
        .createProfile("Dr. Smith", "Cardiology", "Delhi", "", 100);
      scheduledFor = (await time.latest()) + 7 * DAY;
      await appointments.connect(patient).bookAppointment(doctor1.address, scheduledFor, "Checkup");
      aptId = 1;
    });

    it("should allow doctor to confirm", async function () {
      await appointments.connect(doctor1).confirmAppointment(aptId);
      const apt = await appointments.getAppointment(aptId);
      expect(apt.status).to.equal(Status.CONFIRMED);
    });

    it("should allow doctor to reject with reason", async function () {
      await appointments.connect(doctor1).rejectAppointment(aptId, "Overbooked");
      const apt = await appointments.getAppointment(aptId);
      expect(apt.status).to.equal(Status.REJECTED);
      expect(apt.notes).to.equal("Overbooked");
    });

    it("should allow doctor to complete a confirmed appointment", async function () {
      await appointments.connect(doctor1).confirmAppointment(aptId);
      await appointments
        .connect(doctor1)
        .completeAppointment(aptId, "Diagnosis: healthy, follow-up in 6 months");
      const apt = await appointments.getAppointment(aptId);
      expect(apt.status).to.equal(Status.COMPLETED);
      expect(apt.notes).to.include("Diagnosis");
      expect(apt.completedAt).to.be.gt(0);
    });

    it("should allow patient to cancel", async function () {
      await appointments.connect(patient).cancelAppointment(aptId);
      const apt = await appointments.getAppointment(aptId);
      expect(apt.status).to.equal(Status.CANCELLED);
    });

    it("should allow doctor to cancel", async function () {
      await appointments.connect(doctor1).cancelAppointment(aptId);
      const apt = await appointments.getAppointment(aptId);
      expect(apt.status).to.equal(Status.CANCELLED);
    });

    it("should reject stranger from confirming", async function () {
      await expect(
        appointments.connect(stranger).confirmAppointment(aptId)
      ).to.be.revertedWith("Only doctor can confirm");
    });

    it("should reject completing an unconfirmed appointment", async function () {
      await expect(
        appointments.connect(doctor1).completeAppointment(aptId, "Notes")
      ).to.be.revertedWith("Not confirmed");
    });

    it("should reject cancelling a completed appointment", async function () {
      await appointments.connect(doctor1).confirmAppointment(aptId);
      await appointments.connect(doctor1).completeAppointment(aptId, "Done");
      await expect(
        appointments.connect(patient).cancelAppointment(aptId)
      ).to.be.revertedWith("Cannot cancel in current state");
    });

    it("should reject double confirmation", async function () {
      await appointments.connect(doctor1).confirmAppointment(aptId);
      await expect(
        appointments.connect(doctor1).confirmAppointment(aptId)
      ).to.be.revertedWith("Not requested");
    });
  });
});
