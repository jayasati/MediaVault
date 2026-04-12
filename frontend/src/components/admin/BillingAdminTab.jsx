import { useState } from "react";
import { Plus, FileText, AlertTriangle, CheckCircle, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { ethers } from "ethers";

const CATEGORIES = [
  { value: 0, label: "Consultation" },
  { value: 1, label: "Medicine" },
  { value: 2, label: "Procedure" },
  { value: 3, label: "Room" },
  { value: 4, label: "Test" },
  { value: 5, label: "Other" },
];

export default function BillingAdminTab() {
  const { walletAddress } = useWallet();
  const billing = useContract("BillingTransparency");

  // Log event form
  const [evtPatient, setEvtPatient] = useState("");
  const [evtDesc, setEvtDesc] = useState("");
  const [evtAmount, setEvtAmount] = useState("");
  const [evtCategory, setEvtCategory] = useState(0);
  const [evtDoctor, setEvtDoctor] = useState("");
  const [logging, setLogging] = useState(false);

  // Generate bill form
  const [billPatient, setBillPatient] = useState("");
  const [billEventIds, setBillEventIds] = useState("");
  const [generating, setGenerating] = useState(false);

  // Demo disputes
  const [disputes] = useState([
    { id: 1, billId: 3, patient: "0x4f3a…8d2c", reason: "Procedure not performed", amount: "₹5,000", status: "open" },
    { id: 2, billId: 7, patient: "0x8b1c…4a7f", reason: "Duplicate charge for blood panel", amount: "₹650", status: "open" },
  ]);

  const handleLogEvent = async () => {
    if (!billing) {
      toast.error("Billing contract not available");
      return;
    }
    if (!evtPatient || !evtDesc || !evtAmount) {
      toast.error("Fill all fields");
      return;
    }
    setLogging(true);
    const tid = toast.loading("Logging billable event...");
    try {
      const tx = await billing.logBillableEvent(
        evtPatient, evtDesc, Number(evtAmount), evtCategory, evtDoctor || ethers.ZeroAddress
      );
      await tx.wait();
      toast.success("Event logged on-chain", { id: tid });
      setEvtDesc("");
      setEvtAmount("");
    } catch (err) {
      toast.error(err.reason || "Failed to log event", { id: tid });
    } finally {
      setLogging(false);
    }
  };

  const handleGenerateBill = async () => {
    if (!billing) {
      toast.error("Billing contract not available");
      return;
    }
    if (!billPatient || !billEventIds) {
      toast.error("Fill all fields");
      return;
    }
    setGenerating(true);
    const tid = toast.loading("Generating final bill...");
    try {
      const ids = billEventIds.split(",").map((s) => Number(s.trim()));
      const tx = await billing.generateFinalBill(billPatient, ids);
      await tx.wait();
      toast.success("Bill generated on-chain", { id: tid });
      setBillEventIds("");
    } catch (err) {
      toast.error(err.reason || "Failed to generate bill", { id: tid });
    } finally {
      setGenerating(false);
    }
  };

  const handleResolve = (disputeId) => {
    toast.success(`Dispute #${disputeId} resolved (demo mode)`);
  };

  return (
    <div>
      {/* Two column: log event + generate bill */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Log billable event */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-[13px] font-medium mb-3 flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5 text-[#0D9488]" />
            Log billable event
          </div>
          <div className="flex flex-col gap-2">
            <input type="text" value={evtPatient} onChange={(e) => setEvtPatient(e.target.value)}
              placeholder="Patient address (0x…)"
              className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]" />
            <input type="text" value={evtDesc} onChange={(e) => setEvtDesc(e.target.value)}
              placeholder="Description"
              className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" value={evtAmount} onChange={(e) => setEvtAmount(e.target.value)}
                placeholder="Amount (wei)"
                className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]" />
              <select value={evtCategory} onChange={(e) => setEvtCategory(Number(e.target.value))}
                className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white focus:outline-none focus:border-[#0D9488]">
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <input type="text" value={evtDoctor} onChange={(e) => setEvtDoctor(e.target.value)}
              placeholder="Doctor address (optional)"
              className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]" />
            <button onClick={handleLogEvent} disabled={logging}
              className="mt-1 px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50">
              {logging ? "Logging..." : "Log event"}
            </button>
          </div>
        </div>

        {/* Generate bill */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-[13px] font-medium mb-3 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-[#0D9488]" />
            Generate final bill
          </div>
          <div className="flex flex-col gap-2">
            <input type="text" value={billPatient} onChange={(e) => setBillPatient(e.target.value)}
              placeholder="Patient address (0x…)"
              className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]" />
            <input type="text" value={billEventIds} onChange={(e) => setBillEventIds(e.target.value)}
              placeholder="Event IDs (comma separated: 1, 2, 3)"
              className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]" />
            <div className="text-[10px] text-[#94a3b8]">
              Total amount is auto-calculated from referenced events
            </div>
            <button onClick={handleGenerateBill} disabled={generating}
              className="mt-1 px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50">
              {generating ? "Generating..." : "Generate bill"}
            </button>
          </div>
        </div>
      </div>

      {/* Active disputes */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-3">Active disputes — {disputes.length}</div>
        <div className="flex flex-col gap-2">
          {disputes.map((d) => (
            <div key={d.id} className="flex items-center gap-[10px] p-[10px] border-l-[3px] border-[#854F0B] bg-[#FAEEDA]/30 rounded-r-lg">
              <AlertTriangle className="h-4 w-4 text-[#854F0B] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">Dispute #{d.id} — Bill #{d.billId}</div>
                <div className="text-[11px] text-[#64748b]">
                  Patient {d.patient} · {d.reason} · Contested: {d.amount}
                </div>
              </div>
              <button
                onClick={() => handleResolve(d.id)}
                className="px-3 py-[5px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72]"
              >
                <CheckCircle className="h-3 w-3 inline mr-1" />
                Resolve
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
