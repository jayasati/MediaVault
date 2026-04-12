import { useState, useEffect, useCallback } from "react";
import { Upload, FileText, Image, Pill, Lock, ExternalLink } from "lucide-react";
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import useIPFS from "@/hooks/useIPFS";

const TYPE_STYLES = {
  lab: { label: "Lab", bg: "bg-[#E1F5EE]", text: "text-[#085041]", icon: FileText },
  scan: { label: "Scan", bg: "bg-[#E6F1FB]", text: "text-[#0C447C]", icon: Image },
  prescription: { label: "Rx", bg: "bg-[#EEEDFE]", text: "text-[#3C3489]", icon: Pill },
};

export default function RecordsTab() {
  const { walletAddress } = useWallet();
  const registry = useContract("PatientRegistry");
  const { uploadFile, uploading, getFile, downloading } = useIPFS();

  const [records, setRecords] = useState([]);
  const [dragActive, setDragActive] = useState(false);

  // Load records from localStorage (on-chain records are IPFS hashes — we store metadata locally)
  useEffect(() => {
    if (!walletAddress) return;
    const saved = localStorage.getItem(`medivault-records-${walletAddress}`);
    if (saved) setRecords(JSON.parse(saved));
  }, [walletAddress]);

  const saveRecords = useCallback(
    (newRecords) => {
      setRecords(newRecords);
      if (walletAddress) {
        localStorage.setItem(`medivault-records-${walletAddress}`, JSON.stringify(newRecords));
      }
    },
    [walletAddress]
  );

  const handleUpload = async (file) => {
    if (!walletAddress) {
      toast.error("Connect wallet first");
      return;
    }

    const encryptionKey = walletAddress;
    const cid = await uploadFile(file, encryptionKey);
    if (!cid) return;

    // Determine type from extension
    const ext = file.name.split(".").pop().toLowerCase();
    let type = "lab";
    if (["jpg", "jpeg", "png", "dicom"].includes(ext)) type = "scan";
    if (ext === "pdf" && file.name.toLowerCase().includes("rx")) type = "prescription";

    const newRecord = {
      id: Date.now(),
      name: file.name,
      type,
      cid,
      date: new Date().toISOString(),
      size: file.size,
    };

    saveRecords([newRecord, ...records]);
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
    const data = await getFile(record.cid, walletAddress);
    if (data) {
      // Open decrypted file in new tab
      const w = window.open();
      if (w) {
        w.document.write(`<img src="${data}" style="max-width:100%"/>`);
      } else {
        // Fallback: download
        const a = document.createElement("a");
        a.href = data;
        a.download = record.name;
        a.click();
      }
      toast.success("File decrypted");
    }
  };

  // Chart data — uploads per month
  const chartData = (() => {
    const months = {};
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString("default", { month: "short" });
      months[key] = 0;
    }
    records.forEach((r) => {
      const d = new Date(r.date);
      const key = d.toLocaleString("default", { month: "short" });
      if (key in months) months[key]++;
    });
    return Object.entries(months).map(([month, count]) => ({ month, count }));
  })();

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-medium">Health records</div>
          <div className="text-[11px] text-[#64748b]">
            {records.length} records · encrypted with your wallet key
          </div>
        </div>
        <label className="cursor-pointer px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] transition-colors">
          Upload new record
          <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.dicom" onChange={handleFileSelect} />
        </label>
      </div>

      {/* Drop zone */}
      <div
        className={`border-[1.5px] border-dashed rounded-[10px] p-6 text-center mb-4 transition-colors ${
          dragActive ? "border-[#0D9488] bg-[#E1F5EE]/30" : "border-[#cbd5e1] bg-[#f8fafc]"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <Upload className="h-7 w-7 text-[#0D9488] mx-auto mb-2" />
        <div className="text-[13px] text-[#64748b]">
          Drop files here or{" "}
          <label className="text-[#0D9488] cursor-pointer hover:underline">
            browse
            <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.dicom" onChange={handleFileSelect} />
          </label>
        </div>
        <div className="text-[10px] text-[#94a3b8] mt-1">
          Files are encrypted locally with AES-256 before upload · PDF, JPG, PNG, DICOM
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
        {records.length === 0 && (
          <div className="text-center py-8 text-[13px] text-[#94a3b8]">
            No records yet. Upload your first health record above.
          </div>
        )}
        {records.map((record) => {
          const style = TYPE_STYLES[record.type] || TYPE_STYLES.lab;
          const Icon = style.icon;
          return (
            <div
              key={record.id}
              className="flex items-center gap-[10px] px-3 py-[10px] bg-white border border-[#e2e8f0] rounded-[9px]"
            >
              <div
                className={`w-8 h-8 ${style.bg} rounded-[7px] flex items-center justify-center text-[10px] font-medium ${style.text} flex-shrink-0`}
              >
                {style.label.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{record.name}</div>
                <div className="text-[11px] text-[#64748b]">
                  {new Date(record.date).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  ·{" "}
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${record.cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0D9488] hover:underline"
                  >
                    {record.cid.slice(0, 6)}…
                  </a>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-[2px] rounded-lg font-medium ${style.bg} ${style.text}`}>
                {style.label}
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
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
              labelStyle={{ fontSize: 11, fontWeight: 500 }}
            />
            <Line type="monotone" dataKey="count" stroke="#0D9488" strokeWidth={1.5} dot={{ r: 3, fill: "#0D9488" }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
