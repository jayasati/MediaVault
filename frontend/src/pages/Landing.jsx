import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import useIPFS from "@/hooks/useIPFS";
import { useWalletStore } from "@/store";
import toast from "react-hot-toast";
import {
  Wallet,
  Shield,
  Stethoscope,
  Settings,
  FlaskConical,
  Building2,
  FileText,
  Pill,
  QrCode,
  Heart,
  Receipt,
  Database,
  ArrowRight,
  ChevronRight,
  Lock,
  Blocks,
  HardDrive,
  ShieldCheck,
  ExternalLink,
  Github,
  Clock,
  AlertTriangle,
} from "lucide-react";

/* ───────── role config ───────── */
const ROLES = [
  {
    id: "patient",
    label: "Patient",
    icon: Shield,
    path: "/patient",
    color: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    iconBg: "bg-teal-500/20",
    features: [
      "Upload & encrypt health records on IPFS",
      "Grant or revoke doctor access on-chain",
      "Emergency QR profile for first responders",
      "Track prescriptions & compliance",
    ],
  },
  {
    id: "doctor",
    label: "Doctor",
    icon: Stethoscope,
    path: "/doctor",
    color: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    iconBg: "bg-blue-500/20",
    features: [
      "Request patient record access",
      "Write prescriptions on-chain",
      "Provide second opinions for MEDI rewards",
      "Build verifiable reputation score",
    ],
  },
  {
    id: "researcher",
    label: "Researcher",
    icon: FlaskConical,
    path: "/researcher",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    iconBg: "bg-purple-500/20",
    features: [
      "Access anonymized health datasets",
      "Run analytics on population data",
      "Purchase data access with MEDI tokens",
      "Contribute to medical research",
    ],
  },
];

const FEATURES = [
  { icon: FileText, title: "Patient Records", desc: "Encrypted health records stored on IPFS with on-chain access control. Only you hold the decryption key." },
  { icon: Pill, title: "Prescription Guard", desc: "Tamper-proof prescriptions verified on blockchain. Controlled substance tracking with full audit trail." },
  { icon: QrCode, title: "Emergency QR", desc: "Scannable QR code encodes your patient ID and contract address for instant emergency access." },
  { icon: Heart, title: "Organ Donor", desc: "On-chain organ donor registration. Toggle status anytime — immutable, transparent, and instant." },
  { icon: Receipt, title: "Bill Transparency", desc: "Every medical charge recorded on-chain. No hidden fees, no surprises, complete billing audit trail." },
  { icon: Database, title: "Data Marketplace", desc: "Anonymized data contributions rewarded with MEDI tokens. You control what gets shared." },
];

const STEPS = [
  { num: "01", title: "Connect your wallet", desc: "Link your MetaMask wallet to authenticate securely on the blockchain." },
  { num: "02", title: "Select your role", desc: "Register as a Patient instantly, or apply as a Doctor or Researcher (admin-approved)." },
  { num: "03", title: "Access dashboard", desc: "Manage records, prescriptions, access control, and more from your personalized dashboard." },
];

const STATS = [
  { icon: Blocks, label: "Smart Contracts", value: "6" },
  { icon: ShieldCheck, label: "Sepolia Testnet", value: "Live" },
  { icon: HardDrive, label: "IPFS Storage", value: "Pinata" },
  { icon: Lock, label: "Encryption", value: "AES-256" },
];

/* ── Role enum must match Solidity ── */
const ROLE_ENUM = { NONE: 0, PATIENT: 1, DOCTOR: 2, RESEARCHER: 3, ADMIN: 4, SUPER_ADMIN: 5 };
const ROLE_PATHS = { 1: "/patient", 2: "/doctor", 3: "/researcher", 4: "/admin", 5: "/super-admin" };

/* ───────── small helpers ───────── */
const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_DOC_BYTES = 5 * 1024 * 1024; // 5 MB

function FileField({ label, file, onChange }) {
  const [error, setError] = useState("");
  const handle = (e) => {
    const f = e.target.files?.[0];
    if (!f) { onChange(null); setError(""); return; }
    if (!ALLOWED_DOC_TYPES.includes(f.type)) {
      setError("Only PDF, JPG, or PNG");
      onChange(null);
      return;
    }
    if (f.size > MAX_DOC_BYTES) {
      setError("File must be under 5 MB");
      onChange(null);
      return;
    }
    setError("");
    onChange(f);
  };
  return (
    <div>
      <label className="text-[11px] text-slate-400 block mb-1">{label}</label>
      <input
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={handle}
        className="block w-full text-[11px] text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[11px] file:bg-teal-500/20 file:text-teal-300 hover:file:bg-teal-500/30 file:cursor-pointer"
      />
      {file && !error && (
        <div className="text-[10px] text-emerald-400 mt-0.5">✓ {file.name} ({(file.size / 1024).toFixed(0)} KB)</div>
      )}
      {error && <div className="text-[10px] text-red-400 mt-0.5">{error}</div>}
    </div>
  );
}

function RejectionReason({ reason }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = reason.length > 140 || reason.includes("\n");
  return (
    <div className="mt-2 rounded-md bg-black/20 px-3 py-2 text-xs text-slate-300">
      <div className="font-medium text-slate-400 mb-1">Reason:</div>
      <div
        className={`whitespace-pre-wrap break-words leading-relaxed ${
          isLong && !expanded ? "line-clamp-3" : ""
        }`}
      >
        {reason}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[10px] font-medium text-red-300 hover:text-red-200"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

/* ───────── component ───────── */
export default function Landing() {
  const { walletAddress, isConnected, connect } = useWallet();
  const setRole = useWalletStore((s) => s.setRole);
  const roleManager = useContract("RoleManager");
  const patientRegistry = useContract("PatientRegistry");
  const { uploadFilePlain, uploadJSON, uploading } = useIPFS();
  const navigate = useNavigate();

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyRole, setApplyRole] = useState(null); // "doctor" or "researcher"
  const [checking, setChecking] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [pendingApp, setPendingApp] = useState(null); // existing pending application
  const [diagnostics, setDiagnostics] = useState(null); // on-chain debug info

  // Apply form state — doctor/researcher
  const [applyName, setApplyName] = useState("");
  const [applySpec, setApplySpec] = useState("");
  const [applyLicense, setApplyLicense] = useState("");
  const [applyQualifications, setApplyQualifications] = useState("");
  const [applyExperience, setApplyExperience] = useState("");
  const [applyHospitalId, setApplyHospitalId] = useState(""); // bytes32 from dropdown
  const [hospitals, setHospitals] = useState([]); // [{ hospitalId, name, city, stateName }]
  // Doctor file uploads
  const [docNmcCert, setDocNmcCert] = useState(null);
  const [docDegreeCert, setDocDegreeCert] = useState(null);
  const [docAppointmentLetter, setDocAppointmentLetter] = useState(null);
  const [docGovIdDoctor, setDocGovIdDoctor] = useState(null);
  // Researcher file uploads
  const [resCredentialsPdf, setResCredentialsPdf] = useState(null);
  const [resGovId, setResGovId] = useState(null);

  // Patient registration modal
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [patientName, setPatientName] = useState("");

  // Hospital admin application modal
  const [showHospitalModal, setShowHospitalModal] = useState(false);
  const [hospName, setHospName] = useState("");
  const [hospCity, setHospCity] = useState("");
  const [hospState, setHospState] = useState("");
  const [hospRegNum, setHospRegNum] = useState("");
  const [hospDocsCID, setHospDocsCID] = useState("");
  const [hospAdminName, setHospAdminName] = useState("");

  // Check on-chain role and pending application — usable as initial check + refresh
  const checkRole = useCallback(async (silent = false) => {
    if (!walletAddress || !roleManager) return;
    if (!silent) setChecking(true);
    try {
      const rolePromise = roleManager.getRole(walletAddress);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Role check timed out")), 5000)
      );
      const role = Number(await Promise.race([rolePromise, timeoutPromise]));

      // Always read latest application for diagnostics
      let appInfo = null;
      try {
        const app = await roleManager.getMyApplication(walletAddress);
        if (Number(app.applicationId) !== 0) {
          appInfo = {
            id: Number(app.applicationId),
            status: Number(app.status), // 0=PENDING, 1=APPROVED, 2=REJECTED
            requestedRole: Number(app.requestedRole),
            name: app.name,
            rejectionReason: app.rejectionReason || "",
            respondedAt: Number(app.respondedAt),
          };
        }
      } catch {}

      setDiagnostics({
        wallet: walletAddress,
        role,
        roleName: Object.keys(ROLE_ENUM).find((k) => ROLE_ENUM[k] === role)?.toLowerCase() || "none",
        application: appInfo,
      });

      if (role !== ROLE_ENUM.NONE) {
        // Already registered — redirect to correct dashboard
        const roleName = Object.keys(ROLE_ENUM).find((k) => ROLE_ENUM[k] === role)?.toLowerCase();
        setRole(roleName);
        const path = ROLE_PATHS[role];
        if (path) {
          toast.success("Welcome back! Redirecting...", { id: "welcome-back" });
          navigate(path);
          return;
        }
      }

      // Pending application notice (only PENDING shows the notice)
      if (appInfo && appInfo.status === 0) {
        setPendingApp({
          id: appInfo.id,
          role: appInfo.requestedRole === ROLE_ENUM.DOCTOR ? "Doctor" : "Researcher",
          name: appInfo.name,
        });
      } else {
        setPendingApp(null);
      }

      // Show role selection
      setShowRoleModal(true);
    } catch (err) {
      console.error("checkRole error:", err);
      setShowRoleModal(true);
    } finally {
      if (!silent) setChecking(false);
    }
  }, [walletAddress, roleManager, navigate, setRole]);

  // Initial check on connect
  useEffect(() => {
    if (isConnected && walletAddress && roleManager) {
      checkRole();
    }
  }, [isConnected, walletAddress, roleManager, checkRole]);

  // Open the patient name entry modal
  const openPatientModal = () => {
    setShowRoleModal(false);
    setShowPatientModal(true);
  };

  // Handle patient registration — skip view calls (avoids stale-ABI decode errors)
  // and just attempt each write, treating "already registered" as success (idempotent).
  const handlePatientRegister = async () => {
    if (!roleManager || !patientRegistry) return;
    if (!patientName.trim()) {
      toast.error("Please enter your name");
      return;
    }
    setRegistering(true);
    const tid = toast.loading("Registering as Patient...");

    const isAlreadyRegistered = (e) => {
      const parts = [e?.reason, e?.shortMessage, e?.message, e?.info?.error?.message].filter(Boolean);
      const combined = parts.join(" ").toLowerCase();
      return combined.includes("already registered");
    };

    try {
      // 1. Register role on RoleManager — tolerate "already registered"
      try {
        const tx1 = await roleManager.registerAsPatient(patientName.trim());
        await tx1.wait();
      } catch (e) {
        if (isAlreadyRegistered(e)) {
          console.log("RoleManager: already registered, continuing");
        } else if (e.code === "ACTION_REJECTED") {
          throw e;
        } else {
          console.error("RoleManager.registerAsPatient failed:", e);
          throw new Error(
            "RoleManager: " + (e.reason || e.shortMessage || e.message || "registration failed")
          );
        }
      }

      // 2. Register on PatientRegistry — tolerate "already registered"
      try {
        const tx2 = await patientRegistry.registerPatient(patientName.trim(), "", "", "");
        await tx2.wait();
      } catch (e) {
        if (isAlreadyRegistered(e)) {
          console.log("PatientRegistry: already registered, continuing");
        } else if (e.code === "ACTION_REJECTED") {
          throw e;
        } else {
          console.error("PatientRegistry.registerPatient failed:", e);
          throw new Error(
            "PatientRegistry: " + (e.reason || e.shortMessage || e.message || "registration failed")
          );
        }
      }

      setRole("patient");
      toast.success("Registered as Patient!", { id: tid });
      setShowPatientModal(false);
      setPatientName("");
      navigate("/patient");
    } catch (err) {
      console.error("Patient registration error:", err);
      if (err.code === "ACTION_REJECTED") {
        toast.error("Transaction rejected in MetaMask", { id: tid });
      } else {
        const msg = err.reason || err.shortMessage || err.message || "Registration failed";
        toast.error(msg, { id: tid });
      }
    } finally {
      setRegistering(false);
    }
  };

  // Load registered hospitals — for the dropdown in the apply modal
  const loadHospitals = useCallback(async () => {
    if (!roleManager) return;
    try {
      const list = await roleManager.getAllHospitals();
      setHospitals(
        list.map((h) => ({
          hospitalId: h.hospitalId,
          name: h.name,
          city: h.city,
          stateName: h.stateName,
        }))
      );
    } catch (err) {
      console.error("Failed to load hospitals:", err);
    }
  }, [roleManager]);

  const resetApplyForm = () => {
    setApplyName(""); setApplySpec(""); setApplyLicense("");
    setApplyQualifications(""); setApplyExperience(""); setApplyHospitalId("");
    setDocNmcCert(null); setDocDegreeCert(null);
    setDocAppointmentLetter(null); setDocGovIdDoctor(null);
    setResCredentialsPdf(null); setResGovId(null);
  };

  // Handle doctor/researcher application — upload docs to IPFS, pin profile JSON, then call applyForRole
  const handleApply = async () => {
    if (!roleManager) return;
    const isDoctor = applyRole === "doctor";

    // Validate common fields
    if (!applyName.trim() || !applyHospitalId) {
      toast.error("Name and hospital are required");
      return;
    }
    if (isDoctor) {
      if (!applySpec.trim() || !applyLicense.trim() || !applyQualifications.trim() || !applyExperience.trim()) {
        toast.error("All doctor fields are required");
        return;
      }
      if (!docNmcCert || !docDegreeCert || !docAppointmentLetter || !docGovIdDoctor) {
        toast.error("Upload all four mandatory documents");
        return;
      }
    } else {
      if (!applyQualifications.trim()) {
        toast.error("Qualifications are required");
        return;
      }
      if (!resCredentialsPdf || !resGovId) {
        toast.error("Upload credentials PDF and govt ID");
        return;
      }
    }

    setRegistering(true);
    const tid = toast.loading("Uploading documents to IPFS...");
    try {
      // 1. Upload each file to IPFS in parallel
      let documentCIDs;
      if (isDoctor) {
        const [nmc, degree, appt, gov] = await Promise.all([
          uploadFilePlain(docNmcCert),
          uploadFilePlain(docDegreeCert),
          uploadFilePlain(docAppointmentLetter),
          uploadFilePlain(docGovIdDoctor),
        ]);
        if (!nmc || !degree || !appt || !gov) throw new Error("Document upload failed");
        documentCIDs = {
          nmcCertificate: nmc,
          degreeCertificate: degree,
          appointmentLetter: appt,
          governmentId: gov,
        };
      } else {
        const [cred, gov] = await Promise.all([
          uploadFilePlain(resCredentialsPdf),
          uploadFilePlain(resGovId),
        ]);
        if (!cred || !gov) throw new Error("Document upload failed");
        documentCIDs = { credentialsPdf: cred, governmentId: gov };
      }

      // 2. Build profile JSON and pin it
      toast.loading("Pinning profile to IPFS...", { id: tid });
      const profile = {
        version: 1,
        role: isDoctor ? "doctor" : "researcher",
        name: applyName.trim(),
        specialization: applySpec.trim(),
        licenseNumber: isDoctor ? applyLicense.trim() : "",
        qualifications: applyQualifications.trim(),
        yearsOfExperience: isDoctor ? Number(applyExperience) : null,
        hospitalId: applyHospitalId,
        wallet: walletAddress,
        documents: documentCIDs,
        submittedAt: new Date().toISOString(),
      };
      const profileCID = await uploadJSON(profile);
      if (!profileCID) throw new Error("Profile pinning failed");

      // 3. Submit on-chain
      toast.loading("Submitting application on-chain...", { id: tid });
      const roleEnum = isDoctor ? ROLE_ENUM.DOCTOR : ROLE_ENUM.RESEARCHER;
      const tx = await roleManager.applyForRole(
        roleEnum,
        applyHospitalId,
        applyName.trim(),
        applySpec.trim(),
        isDoctor ? applyLicense.trim() : "",
        profileCID
      );
      await tx.wait();

      const hospitalLabel = hospitals.find((h) => h.hospitalId === applyHospitalId)?.name || "the hospital";
      toast.success(`Application submitted! Admin at ${hospitalLabel} will review it.`, { id: tid });
      setShowApplyModal(false);
      setShowRoleModal(true);
      resetApplyForm();
      checkRole();
    } catch (err) {
      console.error("Apply failed:", err);
      if (err.code === "ACTION_REJECTED") {
        toast.error("Transaction rejected", { id: tid });
      } else {
        toast.error(err.reason || err.shortMessage || err.message || "Application failed", { id: tid });
      }
    } finally {
      setRegistering(false);
    }
  };

  const openApplyModal = (roleType) => {
    setApplyRole(roleType);
    setShowRoleModal(false);
    setShowApplyModal(true);
    loadHospitals();
  };

  const openHospitalModal = () => {
    setShowRoleModal(false);
    setShowHospitalModal(true);
  };

  const handleHospitalApply = async () => {
    if (!roleManager) return;
    if (!hospName.trim() || !hospCity.trim() || !hospState.trim() || !hospRegNum.trim() || !hospDocsCID.trim() || !hospAdminName.trim()) {
      toast.error("All fields are required");
      return;
    }
    setRegistering(true);
    const tid = toast.loading("Submitting hospital application...");
    try {
      const tx = await roleManager.applyForHospital(
        hospName.trim(),
        hospCity.trim(),
        hospState.trim(),
        hospRegNum.trim(),
        hospDocsCID.trim(),
        hospAdminName.trim()
      );
      await tx.wait();
      toast.success("Application submitted! Super Admin will review it.", { id: tid });
      setShowHospitalModal(false);
      setHospName(""); setHospCity(""); setHospState("");
      setHospRegNum(""); setHospDocsCID(""); setHospAdminName("");
      checkRole();
    } catch (err) {
      const msg = err.reason || err.shortMessage || err.message || "Application failed";
      if (err.code === "ACTION_REJECTED") {
        toast.error("Transaction rejected", { id: tid });
      } else {
        toast.error(msg, { id: tid });
      }
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1419] text-slate-100">
      {/* ── Navbar ── */}
      <nav className="sticky top-0 z-50 border-b border-white/5 bg-[#0f1419]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500">
              <span className="text-sm font-bold text-white">M</span>
            </div>
            <span className="text-base font-semibold">MediVault</span>
          </div>

          <div className="hidden md:flex items-center gap-8 text-sm text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#roles" className="hover:text-white transition-colors">Roles</a>
          </div>

          {isConnected ? (
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-xs font-mono text-slate-300">
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
            </div>
          ) : (
            <button
              onClick={connect}
              className="flex items-center gap-2 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 transition-colors"
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </button>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-500/8 via-transparent to-blue-500/5" />
        <div className="absolute top-20 left-1/4 h-72 w-72 rounded-full bg-teal-500/5 blur-3xl" />
        <div className="absolute bottom-10 right-1/4 h-60 w-60 rounded-full bg-blue-500/5 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 py-24 md:py-32">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-4 py-1.5">
              <Blocks className="h-3.5 w-3.5 text-teal-400" />
              <span className="text-xs font-medium text-teal-300">Powered by Ethereum & IPFS</span>
            </div>

            <h1 className="mb-6 text-4xl font-bold leading-tight md:text-5xl lg:text-6xl">
              Your health data,{" "}
              <br />
              owned by{" "}
              <span className="bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
                you.
              </span>
            </h1>

            <p className="mb-8 max-w-lg text-lg text-slate-400 leading-relaxed">
              A blockchain-powered platform where patients control their medical records,
              grant access to doctors, and receive transparent bills — all secured with
              AES-256 encryption on IPFS.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              {isConnected ? (
                checking ? (
                  <div className="flex items-center gap-3 rounded-lg bg-white/5 border border-white/10 px-6 py-3 text-sm text-slate-300">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                    Checking registration...
                  </div>
                ) : (
                  <button
                    onClick={() => setShowRoleModal(true)}
                    className="flex items-center gap-2 rounded-lg bg-teal-500 px-6 py-3 text-sm font-medium text-white hover:bg-teal-600 transition-colors"
                  >
                    Choose Your Role
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )
              ) : (
                <button
                  onClick={connect}
                  className="flex items-center gap-2 rounded-lg bg-teal-500 px-6 py-3 text-sm font-medium text-white hover:bg-teal-600 transition-colors"
                >
                  <Wallet className="h-4 w-4" />
                  Connect Wallet to Start
                </button>
              )}
              <a
                href="#how-it-works"
                className="flex items-center gap-2 rounded-lg border border-white/10 px-6 py-3 text-sm text-slate-300 hover:bg-white/5 transition-colors"
              >
                Learn more
                <ChevronRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 md:grid-cols-4 gap-px">
          {STATS.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center justify-center gap-3 px-6 py-6">
              <Icon className="h-5 w-5 text-teal-400" />
              <div>
                <div className="text-lg font-semibold text-white">{value}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-teal-400">Key Features</p>
          <h2 className="text-3xl font-bold">Built for every healthcare stakeholder</h2>
          <p className="mt-3 text-sm text-slate-400">Patient-first design with blockchain-grade security and full audit trail.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="group rounded-xl border border-white/5 bg-white/[0.02] p-6 hover:border-teal-500/20 hover:bg-teal-500/[0.03] transition-all"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/10">
                <Icon className="h-5 w-5 text-teal-400" />
              </div>
              <h3 className="mb-2 text-sm font-semibold">{title}</h3>
              <p className="text-xs leading-relaxed text-slate-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it Works ── */}
      <section id="how-it-works" className="border-y border-white/5 bg-white/[0.02]">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-12 text-center">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-teal-400">How it works</p>
            <h2 className="text-3xl font-bold">Three steps to full control</h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {STEPS.map(({ num, title, desc }, i) => (
              <div key={num} className="relative">
                {i < STEPS.length - 1 && (
                  <div className="absolute right-0 top-10 hidden h-px w-8 bg-white/10 md:block translate-x-full" />
                )}
                <div className="mb-4 text-3xl font-bold text-teal-500/30">{num}</div>
                <h3 className="mb-2 text-sm font-semibold">{title}</h3>
                <p className="text-xs leading-relaxed text-slate-400">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Choose Role ── */}
      <section id="roles" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-teal-400">Get Started</p>
          <h2 className="text-3xl font-bold">Choose your role</h2>
          <p className="mt-3 text-sm text-slate-400">
            MediVault serves patients, doctors, and researchers. Select yours to begin.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {ROLES.map((role) => {
            const Icon = role.icon;
            return (
              <button
                key={role.id}
                onClick={() => {
                  if (!isConnected) {
                    connect();
                  } else if (role.id === "patient") {
                    openPatientModal();
                  } else {
                    openApplyModal(role.id);
                  }
                }}
                disabled={registering}
                className={`group flex flex-col rounded-xl border p-6 text-left transition-all hover:scale-[1.02] ${role.color}`}
              >
                <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${role.iconBg}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-white">{role.label}</h3>
                <ul className="mt-2 space-y-1.5">
                  {role.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[11px] text-slate-400">
                      <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-teal-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-4 flex items-center gap-1 text-xs font-medium text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isConnected ? "Select role" : "Connect wallet"}
                  <ArrowRight className="h-3 w-3" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="relative overflow-hidden rounded-2xl border border-teal-500/20 bg-gradient-to-r from-teal-500/10 to-emerald-500/10 p-10 text-center">
          <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-teal-500/10 blur-3xl" />
          <h2 className="relative mb-3 text-2xl font-bold">Ready to own your health data?</h2>
          <p className="relative mb-6 text-sm text-slate-400">
            Connect your MetaMask wallet to get started. It takes less than 2 minutes to register.
          </p>
          <button
            onClick={() => (isConnected ? setShowRoleModal(true) : connect())}
            className="relative inline-flex items-center gap-2 rounded-lg bg-teal-500 px-6 py-3 text-sm font-medium text-white hover:bg-teal-600 transition-colors"
          >
            <Wallet className="h-4 w-4" />
            {isConnected ? "Choose Your Role" : "Connect Wallet"}
          </button>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 bg-[#0b0f13]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-500">
              <span className="text-[10px] font-bold text-white">M</span>
            </div>
            <span className="text-sm font-medium text-slate-400">MediVault</span>
            <span className="text-xs text-slate-600">· Blockchain Patient Management</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-slate-500">
            <span>Sepolia Testnet</span>
            <span>·</span>
            <span>Solidity 0.8.20</span>
            <span>·</span>
            <a
              href="https://github.com/jayasati/MediaVault"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-slate-300 transition-colors"
            >
              <Github className="h-3.5 w-3.5" />
              GitHub
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </footer>

      {/* ── Role Selection Modal ── */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#151a20] p-8 max-h-[90vh] overflow-y-auto">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold">Get started with MediVault</h2>
              <p className="mt-1 text-sm text-slate-400">
                Register as a patient instantly, or apply for doctor/researcher (requires admin approval).
              </p>
            </div>

            {/* On-chain diagnostics panel */}
            {diagnostics && (
              <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-slate-300">On-chain status</div>
                  <button
                    onClick={() => checkRole()}
                    disabled={checking}
                    className="text-[10px] text-teal-400 hover:text-teal-300 disabled:opacity-50"
                  >
                    {checking ? "Refreshing..." : "Refresh ↻"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                  <div>
                    <span className="text-slate-500">Wallet:</span>{" "}
                    <span className="text-slate-300">{diagnostics.wallet.slice(0, 8)}…{diagnostics.wallet.slice(-6)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Role:</span>{" "}
                    <span className={diagnostics.role === 0 ? "text-slate-400" : "text-teal-400"}>
                      {diagnostics.roleName.toUpperCase()} ({diagnostics.role})
                    </span>
                  </div>
                  {diagnostics.application && (
                    <>
                      <div>
                        <span className="text-slate-500">App ID:</span>{" "}
                        <span className="text-slate-300">#{diagnostics.application.id}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">App status:</span>{" "}
                        <span className={
                          diagnostics.application.status === 0 ? "text-amber-400"
                          : diagnostics.application.status === 1 ? "text-teal-400"
                          : "text-red-400"
                        }>
                          {["PENDING", "APPROVED", "REJECTED"][diagnostics.application.status]}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Pending application notice */}
            {pendingApp && (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                <Clock className="h-4 w-4 text-amber-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-amber-300">Application pending</div>
                  <div className="text-xs text-amber-400/70">
                    Your {pendingApp.role} application (ID #{pendingApp.id}) is awaiting admin approval.
                    Share this ID with the admin who needs to approve it.
                  </div>
                </div>
              </div>
            )}

            {/* Rejection notice */}
            {diagnostics?.application?.status === 2 && (
              <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-red-300">Application rejected</div>
                    <div className="text-xs text-red-400/70 mt-1">
                      Application #{diagnostics.application.id}
                      {diagnostics.application.respondedAt ? ` on ${new Date(diagnostics.application.respondedAt * 1000).toLocaleDateString()}` : ""}
                    </div>
                    {diagnostics.application.rejectionReason && (
                      <RejectionReason reason={diagnostics.application.rejectionReason} />
                    )}
                    <div className="text-[10px] text-red-400/60 mt-2">
                      You can re-apply 7 days after rejection (cooldown period).
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {/* Patient — instant registration */}
              <button
                onClick={openPatientModal}
                disabled={registering || !!pendingApp}
                className="flex flex-col rounded-xl border p-5 text-left transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed bg-teal-500/10 text-teal-400 border-teal-500/20"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/20">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">Patient</span>
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300">Instant</span>
                  </div>
                </div>
                <ul className="space-y-1">
                  {ROLES[0].features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[11px] text-slate-400">
                      <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-teal-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>

              {/* Doctor — apply */}
              <button
                onClick={() => openApplyModal("doctor")}
                disabled={registering || !!pendingApp}
                className="flex flex-col rounded-xl border p-5 text-left transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed bg-blue-500/10 text-blue-400 border-blue-500/20"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20">
                    <Stethoscope className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">Doctor</span>
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Requires approval</span>
                  </div>
                </div>
                <ul className="space-y-1">
                  {ROLES[1].features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[11px] text-slate-400">
                      <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-teal-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>

              {/* Researcher — apply */}
              <button
                onClick={() => openApplyModal("researcher")}
                disabled={registering || !!pendingApp}
                className="flex flex-col rounded-xl border p-5 text-left transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed bg-purple-500/10 text-purple-400 border-purple-500/20"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/20">
                    <FlaskConical className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">Researcher</span>
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Requires approval</span>
                  </div>
                </div>
                <ul className="space-y-1">
                  {ROLES[2].features.slice(0, 3).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[11px] text-slate-400">
                      <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-teal-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </button>

              {/* Hospital Admin — apply */}
              <button
                onClick={openHospitalModal}
                disabled={registering || !!pendingApp}
                className="flex flex-col rounded-xl border p-5 text-left transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed bg-amber-500/10 text-amber-400 border-amber-500/20"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-white">Hospital Admin</span>
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Super Admin approval</span>
                  </div>
                </div>
                <ul className="space-y-1 text-[11px] text-slate-400">
                  <li className="flex items-start gap-2">
                    <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-teal-500" />
                    Onboard your hospital onto MediVault
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-teal-500" />
                    Approve doctors & researchers
                  </li>
                  <li className="flex items-start gap-2">
                    <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-teal-500" />
                    Submit registration documents on-chain
                  </li>
                </ul>
              </button>

            </div>

            <button
              onClick={() => setShowRoleModal(false)}
              className="mt-6 w-full rounded-lg border border-white/10 py-2.5 text-sm text-slate-400 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Apply Modal (Doctor / Researcher) ── */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#151a20] p-8 max-h-[90vh] overflow-y-auto">
            <div className="mb-6">
              <h2 className="text-xl font-bold">
                Apply as {applyRole === "doctor" ? "Doctor" : "Researcher"}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Your application — including documents — will be reviewed by a hospital admin. Profile metadata and document CIDs are stored on IPFS; only the CID is recorded on-chain.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Full name *</label>
                <input
                  type="text"
                  value={applyName}
                  onChange={(e) => setApplyName(e.target.value)}
                  placeholder={applyRole === "doctor" ? "Ramesh Kumar" : "Anita Verma"}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  {applyRole === "doctor" && "Will be displayed as “Dr. <name>”. Don't add the Dr. prefix yourself."}
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Hospital *</label>
                <select
                  value={applyHospitalId}
                  onChange={(e) => setApplyHospitalId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="">Select a registered hospital</option>
                  {hospitals.map((h) => (
                    <option key={h.hospitalId} value={h.hospitalId}>
                      {h.name} · {h.stateName}
                    </option>
                  ))}
                </select>
                <div className="text-[10px] text-slate-500 mt-1">
                  {hospitals.length === 0
                    ? "No hospitals registered yet. Ask a hospital admin to onboard one first."
                    : "Only an admin of the selected hospital can approve your application."}
                </div>
              </div>

              {applyRole === "doctor" && (
                <>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Specialization *</label>
                    <select
                      value={applySpec}
                      onChange={(e) => setApplySpec(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-teal-500"
                    >
                      <option value="">Select specialization</option>
                      <option>Cardiology</option>
                      <option>Oncology</option>
                      <option>Neurology</option>
                      <option>General Medicine</option>
                      <option>Dermatology</option>
                      <option>Orthopedics</option>
                      <option>Endocrinology</option>
                      <option>Pediatrics</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">NMC / MCI registration number *</label>
                    <input
                      type="text"
                      value={applyLicense}
                      onChange={(e) => setApplyLicense(e.target.value)}
                      placeholder="MCI-12345"
                      className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Qualifications *</label>
                <input
                  type="text"
                  value={applyQualifications}
                  onChange={(e) => setApplyQualifications(e.target.value)}
                  placeholder={applyRole === "doctor" ? "MBBS, MD (Cardiology) — AIIMS Delhi, 2015" : "PhD Cancer Biology — IISc Bangalore"}
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              {applyRole === "doctor" && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Years of experience *</label>
                  <input
                    type="number"
                    min="0"
                    value={applyExperience}
                    onChange={(e) => setApplyExperience(e.target.value)}
                    placeholder="8"
                    className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
              )}

              <div className="border-t border-white/10 pt-3 mt-1">
                <div className="text-xs text-slate-300 font-medium mb-2">Required documents (PDF / JPG / PNG)</div>

                {applyRole === "doctor" ? (
                  <div className="flex flex-col gap-2">
                    <FileField label="NMC / MCI registration certificate *" file={docNmcCert} onChange={setDocNmcCert} />
                    <FileField label="Degree certificate (MBBS / MD / MS) *" file={docDegreeCert} onChange={setDocDegreeCert} />
                    <FileField label="Hospital appointment letter *" file={docAppointmentLetter} onChange={setDocAppointmentLetter} />
                    <FileField label="Government photo ID *" file={docGovIdDoctor} onChange={setDocGovIdDoctor} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    <FileField label="Credentials PDF (publications, CV, institutional letter) *" file={resCredentialsPdf} onChange={setResCredentialsPdf} />
                    <FileField label="Government photo ID *" file={resGovId} onChange={setResGovId} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowApplyModal(false); setShowRoleModal(true); }}
                disabled={registering}
                className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-slate-400 hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleApply}
                disabled={registering || uploading}
                className="flex-1 rounded-lg bg-teal-500 py-2.5 text-sm font-medium text-white hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {registering ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hospital Admin Application Modal ── */}
      {showHospitalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#151a20] p-8 max-h-[90vh] overflow-y-auto">
            <div className="mb-6">
              <h2 className="text-xl font-bold">Apply to Onboard a Hospital</h2>
              <p className="mt-1 text-sm text-slate-400">
                The Super Admin (national medical authority) will review your application. On approval, your wallet becomes the Admin for this hospital.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Hospital legal name *</label>
                <input
                  type="text"
                  value={hospName}
                  onChange={(e) => setHospName(e.target.value)}
                  placeholder="Apollo Hospitals Chennai"
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">City *</label>
                  <input
                    type="text"
                    value={hospCity}
                    onChange={(e) => setHospCity(e.target.value)}
                    placeholder="Chennai"
                    className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">State *</label>
                  <input
                    type="text"
                    value={hospState}
                    onChange={(e) => setHospState(e.target.value)}
                    placeholder="Tamil Nadu"
                    className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Registration number (NABH / state health dept) *</label>
                <input
                  type="text"
                  value={hospRegNum}
                  onChange={(e) => setHospRegNum(e.target.value)}
                  placeholder="NABH-TN-0001"
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Used as the unique on-chain hospital identifier. Must be unique nationally.
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Documents IPFS CID *</label>
                <input
                  type="text"
                  value={hospDocsCID}
                  onChange={(e) => setHospDocsCID(e.target.value)}
                  placeholder="QmXkqfP4tEXamplePinataCidForDocs"
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Phase 4 will replace this with file uploads. For now paste any placeholder string (e.g. <code>QmTest123</code>).
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Your name (the admin) *</label>
                <input
                  type="text"
                  value={hospAdminName}
                  onChange={(e) => setHospAdminName(e.target.value)}
                  placeholder="Priya Sharma"
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                />
                <div className="text-[10px] text-slate-500 mt-1">
                  Will be displayed in admin lists. Max 64 characters.
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowHospitalModal(false); setShowRoleModal(true); }}
                className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-slate-400 hover:bg-white/5 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleHospitalApply}
                disabled={
                  registering || !hospName.trim() || !hospCity.trim() || !hospState.trim()
                  || !hospRegNum.trim() || !hospDocsCID.trim() || !hospAdminName.trim()
                }
                className="flex-1 rounded-lg bg-teal-500 py-2.5 text-sm font-medium text-white hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {registering ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Patient Registration Modal ── */}
      {showPatientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#151a20] p-8">
            <div className="mb-6">
              <h2 className="text-xl font-bold">Register as Patient</h2>
              <p className="mt-1 text-sm text-slate-400">
                Your name will be visible to doctors who you grant record access. Stored on-chain via PatientRegistry.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Full name *</label>
                <input
                  type="text"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  placeholder="Anjali Krishnan"
                  className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-teal-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowPatientModal(false); setShowRoleModal(true); }}
                className="flex-1 rounded-lg border border-white/10 py-2.5 text-sm text-slate-400 hover:bg-white/5 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handlePatientRegister}
                disabled={registering || !patientName.trim()}
                className="flex-1 rounded-lg bg-teal-500 py-2.5 text-sm font-medium text-white hover:bg-teal-600 transition-colors disabled:opacity-50"
              >
                {registering ? "Registering..." : "Register"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
