import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { AlertTriangle, Heart, Droplet, ShieldCheck, Lock, Clock, FileText, ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import useIPFS from "@/hooks/useIPFS";

const REASON_OPTIONS = [
  "Cardiac arrest",
  "Trauma / Accident",
  "Unconscious patient",
  "Stroke",
  "Severe allergic reaction",
  "Overdose / Poisoning",
  "Respiratory distress",
  "Other",
];

const CATEGORY_LABELS = ["Lab", "Scan", "Diagnosis", "Prescription", "Procedure", "Discharge", "Vitals", "Import", "Other"];

export default function EmergencyResponder() {
  const { patientId } = useParams();
  const { walletAddress, isConnected, connect } = useWallet();
  const patientRegistry = useContract("PatientRegistry");
  const emergencyAccess = useContract("EmergencyAccess");
  const clinical = useContract("ClinicalRecordManager");
  const roleManager = useContract("RoleManager");
  const { getJSON, getFile, downloading } = useIPFS();

  const [tier1, setTier1] = useState(null); // public emergency card
  const [publicCard, setPublicCard] = useState(null); // JSON from IPFS
  const [loadingTier1, setLoadingTier1] = useState(true);
  const [error, setError] = useState("");

  // Break glass state
  const [showBreakGlass, setShowBreakGlass] = useState(false);
  const [reason, setReason] = useState(REASON_OPTIONS[0]);
  const [note, setNote] = useState("");
  const [location, setLocation] = useState("");
  const [breaking, setBreaking] = useState(false);

  // Tier-2 post-break-glass
  const [emergencyRecords, setEmergencyRecords] = useState(null);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [callerRole, setCallerRole] = useState(null);

  const loadTier1 = useCallback(async () => {
    if (!patientRegistry) return;
    setLoadingTier1(true);
    try {
      const p = await patientRegistry.getPatientById(Number(patientId));
      if (p.walletAddress === ethers.ZeroAddress) {
        setError("Patient not found");
        return;
      }
      setTier1({
        patientId: Number(p.patientId),
        walletAddress: p.walletAddress,
        bloodType: p.bloodType,
        isEmergencyDonor: p.isEmergencyDonor,
        emergencyIPFSHash: p.emergencyIPFSHash,
        isActive: p.isActive,
        verifiedBy: p.emergencyVerifiedBy,
      });
      // Try to load the public JSON card (best-effort, plaintext)
      if (p.emergencyIPFSHash) {
        const raw = p.emergencyIPFSHash.trim();
        // Legacy records stored the JSON inline instead of a CID — handle both.
        if (raw.startsWith("{")) {
          try { setPublicCard(JSON.parse(raw)); } catch { /* ignore */ }
        } else {
          const data = await getJSON(raw);
          if (data) setPublicCard(data);
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.reason || "Failed to load patient");
    } finally {
      setLoadingTier1(false);
    }
  }, [patientRegistry, patientId, getJSON]);

  useEffect(() => { loadTier1(); }, [loadTier1]);

  useEffect(() => {
    if (!roleManager || !walletAddress) return;
    roleManager.getRole(walletAddress).then((r) => setCallerRole(Number(r))).catch(() => {});
  }, [roleManager, walletAddress]);

  const canBreakGlass = callerRole === 2; // DOCTOR

  const handleBreakGlass = async () => {
    if (!emergencyAccess || !tier1) return;
    const fullReason = note.trim() ? `${reason} — ${note.trim()}` : reason;
    setBreaking(true);
    const tid = toast.loading("Logging emergency access on-chain...");
    try {
      const tx = await emergencyAccess.emergencyAccess(tier1.patientId, fullReason, location.trim() || "unspecified");
      await tx.wait();
      toast.success("Break-glass access granted", { id: tid });
      setShowBreakGlass(false);

      // Fetch emergency-flagged clinical records
      setLoadingRecords(true);
      const ids = await clinical.getPatientEmergencyRecords(tier1.walletAddress);
      const out = [];
      for (const id of ids) {
        const r = await clinical.getRecord(id);
        out.push({
          id: Number(r.recordId),
          cid: r.ipfsCID,
          title: r.title,
          category: Number(r.category),
          uploadedAt: Number(r.uploadedAt),
          uploaderDoctor: r.uploaderDoctor,
        });
      }
      setEmergencyRecords(out);
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.shortMessage || "Break-glass failed", { id: tid });
    } finally {
      setBreaking(false);
      setLoadingRecords(false);
    }
  };

  const handleDecrypt = async (record) => {
    const data = await getFile(record.cid, tier1.walletAddress.toLowerCase());
    if (!data) return;
    const w = window.open();
    if (w) w.document.write(`<iframe src="${data}" style="border:0;width:100%;height:100%"></iframe>`);
  };

  if (loadingTier1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <div className="text-[13px] text-[#64748b]">Loading patient emergency card...</div>
      </div>
    );
  }

  if (error || !tier1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-6">
        <div className="bg-white border border-[#FCEBEB] rounded-xl p-6 max-w-md text-center">
          <AlertTriangle className="h-8 w-8 text-[#791F1F] mx-auto mb-2" />
          <div className="text-sm font-semibold text-[#791F1F]">Patient not found</div>
          <div className="text-[11px] text-[#64748b] mt-1">{error || `No patient with ID ${patientId}`}</div>
          <Link to="/" className="inline-block mt-4 text-[11px] text-[#0D9488] hover:underline">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FEF2F2] to-[#f8fafc] p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-1 text-[11px] text-[#64748b] hover:text-[#0f172a] mb-4">
          <ArrowLeft className="h-3 w-3" /> Home
        </Link>

        {/* Red alert header */}
        <div className="bg-gradient-to-r from-[#DC2626] to-[#B91C1C] text-white rounded-xl p-5 mb-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <Heart className="h-6 w-6" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider opacity-90">Emergency Medical Card</div>
              <div className="text-lg font-bold">Patient #{tier1.patientId}</div>
            </div>
          </div>
        </div>

        {/* Tier 1: public card — always visible */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] uppercase tracking-wide text-[#94a3b8] font-medium">Critical information</div>
            {tier1.verifiedBy && tier1.verifiedBy !== ethers.ZeroAddress && (
              <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E1F5EE] text-[#085041] inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" /> Doctor-verified
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Blood type</div>
              <div className="text-2xl font-bold text-[#DC2626] mt-1 flex items-center gap-1">
                <Droplet className="h-5 w-5" />
                {tier1.bloodType || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Organ donor</div>
              <div className="text-sm font-semibold text-[#0f172a] mt-1">
                {tier1.isEmergencyDonor ? "Yes" : "No"}
              </div>
            </div>
          </div>

          {publicCard && (
            <div className="mt-4 pt-4 border-t border-[#e2e8f0] space-y-3">
              {publicCard.allergies && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Allergies</div>
                  <div className="text-[13px] text-[#0f172a] mt-0.5 whitespace-pre-wrap">{publicCard.allergies}</div>
                </div>
              )}
              {publicCard.emergencyContact && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Emergency contact</div>
                  <div className="text-[13px] text-[#0f172a] mt-0.5">{publicCard.emergencyContact}</div>
                </div>
              )}
              {publicCard.conditions && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Known conditions</div>
                  <div className="text-[13px] text-[#0f172a] mt-0.5 whitespace-pre-wrap">{publicCard.conditions}</div>
                </div>
              )}
              {publicCard.medications && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">Current medications</div>
                  <div className="text-[13px] text-[#0f172a] mt-0.5 whitespace-pre-wrap">{publicCard.medications}</div>
                </div>
              )}
              {publicCard.dnr !== undefined && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[#94a3b8]">DNR</div>
                  <div className="text-[13px] text-[#0f172a] mt-0.5">{publicCard.dnr ? "Yes — Do Not Resuscitate" : "No"}</div>
                </div>
              )}
            </div>
          )}

          {!publicCard && tier1.emergencyIPFSHash && (
            <div className="mt-3 text-[11px] text-[#94a3b8]">
              Couldn't auto-load the public card from IPFS. Hash: {tier1.emergencyIPFSHash.slice(0, 10)}…
            </div>
          )}
          {!tier1.emergencyIPFSHash && (
            <div className="mt-3 text-[11px] text-[#94a3b8]">
              Patient hasn't filled in a full public emergency card yet.
            </div>
          )}
        </div>

        {/* Tier 2: break-glass */}
        {!emergencyRecords && (
          <div className="bg-white border border-[#FDE68A] rounded-xl p-5 mb-4">
            <div className="flex items-start gap-3 mb-3">
              <Lock className="h-5 w-5 text-[#D97706] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#78350F]">Break-glass clinical access</div>
                <div className="text-[11px] text-[#92400E] mt-1">
                  Reads emergency-flagged clinical records (allergies, active meds, recent diagnoses).
                  Restricted to registered doctors. Every access is permanently logged on-chain and the patient is notified.
                </div>
              </div>
            </div>

            {!isConnected ? (
              <button
                onClick={connect}
                className="w-full py-[9px] bg-[#D97706] text-white text-[12px] font-medium rounded-[7px] hover:bg-[#B45309]"
              >
                Connect wallet to break glass
              </button>
            ) : !canBreakGlass ? (
              <div className="text-[11px] text-[#92400E] bg-[#FEF3C7] border border-[#FDE68A] rounded p-2">
                Connected wallet is not a registered doctor. Break-glass is restricted to approved medical staff.
              </div>
            ) : !showBreakGlass ? (
              <button
                onClick={() => setShowBreakGlass(true)}
                className="w-full py-[10px] bg-[#DC2626] text-white text-[13px] font-bold rounded-[7px] hover:bg-[#B91C1C] uppercase tracking-wide"
              >
                🚨 Break Glass — Access Full Emergency Profile
              </button>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] text-[#64748b] mb-1 block">Reason</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white focus:outline-none focus:border-[#D97706]"
                  >
                    {REASON_OPTIONS.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-[#64748b] mb-1 block">Additional note (optional)</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="e.g. Unresponsive, pulse weak"
                    className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] resize-none focus:outline-none focus:border-[#D97706]"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#64748b] mb-1 block">Location (optional)</label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. ER Bay 3, Hospital XYZ"
                    className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#D97706]"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowBreakGlass(false)}
                    disabled={breaking}
                    className="flex-1 px-4 py-[7px] border border-[#cbd5e1] text-xs rounded-[7px] hover:bg-[#f1f5f9] disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBreakGlass}
                    disabled={breaking}
                    className="flex-1 px-4 py-[7px] bg-[#DC2626] text-white text-xs font-medium rounded-[7px] hover:bg-[#B91C1C] disabled:opacity-50"
                  >
                    {breaking ? "Logging..." : "Confirm break-glass"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tier 2 results */}
        {emergencyRecords && (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[13px] font-semibold">Emergency-flagged clinical records</div>
              <span className="text-[10px] text-[#94a3b8]">{emergencyRecords.length} found</span>
            </div>
            {loadingRecords && <div className="text-[11px] text-[#94a3b8] py-3 text-center">Loading records...</div>}
            {!loadingRecords && emergencyRecords.length === 0 && (
              <div className="text-[11px] text-[#94a3b8] py-3 text-center">No emergency-flagged records on file.</div>
            )}
            <div className="flex flex-col gap-2">
              {emergencyRecords.map((r) => (
                <div key={r.id} className="flex items-center gap-2 p-2 bg-[#f8fafc] rounded-lg">
                  <FileText className="h-4 w-4 text-[#0D9488] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{r.title}</div>
                    <div className="text-[10px] text-[#94a3b8]">
                      {CATEGORY_LABELS[r.category]} · {new Date(r.uploadedAt * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDecrypt(r)}
                    disabled={downloading}
                    className="px-3 py-[5px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
                  >
                    {downloading ? "..." : "View"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="text-center text-[10px] text-[#94a3b8]">
          Every break-glass access is logged immutably on-chain. The patient will be notified.
        </div>
      </div>
    </div>
  );
}
