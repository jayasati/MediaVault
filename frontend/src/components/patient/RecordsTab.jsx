import { useState, useEffect, useCallback, useMemo } from "react";
import { Upload, FileText, Image, Pill, Lock, ExternalLink, ShieldCheck, Clock, XCircle } from "lucide-react";
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import toast from "react-hot-toast";
import { ethers } from "ethers";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import useIPFS from "@/hooks/useIPFS";
import UserName from "@/components/UserName";

// ClinicalRecordManager RecordCategory enum mapping
const CATEGORY = { LAB: 0, SCAN: 1, DIAGNOSIS: 2, PRESCRIPTION: 3, PROCEDURE: 4, DISCHARGE: 5, VITALS: 6, IMPORT: 7, OTHER: 8 };
const CATEGORY_BY_VALUE = ["lab", "scan", "diagnosis", "prescription", "procedure", "discharge", "vitals", "import", "other"];

// RecordStatus: 0 PENDING_RATIFICATION, 1 CLINICAL, 2 AMENDED, 3 REJECTED_RATIFICATION
const STATUS_BADGE = {
  0: { label: "Unverified", icon: Clock, color: "bg-[#FAEEDA] text-[#633806]" },
  1: { label: "Verified", icon: ShieldCheck, color: "bg-[#E1F5EE] text-[#085041]" },
  2: { label: "Amended", icon: ShieldCheck, color: "bg-[#E6F1FB] text-[#0C447C]" },
  3: { label: "Rejected", icon: XCircle, color: "bg-[#FCEBEB] text-[#791F1F]" },
};

const TYPE_STYLES = {
  lab: { label: "Lab", bg: "bg-[#E1F5EE]", text: "text-[#085041]", icon: FileText },
  scan: { label: "Scan", bg: "bg-[#E6F1FB]", text: "text-[#0C447C]", icon: Image },
  prescription: { label: "Rx", bg: "bg-[#EEEDFE]", text: "text-[#3C3489]", icon: Pill },
  other: { label: "Doc", bg: "bg-[#f1f5f9]", text: "text-[#64748b]", icon: FileText },
};

function categoryFromFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  const lower = file.name.toLowerCase();
  if (["jpg", "jpeg", "png", "dicom"].includes(ext)) return CATEGORY.SCAN;
  if (ext === "pdf" && lower.includes("rx")) return CATEGORY.PRESCRIPTION;
  if (ext === "pdf" && (lower.includes("lab") || lower.includes("report"))) return CATEGORY.LAB;
  return CATEGORY.IMPORT;
}

export default function RecordsTab() {
  const { walletAddress } = useWallet();
  const clinical = useContract("ClinicalRecordManager");
  const appointments = useContract("AppointmentSystem");
  const { uploadFile, uploading, getFile, downloading } = useIPFS();

  const [records, setRecords] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [designatedDoctor, setDesignatedDoctor] = useState("");
  const [knownDoctors, setKnownDoctors] = useState([]); // [{ address, label }]

  const loadKnownDoctors = useCallback(async () => {
    if (!appointments || !walletAddress) return;
    try {
      const ids = await appointments.getPatientAppointments(walletAddress);
      const seen = new Set();
      const list = [];
      for (const id of ids) {
        const apt = await appointments.getAppointment(id);
        const key = apt.doctor.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        // Only include doctors the patient actually interacted with (CONFIRMED/COMPLETED)
        if (Number(apt.status) !== 1 && Number(apt.status) !== 3) continue;
        let name = "";
        try {
          const p = await appointments.getProfile(apt.doctor);
          name = p.name || "";
        } catch {}
        list.push({ address: apt.doctor, label: name || apt.doctor });
      }
      setKnownDoctors(list);
      if (list.length > 0 && !designatedDoctor) setDesignatedDoctor(list[0].address);
    } catch (err) {
      console.warn("Failed to load known doctors:", err);
    }
  }, [appointments, walletAddress, designatedDoctor]);

  const loadRecords = useCallback(async () => {
    if (!clinical || !walletAddress) return;
    setLoading(true);
    try {
      const ids = await clinical.getPatientRecords(walletAddress);
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
      setRecords(out.reverse());
    } catch (err) {
      console.error("Failed to load records:", err);
    } finally {
      setLoading(false);
    }
  }, [clinical, walletAddress]);

  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => { loadKnownDoctors(); }, [loadKnownDoctors]);

  const handleUpload = async (file) => {
    if (!walletAddress) return toast.error("Connect wallet first");
    if (!clinical) return toast.error("Contract not ready");
    if (!designatedDoctor) {
      return toast.error("Pick a designated doctor — you need at least one confirmed appointment first");
    }

    // Encrypt with the patient's wallet address so any party with the address can decrypt
    const cid = await uploadFile(file, walletAddress.toLowerCase());
    if (!cid) return;

    const tid = toast.loading("Submitting for doctor verification...");
    try {
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(cid));
      const category = categoryFromFile(file);
      const tx = await clinical.submitForRatification(
        contentHash,
        cid,
        category,
        file.name,
        designatedDoctor
      );
      await tx.wait();
      toast.success("Submitted — awaiting doctor verification", { id: tid });
      loadRecords();
    } catch (err) {
      console.error(err);
      toast.error(err.reason || err.shortMessage || "Submission failed", { id: tid });
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDecrypt = async (record) => {
    const data = await getFile(record.cid, walletAddress.toLowerCase());
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
    toast.success("File decrypted");
  };

  const chartData = useMemo(() => {
    const months = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months[d.toLocaleString("default", { month: "short" })] = 0;
    }
    records.forEach((r) => {
      const d = new Date(r.uploadedAt * 1000);
      const key = d.toLocaleString("default", { month: "short" });
      if (key in months) months[key]++;
    });
    return Object.entries(months).map(([month, count]) => ({ month, count }));
  }, [records]);

  const canUpload = knownDoctors.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-medium">Health records</div>
          <div className="text-[11px] text-[#64748b]">
            {records.length} records · on-chain with doctor verification
          </div>
        </div>
      </div>

      {/* Designated-doctor picker */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 mb-3">
        <label className="text-[11px] text-[#64748b] mb-1 block">
          Designated doctor <span className="text-[#94a3b8]">(will verify your uploaded records)</span>
        </label>
        <select
          value={designatedDoctor}
          onChange={(e) => setDesignatedDoctor(e.target.value)}
          disabled={!canUpload}
          className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white focus:outline-none focus:border-[#0D9488] disabled:bg-[#f8fafc]"
        >
          {!canUpload && <option value="">No doctors — book an appointment first</option>}
          {knownDoctors.map((d) => (
            <option key={d.address} value={d.address}>{d.label}</option>
          ))}
        </select>
      </div>

      {/* Drop zone */}
      <div
        className={`border-[1.5px] border-dashed rounded-[10px] p-6 text-center mb-4 transition-colors ${
          dragActive ? "border-[#0D9488] bg-[#E1F5EE]/30" : "border-[#cbd5e1] bg-[#f8fafc]"
        } ${!canUpload ? "opacity-50" : ""}`}
        onDragOver={(e) => { e.preventDefault(); if (canUpload) setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={canUpload ? handleDrop : (e) => e.preventDefault()}
      >
        <Upload className="h-7 w-7 text-[#0D9488] mx-auto mb-2" />
        <div className="text-[13px] text-[#64748b]">
          Drop files here or{" "}
          <label className={`text-[#0D9488] ${canUpload ? "cursor-pointer hover:underline" : "cursor-not-allowed"}`}>
            browse
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.dicom" onChange={handleFileSelect} disabled={!canUpload} />
          </label>
        </div>
        <div className="text-[10px] text-[#94a3b8] mt-1">
          Encrypted locally with AES · Submitted as "Unverified" until your designated doctor verifies
        </div>
        {uploading && (
          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-[#0D9488]">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
            Encrypting & uploading...
          </div>
        )}
      </div>

      {/* Records list */}
      <div className="flex flex-col gap-2 mb-4">
        {loading && (
          <div className="text-center py-6 text-[12px] text-[#64748b]">Loading records from chain...</div>
        )}
        {!loading && records.length === 0 && (
          <div className="text-center py-8 text-[13px] text-[#94a3b8]">
            No records yet. Upload your first health record above.
          </div>
        )}
        {records.map((record) => {
          const catKey = CATEGORY_BY_VALUE[record.category] || "other";
          const style = TYPE_STYLES[catKey] || TYPE_STYLES.other;
          const badge = STATUS_BADGE[record.status] || STATUS_BADGE[0];
          const Badge = badge.icon;
          return (
            <div
              key={record.id}
              className="flex items-center gap-[10px] px-3 py-[10px] bg-white border border-[#e2e8f0] rounded-[9px]"
            >
              <div className={`w-8 h-8 ${style.bg} rounded-[7px] flex items-center justify-center text-[10px] font-medium ${style.text} flex-shrink-0`}>
                {style.label.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{record.title || "Untitled"}</div>
                <div className="text-[11px] text-[#64748b]">
                  {new Date(record.uploadedAt * 1000).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}{" "}·{" "}
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${record.cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0D9488] hover:underline"
                  >
                    {record.cid.slice(0, 6)}…
                  </a>
                  {" · "}
                  <span className="text-[#94a3b8]">
                    Dr. <UserName address={record.uploaderDoctor} showAddress={false} />
                  </span>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-[2px] rounded-lg font-medium inline-flex items-center gap-1 ${badge.color}`}>
                <Badge className="h-3 w-3" />
                {badge.label}
              </span>
              <button
                onClick={() => handleDecrypt(record)}
                disabled={downloading}
                className="px-[10px] py-[5px] text-[11px] border border-[#cbd5e1] rounded-[7px] hover:bg-[#f1f5f9] transition-colors disabled:opacity-50"
              >
                {downloading ? "…" : "Decrypt"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Upload activity chart */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-4">
        <div className="text-xs font-medium text-[#64748b] mb-3">Upload activity — last 6 months</div>
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={chartData}>
            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} labelStyle={{ fontSize: 11, fontWeight: 500 }} />
            <Line type="monotone" dataKey="count" stroke="#0D9488" strokeWidth={1.5} dot={{ r: 3, fill: "#0D9488" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
