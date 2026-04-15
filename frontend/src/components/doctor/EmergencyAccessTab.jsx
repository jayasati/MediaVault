import { useState, useEffect, useCallback } from "react";
import { Siren, Search, ExternalLink, MapPin, Clock, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";

export default function EmergencyAccessTab() {
  const { walletAddress } = useWallet();
  const emergencyAccess = useContract("EmergencyAccess");
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lookupId, setLookupId] = useState("");

  const load = useCallback(async () => {
    if (!emergencyAccess || !walletAddress) return;
    setLoading(true);
    try {
      const ids = await emergencyAccess.getResponderAccessLog(walletAddress);
      const out = [];
      for (const id of ids) {
        const r = await emergencyAccess.getAccessRecord(id);
        out.push({
          accessId: Number(r.accessId),
          patientId: Number(r.patientId),
          accessedAt: Number(r.accessedAt),
          location: r.location,
          reason: r.reason,
          wasNotified: r.wasNotified,
        });
      }
      setHistory(out.reverse());
    } catch (err) {
      console.error("Failed to load emergency history:", err);
      toast.error("Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [emergencyAccess, walletAddress]);

  useEffect(() => { load(); }, [load]);

  const handleLookup = () => {
    const n = Number(lookupId);
    if (!n || n <= 0) {
      toast.error("Enter a valid patient ID");
      return;
    }
    window.open(`/emergency/${n}`, "_blank");
  };

  return (
    <div>
      <div className="mb-4">
        <div className="text-[15px] font-medium">Emergency access</div>
        <div className="text-[11px] text-[#64748b]">
          Break-glass access to patient emergency profiles. Every access is logged on-chain.
        </div>
      </div>

      {/* Patient lookup */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        <div className="text-[11px] font-medium text-[#64748b] mb-2">Look up patient by ID</div>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
            <input
              type="number"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="Patient ID (from QR code)"
              className="w-full pl-9 pr-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#DC2626]"
            />
          </div>
          <button
            onClick={handleLookup}
            className="px-4 py-[7px] bg-[#DC2626] text-white text-xs font-medium rounded-[7px] hover:bg-[#B91C1C] inline-flex items-center gap-1.5"
          >
            <Siren className="h-3.5 w-3.5" />
            Open emergency card
          </button>
        </div>
        <div className="text-[10px] text-[#94a3b8] mt-2">
          Scan the patient's QR code or enter the numeric ID. The emergency card opens in a new tab.
        </div>
      </div>

      {/* History */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
          <div className="text-xs font-medium text-[#64748b]">
            Your break-glass history — {history.length}
          </div>
          {loading && (
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
          )}
        </div>
        {!loading && history.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-10 text-center">
            No emergency access records yet
          </div>
        )}
        {history.map((h) => (
          <div key={h.accessId} className="px-5 py-3 border-b border-[#e2e8f0] last:border-0 flex items-center gap-3">
            <div className="w-9 h-9 bg-[#FEF2F2] rounded-full flex items-center justify-center flex-shrink-0">
              <Siren className="h-4 w-4 text-[#DC2626]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium">
                Patient #{h.patientId}
                {h.wasNotified && (
                  <span className="ml-2 text-[9px] px-1.5 py-[1px] rounded bg-[#E1F5EE] text-[#085041] font-medium">
                    Acknowledged
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#64748b] mt-0.5 truncate">{h.reason}</div>
              <div className="text-[10px] text-[#94a3b8] mt-0.5 flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {new Date(h.accessedAt * 1000).toLocaleString("en-IN", {
                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
                {h.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" />
                    {h.location}
                  </span>
                )}
              </div>
            </div>
            <Link
              to={`/emergency/${h.patientId}`}
              target="_blank"
              className="text-[11px] text-[#DC2626] hover:underline inline-flex items-center gap-0.5 flex-shrink-0"
            >
              Re-open <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
