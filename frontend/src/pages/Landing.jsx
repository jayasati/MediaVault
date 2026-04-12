import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { useWalletStore } from "@/store";
import toast from "react-hot-toast";
import {
  Wallet,
  Shield,
  Stethoscope,
  Settings,
  FlaskConical,
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
    id: "admin",
    label: "Hospital Admin",
    icon: Settings,
    path: "/admin",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    iconBg: "bg-amber-500/20",
    features: [
      "Register & verify doctors",
      "Monitor smart contract health",
      "Audit access logs & compliance",
      "Manage billing & organ waitlist",
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
  { num: "02", title: "Select your role", desc: "Register as a Patient, Doctor, Admin, or Researcher on-chain." },
  { num: "03", title: "Access dashboard", desc: "Manage records, prescriptions, access control, and more from your personalized dashboard." },
];

const STATS = [
  { icon: Blocks, label: "Smart Contracts", value: "4" },
  { icon: ShieldCheck, label: "Sepolia Testnet", value: "Live" },
  { icon: HardDrive, label: "IPFS Storage", value: "Pinata" },
  { icon: Lock, label: "Encryption", value: "AES-256" },
];

/* ───────── component ───────── */
export default function Landing() {
  const { walletAddress, isConnected, connect } = useWallet();
  const setRole = useWalletStore((s) => s.setRole);
  const patientRegistry = useContract("PatientRegistry");
  const navigate = useNavigate();

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [checking, setChecking] = useState(false);
  const [registering, setRegistering] = useState(false);

  // After wallet connects, check registration
  useEffect(() => {
    if (!isConnected || !walletAddress || !patientRegistry) return;

    const checkRegistration = async () => {
      setChecking(true);
      try {
        const patient = await patientRegistry.getPatientByWallet(walletAddress);
        if (patient.walletAddress !== "0x0000000000000000000000000000000000000000" && patient.isActive) {
          setRole("patient");
          toast.success("Welcome back! Redirecting to dashboard...");
          navigate("/patient");
          return;
        }
        // Not registered — show role selection
        setShowRoleModal(true);
      } catch {
        setShowRoleModal(true);
      } finally {
        setChecking(false);
      }
    };

    checkRegistration();
  }, [isConnected, walletAddress, patientRegistry, navigate, setRole]);

  const handleRoleSelect = async (role) => {
    setRole(role.id);

    if (role.id === "patient" && patientRegistry) {
      setRegistering(true);
      const tid = toast.loading("Registering on-chain...");
      try {
        const tx = await patientRegistry.registerPatient("", "", "", "");
        toast.loading("Waiting for confirmation...", { id: tid });
        await tx.wait();
        toast.success("Registered as Patient!", { id: tid });
        navigate(role.path);
      } catch (err) {
        if (err.code === "ACTION_REJECTED") {
          toast.error("Transaction rejected", { id: tid });
        } else {
          toast.error("Registration failed", { id: tid });
          console.error(err);
        }
      } finally {
        setRegistering(false);
      }
    } else {
      // For other roles, just redirect (registration contracts pending)
      toast.success(`Entering as ${role.label}`);
      navigate(role.path);
    }

    setShowRoleModal(false);
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
            MediVault serves patients, doctors, admins, and researchers. Select yours to begin.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => {
            const Icon = role.icon;
            return (
              <button
                key={role.id}
                onClick={() => {
                  if (!isConnected) {
                    connect();
                  } else {
                    handleRoleSelect(role);
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
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#151a20] p-8">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-bold">Select your role</h2>
              <p className="mt-1 text-sm text-slate-400">
                This will register you on-chain. Choose carefully — you can have one role per wallet.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {ROLES.map((role) => {
                const Icon = role.icon;
                return (
                  <button
                    key={role.id}
                    onClick={() => handleRoleSelect(role)}
                    disabled={registering}
                    className={`flex flex-col rounded-xl border p-5 text-left transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed ${role.color}`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${role.iconBg}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-semibold text-white">{role.label}</span>
                    </div>
                    <ul className="space-y-1">
                      {role.features.slice(0, 3).map((f) => (
                        <li key={f} className="flex items-start gap-2 text-[11px] text-slate-400">
                          <ChevronRight className="mt-0.5 h-3 w-3 flex-shrink-0 text-teal-500" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
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
    </div>
  );
}
