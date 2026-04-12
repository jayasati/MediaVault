import { useState, useEffect, useCallback, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, AlertTriangle, Heart, ExternalLink, Save } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { CONTRACTS } from "@/constants/contracts";

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export default function EmergencyTab() {
  const { walletAddress } = useWallet();
  const registry = useContract("PatientRegistry");
  const emergencyAccess = useContract("EmergencyAccess");

  const [patient, setPatient] = useState(null);
  const [bloodType, setBloodType] = useState("");
  const [allergies, setAllergies] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [accessLogs, setAccessLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const qrRef = useRef(null);

  const loadData = useCallback(async () => {
    if (!registry || !walletAddress) return;
    setLoading(true);
    try {
      const p = await registry.getPatientByWallet(walletAddress);
      if (p.walletAddress !== "0x0000000000000000000000000000000000000000") {
        setPatient(p);
        setBloodType(p.bloodType || "");
        setAllergies(p.allergiesHash || "");
      }

      // Load emergency access logs
      if (emergencyAccess) {
        const logIds = await emergencyAccess.getEmergencyAccessLog(walletAddress);
        const logs = [];
        for (const id of logIds) {
          const record = await emergencyAccess.getAccessRecord(id);
          logs.push(record);
        }
        setAccessLogs(logs.reverse());
      }
    } catch (err) {
      console.error("Failed to load emergency data:", err);
    } finally {
      setLoading(false);
    }
  }, [registry, emergencyAccess, walletAddress]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    if (!registry) return;
    setSaving(true);
    const tid = toast.loading("Updating emergency profile...");
    try {
      const ipfsData = JSON.stringify({ bloodType, allergies, emergencyContact });
      const tx = await registry.updateEmergencyProfile(ipfsData);
      toast.loading("Waiting for confirmation...", { id: tid });
      await tx.wait();
      toast.success("Emergency profile updated", { id: tid });
      loadData();
    } catch (err) {
      toast.error(err.code === "ACTION_REJECTED" ? "Rejected" : "Update failed", { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDonor = async () => {
    if (!registry) return;
    const tid = toast.loading("Updating organ donor status...");
    try {
      const tx = await registry.toggleOrganDonor();
      await tx.wait();
      toast.success(
        patient?.isEmergencyDonor ? "Organ donor status removed" : "Registered as organ donor!",
        { id: tid }
      );
      loadData();
    } catch (err) {
      toast.error(err.code === "ACTION_REJECTED" ? "Rejected" : "Failed", { id: tid });
    }
  };

  const handleAcknowledge = async (accessId) => {
    if (!emergencyAccess) return;
    const tid = toast.loading("Acknowledging...");
    try {
      const tx = await emergencyAccess.markNotified(accessId);
      await tx.wait();
      toast.success("Access acknowledged", { id: tid });
      loadData();
    } catch (err) {
      toast.error("Failed", { id: tid });
    }
  };

  const handleDownloadQR = () => {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const data = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([data], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medivault-emergency-qr-${patient?.patientId || "unknown"}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("QR code downloaded");
  };

  const patientId = patient ? Number(patient.patientId) : 0;
  const emergencyAddress = CONTRACTS.EmergencyAccess?.address || "";
  const qrData = patientId && emergencyAddress
    ? `medivault://emergency/${patientId}/${emergencyAddress}`
    : "";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Loading emergency profile...
      </div>
    );
  }

  return (
    <div>
      {/* QR + Profile — 2 column */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4 mb-4">
        {/* QR Code */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col items-center">
          <div className="text-xs font-medium text-[#64748b] mb-4 self-start">Emergency QR code</div>
          <div ref={qrRef} className="bg-white p-3 rounded-lg border border-[#e2e8f0]">
            {qrData ? (
              <QRCodeSVG value={qrData} size={120} fgColor="#0D9488" bgColor="#ffffff" />
            ) : (
              <div className="w-[120px] h-[120px] flex items-center justify-center text-[11px] text-[#94a3b8]">
                Register first
              </div>
            )}
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-3 text-center">
            Encodes patient ID + contract address
          </div>
          <button
            onClick={handleDownloadQR}
            disabled={!qrData}
            className="mt-3 flex items-center gap-1.5 px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Download QR
          </button>

          {/* Organ donor toggle */}
          <div className="mt-4 pt-4 border-t border-[#e2e8f0] w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Heart className={`h-4 w-4 ${patient?.isEmergencyDonor ? "text-red-500 fill-red-500" : "text-[#94a3b8]"}`} />
                <span className="text-xs font-medium">Organ donor</span>
              </div>
              <button
                onClick={handleToggleDonor}
                className={`w-9 h-5 rounded-full transition-colors relative ${
                  patient?.isEmergencyDonor ? "bg-[#0D9488]" : "bg-[#cbd5e1]"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    patient?.isEmergencyDonor ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Emergency profile form */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#64748b] mb-4">Emergency profile</div>

          {/* Blood type */}
          <div className="mb-3">
            <label className="text-[11px] text-[#64748b] mb-1 block">Blood type</label>
            <div className="flex gap-1.5 flex-wrap">
              {BLOOD_TYPES.map((bt) => (
                <button
                  key={bt}
                  onClick={() => setBloodType(bt)}
                  className={`px-3 py-1.5 text-[11px] rounded-md border transition-colors ${
                    bloodType === bt
                      ? "bg-[#0D9488] text-white border-[#0D9488]"
                      : "border-[#cbd5e1] text-[#334155] hover:bg-[#f1f5f9]"
                  }`}
                >
                  {bt}
                </button>
              ))}
            </div>
          </div>

          {/* Allergies */}
          <div className="mb-3">
            <label className="text-[11px] text-[#64748b] mb-1 block">Allergies</label>
            <input
              type="text"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="e.g. Penicillin, Sulfa drugs"
              className="w-full px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white focus:outline-none focus:border-[#0D9488]"
            />
          </div>

          {/* Emergency contact */}
          <div className="mb-4">
            <label className="text-[11px] text-[#64748b] mb-1 block">Emergency contact</label>
            <input
              type="text"
              value={emergencyContact}
              onChange={(e) => setEmergencyContact(e.target.value)}
              placeholder="Name — Phone number"
              className="w-full px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white focus:outline-none focus:border-[#0D9488]"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {/* Emergency access log */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-3">Emergency access log</div>
        {accessLogs.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-4 text-center">
            No emergency accesses recorded
          </div>
        )}
        <div className="flex flex-col gap-2">
          {accessLogs.map((log) => (
            <div
              key={log.accessId.toString()}
              className="flex items-start gap-[10px] p-[10px] border-l-[3px] border-[#ef4444] bg-[#fef2f2] rounded-r-lg"
            >
              <AlertTriangle className="h-4 w-4 text-[#ef4444] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">
                  Responder: {log.responderAddress.slice(0, 6)}…{log.responderAddress.slice(-4)}
                </div>
                <div className="text-[11px] text-[#64748b]">
                  {new Date(Number(log.accessedAt) * 1000).toLocaleString("en-IN")}
                  {log.location && ` · ${log.location}`}
                </div>
                <div className="text-[11px] text-[#64748b]">Reason: {log.reason}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#FCEBEB] text-[#791F1F]">
                  Warning
                </span>
                {!log.wasNotified && (
                  <button
                    onClick={() => handleAcknowledge(log.accessId)}
                    className="text-[10px] px-2 py-[2px] rounded-lg border border-[#cbd5e1] hover:bg-[#f1f5f9]"
                  >
                    Acknowledge
                  </button>
                )}
                {log.wasNotified && (
                  <span className="text-[10px] text-[#64748b]">Acknowledged</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
