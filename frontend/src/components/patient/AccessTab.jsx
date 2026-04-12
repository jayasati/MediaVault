import { useState, useEffect, useCallback } from "react";
import { UserPlus, ShieldCheck, Clock, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import UserName from "@/components/UserName";

const STATUS_STYLES = {
  0: { label: "Pending", bg: "bg-[#FAEEDA]", text: "text-[#633806]" },
  1: { label: "Active", bg: "bg-[#E1F5EE]", text: "text-[#085041]" },
  2: { label: "Rejected", bg: "bg-[#FCEBEB]", text: "text-[#791F1F]" },
  3: { label: "Revoked", bg: "bg-[#FCEBEB]", text: "text-[#791F1F]" },
  4: { label: "Expired", bg: "bg-[#f1f5f9]", text: "text-[#64748b]" },
};

function shortenAddr(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

function parseRequest(req, extra = {}) {
  return {
    requestId: req.requestId.toString(),
    doctorAddress: req.doctorAddress,
    patientAddress: req.patientAddress,
    reason: req.reason,
    requestedAt: Number(req.requestedAt),
    respondedAt: Number(req.respondedAt),
    expiresAt: Number(req.expiresAt),
    status: Number(req.status),
    ...extra,
  };
}

export default function AccessTab() {
  const { walletAddress } = useWallet();
  const accessControl = useContract("MediAccessControl");

  const [pending, setPending] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!accessControl || !walletAddress) return;
    setLoading(true);
    try {
      // Get pending request IDs
      const pendingIds = await accessControl.getPendingRequestsForPatient(walletAddress);
      const pendingReqs = [];
      for (const id of pendingIds) {
        const req = await accessControl.getAccessRequest(id);
        pendingReqs.push(parseRequest(req));
      }
      setPending(pendingReqs);

      // Build full history by scanning events
      try {
        const filter = accessControl.filters.AccessRequested(null, null, walletAddress);
        const events = await accessControl.queryFilter(filter, 0, "latest");
        const all = [];
        for (const evt of events) {
          const req = await accessControl.getAccessRequest(evt.args[0]);
          let blockTimestamp = 0;
          try {
            const block = await evt.getBlock();
            blockTimestamp = Number(block.timestamp);
          } catch {}
          all.push(parseRequest(req, {
            txHash: evt.transactionHash,
            blockTimestamp,
          }));
        }
        setAllRequests(all.reverse());
      } catch (evtErr) {
        console.warn("Could not load event history:", evtErr);
        // Fall back to just showing pending
        setAllRequests(pendingReqs);
      }
    } catch (err) {
      console.error("Failed to load access requests:", err);
    } finally {
      setLoading(false);
    }
  }, [accessControl, walletAddress]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (requestId) => {
    const tid = toast.loading("Approving access...");
    try {
      const tx = await accessControl.approveAccess(requestId, 30);
      toast.loading("Waiting for confirmation...", { id: tid });
      await tx.wait();
      toast.success("Access approved for 30 days", { id: tid });
      loadRequests();
    } catch (err) {
      toast.error(err.code === "ACTION_REJECTED" ? "Rejected" : "Failed to approve", { id: tid });
    }
  };

  const handleReject = async (requestId) => {
    const tid = toast.loading("Rejecting...");
    try {
      const tx = await accessControl.rejectAccess(requestId);
      await tx.wait();
      toast.success("Access rejected", { id: tid });
      loadRequests();
    } catch (err) {
      toast.error(err.code === "ACTION_REJECTED" ? "Rejected" : "Failed", { id: tid });
    }
  };

  const handleRevoke = async (requestId) => {
    const tid = toast.loading("Revoking access...");
    try {
      const tx = await accessControl.revokeAccess(requestId);
      await tx.wait();
      toast.success("Access revoked", { id: tid });
      loadRequests();
    } catch (err) {
      toast.error(err.code === "ACTION_REJECTED" ? "Rejected" : "Failed", { id: tid });
    }
  };

  const now = Date.now() / 1000;
  const active = allRequests.filter((r) => r.status === 1 && r.expiresAt > now);
  const history = allRequests.filter((r) => r.status !== 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Loading access requests...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <div className="text-[15px] font-medium mb-1">Access control</div>
        <div className="text-[11px] text-[#64748b]">Manage who can see your health records</div>
      </div>

      {/* Pending requests */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        <div className="text-xs font-medium text-[#64748b] mb-3">
          Pending requests — {pending.length}
        </div>
        {pending.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-4 text-center">No pending requests</div>
        )}
        <div className="flex flex-col gap-2">
          {pending.map((req) => (
            <div
              key={req.requestId}
              className="flex items-center gap-[10px] p-[10px] bg-[#f8fafc] rounded-lg"
            >
              <div className="w-8 h-8 bg-[#FAEEDA] rounded-full flex items-center justify-center text-[11px] font-medium text-[#633806] flex-shrink-0">
                <UserPlus className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium"><UserName address={req.doctorAddress} /></div>
                <div className="text-[11px] text-[#64748b]">Reason: {req.reason || "Not specified"}</div>
              </div>
              <button
                onClick={() => handleApprove(req.requestId)}
                className="px-3 py-[5px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72]"
              >
                Approve
              </button>
              <button
                onClick={() => handleReject(req.requestId)}
                className="px-3 py-[5px] bg-[#FCEBEB] text-[#791F1F] text-[11px] rounded-[7px] hover:bg-[#f9d5d5]"
              >
                Reject
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Active access */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        <div className="text-xs font-medium text-[#64748b] mb-3">
          Active access — {active.length} doctor{active.length !== 1 ? "s" : ""}
        </div>
        {active.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-4 text-center">No active access grants</div>
        )}
        <div className="flex flex-col gap-2">
          {active.map((req) => (
            <div
              key={req.requestId}
              className="flex items-center gap-[10px] px-[10px] py-2 border-b border-[#e2e8f0] last:border-0"
            >
              <div className="w-7 h-7 bg-[#E1F5EE] rounded-full flex items-center justify-center text-[10px] font-medium text-[#085041] flex-shrink-0">
                <ShieldCheck className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium"><UserName address={req.doctorAddress} /></div>
                <div className="text-[11px] text-[#64748b]">
                  Expires{" "}
                  {new Date(req.expiresAt * 1000).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
              <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E1F5EE] text-[#085041]">
                Active
              </span>
              <button
                onClick={() => handleRevoke(req.requestId)}
                className="px-[10px] py-[5px] bg-[#FCEBEB] text-[#791F1F] text-[11px] rounded-[6px] hover:bg-[#f9d5d5]"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Access history */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-3">Access history</div>
        {history.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-4 text-center">No history yet</div>
        )}
        <div className="flex flex-col gap-2">
          {history.map((req) => {
            const style = STATUS_STYLES[req.status] || STATUS_STYLES[4];
            return (
              <div
                key={`h-${req.requestId}`}
                className="flex items-center gap-[10px] px-[10px] py-2 border-b border-[#e2e8f0] last:border-0"
              >
                <div className="w-7 h-7 bg-[#f1f5f9] rounded-full flex items-center justify-center flex-shrink-0">
                  <Clock className="h-3.5 w-3.5 text-[#64748b]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium"><UserName address={req.doctorAddress} /></div>
                  <div className="text-[11px] text-[#64748b]">
                    {req.blockTimestamp
                      ? new Date(req.blockTimestamp * 1000).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : new Date(req.requestedAt * 1000).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                    {req.txHash && (
                      <>
                        {" · "}
                        <a
                          href={`https://sepolia.etherscan.io/tx/${req.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0D9488] hover:underline inline-flex items-center gap-0.5"
                        >
                          Tx <ExternalLink className="h-[9px] w-[9px]" />
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={`text-[10px] px-2 py-[2px] rounded-lg font-medium ${style.bg} ${style.text}`}
                >
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
