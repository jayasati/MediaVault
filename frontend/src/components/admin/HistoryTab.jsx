import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, UserMinus, RefreshCw, ExternalLink, Filter } from "lucide-react";
import useContract from "@/hooks/useContract";
import useWallet from "@/hooks/useWallet";

const ROLE_LABELS = { 2: "Doctor", 3: "Researcher", 4: "Admin" };
const ROLE_COLORS = {
  2: "bg-[#E6F1FB] text-[#0C447C]",
  3: "bg-[#EEEDFE] text-[#3C3489]",
  4: "bg-[#FAEEDA] text-[#633806]",
};

const EVENT_STYLES = {
  approved: { label: "Approved", icon: CheckCircle, bg: "bg-[#E1F5EE]", text: "text-[#085041]", iconColor: "text-[#085041]" },
  rejected: { label: "Rejected", icon: XCircle, bg: "bg-[#FCEBEB]", text: "text-[#791F1F]", iconColor: "text-[#791F1F]" },
  revoked: { label: "Revoked", icon: UserMinus, bg: "bg-[#FCEBEB]", text: "text-[#791F1F]", iconColor: "text-[#791F1F]" },
};

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function HistoryTab() {
  const { provider } = useWallet();
  const roleManager = useContract("RoleManager");

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterRole, setFilterRole] = useState("all");

  const loadHistory = useCallback(async () => {
    if (!roleManager || !provider) return;
    setLoading(true);
    try {
      const allEvents = [];

      // 1. Application approvals
      const approvedFilter = roleManager.filters.ApplicationApproved();
      const approvedEvents = await roleManager.queryFilter(approvedFilter, 0, "latest");
      for (const evt of approvedEvents) {
        const app = await roleManager.getApplication(evt.args[0]);
        let blockTime = 0;
        try {
          const block = await evt.getBlock();
          blockTime = Number(block.timestamp);
        } catch {}
        allEvents.push({
          type: "approved",
          applicationId: Number(app.applicationId),
          wallet: app.applicant,
          name: app.name,
          role: Number(app.requestedRole),
          specialization: app.specialization,
          credentials: app.credentials,
          by: evt.args[3],
          timestamp: blockTime,
          txHash: evt.transactionHash,
        });
      }

      // 2. Application rejections
      const rejectedFilter = roleManager.filters.ApplicationRejected();
      const rejectedEvents = await roleManager.queryFilter(rejectedFilter, 0, "latest");
      for (const evt of rejectedEvents) {
        const app = await roleManager.getApplication(evt.args[0]);
        let blockTime = 0;
        try {
          const block = await evt.getBlock();
          blockTime = Number(block.timestamp);
        } catch {}
        allEvents.push({
          type: "rejected",
          applicationId: Number(app.applicationId),
          wallet: app.applicant,
          name: app.name,
          role: Number(app.requestedRole),
          specialization: app.specialization,
          credentials: app.credentials,
          by: evt.args[2],
          timestamp: blockTime,
          txHash: evt.transactionHash,
        });
      }

      // 3. Role revocations
      const revokedFilter = roleManager.filters.RoleRevoked();
      const revokedEvents = await roleManager.queryFilter(revokedFilter, 0, "latest");
      for (const evt of revokedEvents) {
        let blockTime = 0;
        try {
          const block = await evt.getBlock();
          blockTime = Number(block.timestamp);
        } catch {}
        allEvents.push({
          type: "revoked",
          wallet: evt.args[0],
          role: Number(evt.args[1]),
          by: evt.args[2],
          name: "",
          specialization: "",
          credentials: "",
          timestamp: blockTime,
          txHash: evt.transactionHash,
        });
      }

      // Sort newest first
      allEvents.sort((a, b) => b.timestamp - a.timestamp);
      setEvents(allEvents);
    } catch (err) {
      console.error("Failed to load history:", err);
    } finally {
      setLoading(false);
    }
  }, [roleManager, provider]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filtered = events.filter((e) => {
    if (filterType !== "all" && e.type !== filterType) return false;
    if (filterRole !== "all" && e.role !== Number(filterRole)) return false;
    return true;
  });

  const exportCSV = () => {
    const header = "Timestamp,Type,Wallet,Name,Role,Specialization,Credentials,By,TxHash\n";
    const rows = filtered.map((e) =>
      [
        new Date(e.timestamp * 1000).toISOString(),
        e.type,
        e.wallet,
        e.name || "",
        ROLE_LABELS[e.role] || "",
        e.specialization || "",
        e.credentials || "",
        e.by || "",
        e.txHash,
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")
    );
    const csv = header + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medivault-role-history-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4">
        <div className="text-[15px] font-medium">Role history</div>
        <div className="text-[11px] text-[#64748b]">
          Complete audit trail of approvals, rejections, and revocations — nothing is ever deleted
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-[#64748b]" />
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-[5px] text-[11px] border border-[#cbd5e1] rounded-[7px] bg-white"
          >
            <option value="all">All events</option>
            <option value="approved">Approved only</option>
            <option value="rejected">Rejected only</option>
            <option value="revoked">Revoked only</option>
          </select>
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-2 py-[5px] text-[11px] border border-[#cbd5e1] rounded-[7px] bg-white"
        >
          <option value="all">All roles</option>
          <option value="2">Doctor</option>
          <option value="3">Researcher</option>
          <option value="4">Admin</option>
        </select>
        <button
          onClick={loadHistory}
          disabled={loading}
          className="flex items-center gap-1 px-3 py-[5px] border border-[#cbd5e1] rounded-[7px] text-[11px] hover:bg-[#f8fafc]"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
        <div className="text-[11px] text-[#64748b] ml-auto">
          {filtered.length} event{filtered.length !== 1 ? "s" : ""}
        </div>
        <button
          onClick={exportCSV}
          disabled={filtered.length === 0}
          className="px-3 py-[5px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {/* History table */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
        <div className="grid grid-cols-[120px_100px_2fr_1fr_1fr_100px] gap-2 px-5 py-2 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <div className="text-[10px] font-medium text-[#94a3b8]">Time</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Action</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">User / Details</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Role</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">By</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Tx</div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 gap-2 text-[11px] text-[#64748b]">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
            Loading history from chain...
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-8 text-center">No history events found</div>
        )}

        {filtered.map((evt, i) => {
          const style = EVENT_STYLES[evt.type];
          const Icon = style.icon;
          return (
            <div
              key={`${evt.txHash}-${i}`}
              className="grid grid-cols-[120px_100px_2fr_1fr_1fr_100px] gap-2 px-5 py-[10px] border-b border-[#e2e8f0] last:border-0 items-center"
            >
              <div className="text-[10px] text-[#64748b]">
                {evt.timestamp
                  ? new Date(evt.timestamp * 1000).toLocaleString("en-IN", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })
                  : "—"}
              </div>
              <div>
                <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-[2px] rounded-lg font-medium ${style.bg} ${style.text}`}>
                  <Icon className="h-3 w-3" />
                  {style.label}
                </span>
              </div>
              <div className="min-w-0">
                {evt.name && <div className="text-xs font-medium truncate">{evt.name}</div>}
                <div className="text-[10px] font-mono text-[#64748b] truncate">{shortenAddr(evt.wallet)}</div>
                {evt.specialization && (
                  <div className="text-[10px] text-[#94a3b8] truncate">
                    {evt.specialization}{evt.credentials ? ` · ${evt.credentials}` : ""}
                  </div>
                )}
                {evt.applicationId && (
                  <div className="text-[10px] text-[#94a3b8]">App #{evt.applicationId}</div>
                )}
              </div>
              <div>
                <span className={`text-[10px] px-2 py-[2px] rounded-lg font-medium ${ROLE_COLORS[evt.role] || "bg-[#f1f5f9] text-[#64748b]"}`}>
                  {ROLE_LABELS[evt.role] || "—"}
                </span>
              </div>
              <div className="text-[10px] font-mono text-[#64748b] truncate">
                {shortenAddr(evt.by)}
              </div>
              <div>
                <a
                  href={`https://sepolia.etherscan.io/tx/${evt.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#0D9488] hover:underline inline-flex items-center gap-0.5"
                >
                  {evt.txHash.slice(0, 8)}… <ExternalLink className="h-[9px] w-[9px]" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
