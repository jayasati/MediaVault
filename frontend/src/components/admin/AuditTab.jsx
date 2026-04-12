import { useState, useEffect, useCallback } from "react";
import { Filter, Download, ExternalLink, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";

const EVENT_TYPES = [
  { name: "AccessRequested", contract: "MediAccessControl", color: "bg-[#E6F1FB] text-[#0C447C]" },
  { name: "AccessApproved", contract: "MediAccessControl", color: "bg-[#E1F5EE] text-[#085041]" },
  { name: "AccessRevoked", contract: "MediAccessControl", color: "bg-[#FCEBEB] text-[#791F1F]" },
  { name: "PrescriptionWritten", contract: "PrescriptionManager", color: "bg-[#EEEDFE] text-[#3C3489]" },
  { name: "PrescriptionDispensed", contract: "PrescriptionManager", color: "bg-[#E1F5EE] text-[#085041]" },
  { name: "ControlledSubstanceAlert", contract: "PrescriptionManager", color: "bg-[#FCEBEB] text-[#791F1F]" },
  { name: "EmergencyAccessGranted", contract: "EmergencyAccess", color: "bg-[#FAEEDA] text-[#633806]" },
];

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function AuditTab() {
  const { provider } = useWallet();
  const accessControl = useContract("MediAccessControl");
  const prescriptionMgr = useContract("PrescriptionManager");
  const emergencyAccess = useContract("EmergencyAccess");

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("All");
  const [filterAddr, setFilterAddr] = useState("");

  const loadEvents = useCallback(async () => {
    if (!provider) return;
    setLoading(true);
    const allEvents = [];

    try {
      const contracts = [
        { contract: accessControl, events: ["AccessRequested", "AccessApproved", "AccessRevoked"] },
        { contract: prescriptionMgr, events: ["PrescriptionWritten", "PrescriptionDispensed", "ControlledSubstanceAlert"] },
        { contract: emergencyAccess, events: ["EmergencyAccessGranted"] },
      ];

      for (const { contract, events: evtNames } of contracts) {
        if (!contract) continue;
        for (const evtName of evtNames) {
          try {
            const filter = contract.filters[evtName]();
            const logs = await contract.queryFilter(filter, 0, "latest");
            for (const log of logs) {
              let blockTime = 0;
              try {
                const block = await log.getBlock();
                blockTime = Number(block.timestamp);
              } catch {}
              allEvents.push({
                type: evtName,
                txHash: log.transactionHash,
                blockNumber: log.blockNumber,
                timestamp: blockTime,
                args: log.args ? Array.from(log.args).map((a) => (typeof a === "bigint" ? a.toString() : a)) : [],
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error("Audit load error:", err);
    }

    allEvents.sort((a, b) => b.timestamp - a.timestamp);
    setEvents(allEvents);
    setLoading(false);
  }, [provider, accessControl, prescriptionMgr, emergencyAccess]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const filtered = events.filter((e) => {
    if (filterType !== "All" && e.type !== filterType) return false;
    if (filterAddr) {
      const addrLower = filterAddr.toLowerCase();
      const hasAddr = e.args.some((a) => typeof a === "string" && a.toLowerCase().includes(addrLower));
      if (!hasAddr) return false;
    }
    return true;
  });

  const exportCSV = () => {
    const header = "Timestamp,Type,TxHash,Args\n";
    const rows = filtered.map((e) =>
      `${new Date(e.timestamp * 1000).toISOString()},${e.type},${e.txHash},"${e.args.join("; ")}"`
    );
    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medivault-audit-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Audit log exported");
  };

  const getEventColor = (type) => {
    const found = EVENT_TYPES.find((e) => e.name === type);
    return found ? found.color : "bg-[#f1f5f9] text-[#64748b]";
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-[#64748b]" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-[5px] text-[11px] border border-[#cbd5e1] rounded-[7px] bg-white"
          >
            <option value="All">All events</option>
            {EVENT_TYPES.map((et) => (
              <option key={et.name} value={et.name}>{et.name}</option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={filterAddr}
          onChange={(e) => setFilterAddr(e.target.value)}
          placeholder="Filter by address…"
          className="px-[10px] py-[5px] text-[11px] border border-[#cbd5e1] rounded-[7px] w-48 focus:outline-none focus:border-[#0D9488]"
        />
        <button
          onClick={loadEvents}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-[5px] border border-[#cbd5e1] rounded-[7px] text-[11px] hover:bg-[#f8fafc]"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <button
          onClick={exportCSV}
          className="flex items-center gap-1 px-3 py-[5px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72] ml-auto"
        >
          <Download className="h-3 w-3" />
          Export CSV
        </button>
      </div>

      {/* Event feed */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
        <div className="px-5 py-2 bg-[#f8fafc] border-b border-[#e2e8f0] grid grid-cols-[100px_140px_1fr_120px] gap-2">
          <div className="text-[10px] font-medium text-[#94a3b8]">Time</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Event</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Details</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Tx</div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-[11px] text-[#64748b]">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
            Scanning events...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-8 text-center">No events found</div>
        )}

        {filtered.slice(0, 50).map((evt, i) => (
          <div key={`${evt.txHash}-${i}`} className="grid grid-cols-[100px_140px_1fr_120px] gap-2 px-5 py-[8px] border-b border-[#e2e8f0] last:border-0 items-center">
            <div className="text-[10px] text-[#64748b]">
              {evt.timestamp ? new Date(evt.timestamp * 1000).toLocaleString("en-IN", {
                day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
              }) : "—"}
            </div>
            <div>
              <span className={`text-[9px] px-2 py-[2px] rounded-lg font-medium ${getEventColor(evt.type)}`}>
                {evt.type}
              </span>
            </div>
            <div className="text-[10px] text-[#64748b] truncate">
              {evt.args.filter((a) => typeof a === "string" && a.startsWith("0x")).map(shortenAddr).join(" → ") || evt.args.slice(0, 3).join(", ")}
            </div>
            <div>
              <a
                href={`https://sepolia.etherscan.io/tx/${evt.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[#0D9488] hover:underline inline-flex items-center gap-0.5"
              >
                {evt.txHash.slice(0, 10)}… <ExternalLink className="h-[9px] w-[9px]" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
