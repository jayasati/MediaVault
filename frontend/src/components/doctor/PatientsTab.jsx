import { useState, useEffect, useCallback } from "react";
import { Search, Plus, FileText, Pill, ExternalLink, AlertTriangle, Upload, ShieldCheck, Clock, XCircle, X } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import useIPFS from "@/hooks/useIPFS";
import UserName from "@/components/UserName";
import { ethers } from "ethers";

const CATEGORY = { LAB: 0, SCAN: 1, DIAGNOSIS: 2, PRESCRIPTION: 3, PROCEDURE: 4, DISCHARGE: 5, VITALS: 6, IMPORT: 7, OTHER: 8 };
const CATEGORY_LABELS = ["Lab", "Scan", "Diagnosis", "Prescription", "Procedure", "Discharge", "Vitals", "Import", "Other"];
const REC_STATUS = {
  0: { label: "Unverified", icon: Clock, color: "bg-[#FAEEDA] text-[#633806]" },
  1: { label: "Verified", icon: ShieldCheck, color: "bg-[#E1F5EE] text-[#085041]" },
  2: { label: "Amended", icon: ShieldCheck, color: "bg-[#E6F1FB] text-[#0C447C]" },
  3: { label: "Rejected", icon: XCircle, color: "bg-[#FCEBEB] text-[#791F1F]" },
};

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function PatientsTab() {
  const { walletAddress, signer } = useWallet();
  const accessControl = useContract("MediAccessControl");
  const registry = useContract("PatientRegistry");
  const rxManager = useContract("PrescriptionManager");
  const appointments = useContract("AppointmentSystem");
  const clinical = useContract("ClinicalRecordManager");
  const { uploadFile, uploading, getFile, downloading } = useIPFS();

  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // Records state for the selected patient
  const [patientRecords, setPatientRecords] = useState([]);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState(CATEGORY.LAB);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFileObj, setUploadFileObj] = useState(null);
  const [uploadEmergency, setUploadEmergency] = useState(false);
  const [uploadingRecord, setUploadingRecord] = useState(false);

  // Prescription form
  const [rxName, setRxName] = useState("");
  const [rxDosage, setRxDosage] = useState("");
  const [rxDuration, setRxDuration] = useState("7");
  const [rxControlled, setRxControlled] = useState(false);
  const [rxGasEst, setRxGasEst] = useState("");
  const [writing, setWriting] = useState(false);

  // Load active patients — union of (a) approved access grants and
  // (b) patients with CONFIRMED or COMPLETED appointments with this doctor.
  const loadPatients = useCallback(async () => {
    if (!accessControl || !walletAddress) return;
    setLoading(true);
    try {
      const byAddress = new Map(); // lowercased addr -> patient row

      // (a) Access grants (explicit record-sharing)
      try {
        const myRequests = await accessControl.getMyAccessRequests();
        for (const reqId of myRequests) {
          const req = await accessControl.getAccessRequest(reqId);
          if (Number(req.status) === 1 && Number(req.expiresAt) > Date.now() / 1000) {
            const key = req.patientAddress.toLowerCase();
            if (!byAddress.has(key)) {
              byAddress.set(key, {
                patientAddress: req.patientAddress,
                requestId: req.requestId,
                expiresAt: Number(req.expiresAt),
                source: "access",
              });
            }
          }
        }
      } catch (e) {
        console.warn("Access grant load failed:", e);
      }

      // (b) Patients from confirmed/completed appointments
      if (appointments) {
        try {
          const ids = await appointments.getDoctorAppointments(walletAddress);
          for (const id of ids) {
            const apt = await appointments.getAppointment(id);
            const status = Number(apt.status);
            // 1 = CONFIRMED, 3 = COMPLETED
            if (status !== 1 && status !== 3) continue;
            const key = apt.patient.toLowerCase();
            if (byAddress.has(key)) continue;
            byAddress.set(key, {
              patientAddress: apt.patient,
              requestId: 0,
              expiresAt: 0,
              source: "appointment",
              lastAppointmentAt: Number(apt.scheduledFor),
              appointmentStatus: status,
            });
          }
        } catch (e) {
          console.warn("Appointment-derived patient load failed:", e);
        }
      }

      setPatients(Array.from(byAddress.values()));
    } catch (err) {
      console.error("Failed to load patients:", err);
    } finally {
      setLoading(false);
    }
  }, [accessControl, appointments, walletAddress]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Load clinical records for a given patient address
  const loadPatientRecords = useCallback(async (patientAddress) => {
    if (!clinical || !patientAddress) return;
    setLoadingRecords(true);
    try {
      const ids = await clinical.getPatientRecords(patientAddress);
      const out = [];
      for (const id of ids) {
        const r = await clinical.getRecord(id);
        if (r.isSuperseded) continue;
        out.push({
          id: Number(r.recordId),
          patientAddress: r.patientAddress,
          uploaderDoctor: r.uploaderDoctor,
          submittedBy: r.submittedBy,
          cid: r.ipfsCID,
          category: Number(r.category),
          status: Number(r.status),
          title: r.title,
          uploadedAt: Number(r.uploadedAt),
        });
      }
      setPatientRecords(out.reverse());
    } catch (err) {
      console.error("Failed to load records:", err);
    } finally {
      setLoadingRecords(false);
    }
  }, [clinical]);

  // Select patient and load profile + records
  const selectPatient = async (p) => {
    setSelected(p);
    setSelectedProfile(null);
    setPatientRecords([]);
    if (registry) {
      try {
        const profile = await registry.getPatientByWallet(p.patientAddress);
        setSelectedProfile(profile);
      } catch (err) {
        console.error("Failed to load patient profile:", err);
      }
    }
    loadPatientRecords(p.patientAddress);
  };

  const handleDecryptRecord = async (record) => {
    if (!selected) return;
    const data = await getFile(record.cid, selected.patientAddress.toLowerCase());
    if (!data) return;
    const w = window.open();
    if (w) {
      w.document.write(`<iframe src="${data}" style="border:0;width:100%;height:100%"></iframe>`);
    } else {
      const a = document.createElement("a");
      a.href = data;
      a.download = record.title || "record";
      a.click();
    }
  };

  const handleVerify = async (recordId) => {
    if (!clinical) return;
    const tid = toast.loading("Verifying record...");
    try {
      const tx = await clinical.ratifyRecord(recordId);
      await tx.wait();
      toast.success("Record verified", { id: tid });
      loadPatientRecords(selected.patientAddress);
    } catch (err) {
      toast.error(err.reason || err.shortMessage || "Verify failed", { id: tid });
    }
  };

  const handleRejectRecord = async (recordId) => {
    if (!clinical) return;
    const reason = window.prompt("Rejection reason:", "Document unreadable or incorrect");
    if (!reason || !reason.trim()) return;
    const tid = toast.loading("Rejecting...");
    try {
      const tx = await clinical.rejectRatification(recordId, reason.trim());
      await tx.wait();
      toast.success("Record rejected", { id: tid });
      loadPatientRecords(selected.patientAddress);
    } catch (err) {
      toast.error(err.reason || err.shortMessage || "Reject failed", { id: tid });
    }
  };

  const handleUploadRecord = async () => {
    if (!clinical || !selected || !uploadFileObj || !uploadTitle.trim()) {
      toast.error("Pick a file and enter a title");
      return;
    }
    setUploadingRecord(true);
    const tid = toast.loading("Encrypting & uploading...");
    try {
      // Encrypt with the patient's wallet address so the patient can decrypt
      const cid = await uploadFile(uploadFileObj, selected.patientAddress.toLowerCase());
      if (!cid) { toast.dismiss(tid); setUploadingRecord(false); return; }
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
      toast.loading("Submitting on-chain...", { id: tid });
      const tx = await clinical.uploadRecord(
        selected.patientAddress,
        contentHash,
        cid,
        uploadCategory,
        uploadTitle.trim(),
        uploadEmergency
      );
      await tx.wait();
      toast.success("Record uploaded (verified)", { id: tid });
      setShowUploadModal(false);
      setUploadFileObj(null);
      setUploadTitle("");
      setUploadCategory(CATEGORY.LAB);
      setUploadEmergency(false);
      loadPatientRecords(selected.patientAddress);
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.shortMessage || "Upload failed", { id: tid });
    } finally {
      setUploadingRecord(false);
    }
  };

  // Estimate gas for prescription
  useEffect(() => {
    if (!rxManager || !selected || !rxName || !rxDosage || !rxDuration) {
      setRxGasEst("");
      return;
    }
    const estimate = async () => {
      try {
        const gas = await rxManager.writePrescription.estimateGas(
          selected.patientAddress, rxName, rxDosage, Number(rxDuration), rxControlled, ""
        );
        const price = await signer.provider.getFeeData();
        const cost = gas * (price.gasPrice || 0n);
        setRxGasEst(ethers.formatEther(cost));
      } catch {
        setRxGasEst("—");
      }
    };
    estimate();
  }, [rxManager, selected, rxName, rxDosage, rxDuration, rxControlled, signer]);

  const handleWriteRx = async () => {
    if (!rxManager || !selected) return;
    if (!rxName.trim() || !rxDosage.trim()) {
      toast.error("Medicine name and dosage required");
      return;
    }
    setWriting(true);
    const tid = toast.loading("Submitting prescription...");
    try {
      // Duplicate check
      const isDup = await rxManager.checkDuplicate(selected.patientAddress, rxName);
      if (isDup) {
        toast.error("Active prescription already exists for this medicine", { id: tid });
        setWriting(false);
        return;
      }

      const tx = await rxManager.writePrescription(
        selected.patientAddress, rxName, rxDosage, Number(rxDuration), rxControlled, ""
      );
      toast.loading("Waiting for confirmation...", { id: tid });
      const receipt = await tx.wait();
      toast.success(
        <span>
          Prescription written!{" "}
          <a href={`https://sepolia.etherscan.io/tx/${receipt.hash}`} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </span>,
        { id: tid }
      );
      setRxName("");
      setRxDosage("");
      setRxControlled(false);
    } catch (err) {
      if (err.code === "ACTION_REJECTED") {
        toast.error("Transaction rejected", { id: tid });
      } else if (err.reason) {
        toast.error(err.reason, { id: tid });
      } else {
        toast.error("Failed to write prescription", { id: tid });
      }
    } finally {
      setWriting(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !registry) return;
    try {
      let profile;
      if (searchQuery.startsWith("0x")) {
        profile = await registry.getPatientByWallet(searchQuery);
      } else {
        profile = await registry.getPatientById(Number(searchQuery));
      }
      if (profile.walletAddress === ethers.ZeroAddress) {
        toast.error("Patient not found");
        return;
      }
      setSelected({ patientAddress: profile.walletAddress, requestId: 0, expiresAt: 0 });
      setSelectedProfile(profile);
    } catch {
      toast.error("Patient not found");
    }
  };

  const daysLeft = (expiresAt) => {
    const d = Math.ceil((expiresAt - Date.now() / 1000) / 86400);
    return d > 0 ? `${d}d left` : "Expired";
  };

  return (
    <div>
      {/* Search bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by patient address or ID…"
            className="w-full pl-9 pr-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72]"
        >
          Search
        </button>
      </div>

      {/* Grid: patient list + detail */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4">
        {/* Patient list */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#64748b] mb-3">
            Active patients — {patients.length}
          </div>
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-[11px] text-[#64748b]">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
              Loading...
            </div>
          )}
          {!loading && patients.length === 0 && (
            <div className="text-[13px] text-[#94a3b8] py-6 text-center">
              No active patients yet. They'll appear here after an appointment or granted access.
            </div>
          )}
          <div className="flex flex-col gap-1">
            {patients.map((p) => {
              const initials = p.patientAddress.slice(2, 4).toUpperCase();
              const isSelected = selected?.patientAddress === p.patientAddress;
              return (
                <button
                  key={p.patientAddress}
                  onClick={() => selectPatient(p)}
                  className={`flex items-center gap-[9px] px-[10px] py-2 rounded-lg text-left transition-colors ${
                    isSelected ? "bg-[#E1F5EE]" : "hover:bg-[#f8fafc]"
                  }`}
                >
                  <div className="w-7 h-7 bg-[#0D9488] rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate"><UserName address={p.patientAddress} showAddress={false} /></div>
                    <div className="text-[10px] text-[#94a3b8]">
                      {p.source === "access"
                        ? daysLeft(p.expiresAt)
                        : p.appointmentStatus === 3
                        ? "Past appointment"
                        : "Upcoming appointment"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Patient detail */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          {!selected && (
            <div className="text-[13px] text-[#94a3b8] py-12 text-center">
              Select a patient to view their records
            </div>
          )}
          {selected && (
            <div>
              {/* Patient header */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#e2e8f0]">
                <div className="w-9 h-9 bg-[#0D9488] rounded-full flex items-center justify-center text-[13px] font-medium text-white flex-shrink-0">
                  {selected.patientAddress.slice(2, 4).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium"><UserName address={selected.patientAddress} showAddress={false} /></div>
                  <div className="text-[10px] text-[#64748b] font-mono">{selected.patientAddress}</div>
                </div>
                {selectedProfile && (
                  <div className="flex gap-2">
                    {selectedProfile.bloodType && (
                      <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#FCEBEB] text-[#791F1F]">
                        {selectedProfile.bloodType}
                      </span>
                    )}
                    {selectedProfile.isEmergencyDonor && (
                      <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E1F5EE] text-[#085041]">
                        Donor
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-1.5 px-3 py-[5px] bg-[#E1F5EE] text-[#085041] text-[11px] font-medium rounded-[6px] hover:bg-[#d4ece0]"
                >
                  <Upload className="h-3 w-3" />
                  Add record
                </button>
                <button
                  onClick={() => document.getElementById("rx-form")?.scrollIntoView({ behavior: "smooth" })}
                  className="flex items-center gap-1.5 px-3 py-[5px] bg-[#E1F5EE] text-[#085041] text-[11px] font-medium rounded-[6px]"
                >
                  <Pill className="h-3 w-3" />
                  Write Rx
                </button>
              </div>

              {/* Patient records (on-chain ClinicalRecordManager) */}
              <div className="mb-4">
                <div className="text-[11px] font-medium text-[#64748b] mb-2">Medical records</div>
                {loadingRecords && (
                  <div className="text-[11px] text-[#94a3b8] py-3 text-center">Loading records...</div>
                )}
                {!loadingRecords && patientRecords.length === 0 && (
                  <div className="text-[11px] text-[#94a3b8] py-3 text-center">No records for this patient</div>
                )}
                <div className="flex flex-col gap-1.5">
                  {patientRecords.map((r) => {
                    const badge = REC_STATUS[r.status] || REC_STATUS[0];
                    const Badge = badge.icon;
                    const canAct = r.status === 0 && r.uploaderDoctor.toLowerCase() === walletAddress?.toLowerCase();
                    return (
                      <div key={r.id} className="flex items-center gap-2 px-2 py-[7px] bg-[#f8fafc] rounded-lg">
                        <div className="w-6 h-6 bg-[#E6F1FB] rounded flex items-center justify-center flex-shrink-0">
                          <FileText className="h-3 w-3 text-[#0C447C]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium truncate">{r.title || "Untitled"}</div>
                          <div className="text-[10px] text-[#94a3b8]">
                            {CATEGORY_LABELS[r.category]} · {new Date(r.uploadedAt * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </div>
                        </div>
                        <span className={`text-[9px] px-1.5 py-[2px] rounded font-medium inline-flex items-center gap-0.5 ${badge.color}`}>
                          <Badge className="h-2.5 w-2.5" />
                          {badge.label}
                        </span>
                        <button
                          onClick={() => handleDecryptRecord(r)}
                          disabled={downloading}
                          className="text-[10px] text-[#0D9488] hover:underline disabled:opacity-50"
                        >
                          View
                        </button>
                        {canAct && (
                          <>
                            <button
                              onClick={() => handleVerify(r.id)}
                              className="text-[10px] px-2 py-[2px] bg-[#0D9488] text-white rounded hover:bg-[#0B7C72]"
                            >
                              Verify
                            </button>
                            <button
                              onClick={() => handleRejectRecord(r.id)}
                              className="text-[10px] px-2 py-[2px] bg-[#FCEBEB] text-[#791F1F] rounded hover:bg-[#f9d5d5]"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Write prescription form */}
              <div id="rx-form" className="pt-4 border-t border-[#e2e8f0]">
                <div className="text-[11px] font-medium text-[#64748b] mb-3">Write new prescription</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    type="text"
                    value={rxName}
                    onChange={(e) => setRxName(e.target.value)}
                    placeholder="Medicine name"
                    className="px-[10px] py-[6px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                  />
                  <input
                    type="text"
                    value={rxDosage}
                    onChange={(e) => setRxDosage(e.target.value)}
                    placeholder="Dosage (e.g. 500mg 2x)"
                    className="px-[10px] py-[6px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                  />
                </div>
                <div className="mb-3">
                  <input
                    type="number"
                    value={rxDuration}
                    onChange={(e) => setRxDuration(e.target.value)}
                    placeholder="Duration (days)"
                    min="1"
                    className="w-full px-[10px] py-[6px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[11px] text-[#64748b] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rxControlled}
                      onChange={(e) => setRxControlled(e.target.checked)}
                      className="accent-[#0D9488]"
                    />
                    Controlled substance
                  </label>
                  <button
                    onClick={handleWriteRx}
                    disabled={writing || !rxName || !rxDosage}
                    className="px-3 py-[6px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
                  >
                    {writing ? "Submitting..." : `Submit Rx${rxGasEst && rxGasEst !== "—" ? ` · est. ${Number(rxGasEst).toFixed(6)} ETH gas` : ""}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showUploadModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => !uploadingRecord && setShowUploadModal(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#e2e8f0]">
              <div>
                <div className="text-[13px] font-semibold">Add medical record</div>
                <div className="text-[10px] text-[#64748b]">
                  For <UserName address={selected.patientAddress} showAddress={false} /> — will be marked verified
                </div>
              </div>
              <button
                onClick={() => !uploadingRecord && setShowUploadModal(false)}
                className="p-1 rounded-md hover:bg-[#f1f5f9] text-[#64748b]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div>
                <label className="text-[11px] text-[#64748b] mb-1 block">Title</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Chest X-ray — 2026-04"
                  className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#64748b] mb-1 block">Category</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(Number(e.target.value))}
                  className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white focus:outline-none focus:border-[#0D9488]"
                >
                  {CATEGORY_LABELS.map((label, idx) => (
                    <option key={label} value={idx}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-[#64748b] mb-1 block">File</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.dicom"
                  onChange={(e) => setUploadFileObj(e.target.files?.[0] || null)}
                  className="w-full text-[11px]"
                />
                <div className="text-[9px] text-[#94a3b8] mt-1">
                  Encrypted with patient's wallet key before pinning to IPFS
                </div>
              </div>
              <label className="flex items-start gap-2 p-[10px] bg-[#FEF3C7] border border-[#FDE68A] rounded-[7px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={uploadEmergency}
                  onChange={(e) => setUploadEmergency(e.target.checked)}
                  className="accent-[#D97706] mt-0.5"
                />
                <div>
                  <div className="text-[11px] font-medium text-[#78350F]">Mark as emergency-relevant</div>
                  <div className="text-[9px] text-[#92400E] mt-0.5">
                    Any ER doctor will be able to read this record via break-glass access (logged on-chain).
                  </div>
                </div>
              </label>
            </div>
            <div className="flex gap-2 p-4 border-t border-[#e2e8f0] bg-[#f8fafc]">
              <button
                onClick={() => setShowUploadModal(false)}
                disabled={uploadingRecord}
                className="flex-1 px-4 py-[7px] border border-[#cbd5e1] text-xs rounded-[7px] hover:bg-[#f1f5f9] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUploadRecord}
                disabled={uploadingRecord || uploading || !uploadFileObj || !uploadTitle.trim()}
                className="flex-1 px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
              >
                {uploadingRecord || uploading ? "Uploading..." : "Upload record"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
