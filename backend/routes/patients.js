const express = require("express");
const router = express.Router();
const Patient = require("../models/Patient");
const auth = require("../middleware/auth");

// Get all patients (protected)
router.get("/", auth, async (req, res) => {
  try {
    const patients = await Patient.find();
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get patient by wallet address
router.get("/:walletAddress", auth, async (req, res) => {
  try {
    const patient = await Patient.findOne({
      walletAddress: req.params.walletAddress,
    });
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json(patient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register new patient
router.post("/", auth, async (req, res) => {
  try {
    const patient = new Patient(req.body);
    await patient.save();
    res.status(201).json(patient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update patient record
router.put("/:walletAddress", auth, async (req, res) => {
  try {
    const patient = await Patient.findOneAndUpdate(
      { walletAddress: req.params.walletAddress },
      req.body,
      { new: true }
    );
    if (!patient) return res.status(404).json({ error: "Patient not found" });
    res.json(patient);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
