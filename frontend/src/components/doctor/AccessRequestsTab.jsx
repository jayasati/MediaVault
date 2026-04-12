import { useState, useEffect, useCallback } from "react";
import { Send, Clock, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { ethers } from "ethers";

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

const STATUS_STYLES = {
  0: { label: "Awaiting approval", bg: "bg-[#FAEEDA]", text: "text-[#633806]" },
  1: { label: "Approved", bg: "bg-[#E1F5EE]", text: "text-[#085041]" },
  2: { label: "Rejected", bg: "bg-[#FCEBEB]", text: "text-[#791F1F]" },
  3: { label: "Revoked", bg: "bg-[#FCEBEB]", text: "text-[#791F1F]" },
  4: { label: "Expired", bg: "bg-[#f1f5f9]", text: "text-[#64748b]" },
};

export default function AccessRequestsTab() {
  const { walletAddress, signer } = useWallet();
  const accessControl = useContract("MediAccessControl");

  const [patientAddr, setPatientAddr] = useState("");
  const [reason, setReason] = useState("");
  const [gasEst, setGasEst] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadRequests = useCallback(async () => {
    if (!accessControl || !walletAddress) return;
    setLoading(true);
    try {
      const ids = await accessControl.getMyAccessRequests();
      const reqs = [];
      for (const id of ids) {
        const req = await accessControl.getAccessRequest(id);
        reqs.push({
          requestId: req.requestId.toString(),
          doctorAddress: req.doctorAddress,
          patientAddress: req.patientAddress,
          reason: req.reason,
          requestedAt: Number(req.requestedAt),
          respondedAt: Number(req.respondedAt),
          expiresAt: Number(req.expiresAt),
          status: Number(req.status),
        });
      }
      setRequests(reqs.reverse());
    } catch (err) {
      console.error("Failed to load requests:", err);
    } finally {
      setLoading(false);
    }
  }, [accessControl, walletAddress]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  // Estimate gas
  useEffect(() => {
    if (!accessControl || !patientAddr || !ethers.isAddress(patientAddr) || !reason) {
      setGasEst("");
      return;
    }
    const est = async () => {
      try {
        const gas = await accessControl.requestAccess.estimateGas(patientAddr, reason);
        const price = await signer.provider.getFeeData();
        const cost = gas * (price.gasPrice || 0n);
        setGasEst(ethers.formatEther(cost));
      } catch {
        setGasEst("—");
      }
    };
    est();
  }, [accessControl, patientAddr, reason, signer]);

  const handleSubmit = async () => {
    if (!accessControl || !patientAddr || !reason) return;
    if (!ethers.isAddress(patientAddr)) {
      toast.error("Invalid wallet address");
      return;
    }
    setSubmitting(true);
    const tid = toast.loading("Sending access request...");
    try {
      const tx = await accessControl.requestAccess(patientAddr, reason);
      toast.loading("Waiting for confirmation...", { id: tid });
      const receipt = await tx.wait();
      toast.success(
        <span>
          Request sent!{" "}
          <a href={`https://sepolia.etherscan.io/tx/${receipt.hash}`} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </span>,
        { id: tid }
      );
      setPatientAddr("");
      setReason("");
      loadRequests();
    } catch (err) {
      if (err.code === "ACTION_REJECTED") {
        toast.error("Rejected", { id: tid });
      } else if (err.reason) {
        toast.error(err.reason, { id: tid });
      } else {
        toast.error("Failed to send request", { id: tid });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const now = Date.now() / 1000;
  const pending = requests.filter((r) => Number(r.status) === 0);
  const approved = requests.filter((r) => Number(r.status) === 1 && Number(r.expiresAt) > now);

  return (
    <div>
      {/* Request form */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        <div className="text-xs font-medium text-[#64748b] mb-3">Request patient access</div>
        <input
          type="text"
          value={patientAddr}
          onChange={(e) => setPatientAddr(e.target.value)}
          placeholder="Patient wallet address (0x…)"
          className="w-full px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] mb-2 focus:outline-none focus:border-[#0D9488]"
        />
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for access request"
          rows={2}
          className="w-full px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] mb-3 resize-none focus:outline-none focus:border-[#0D9488]"
        />
        <button
          onClick={handleSubmit}
          disabled={submitting || !patientAddr || !reason}
          className="flex items-center gap-1.5 px-4 py-[7px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
        >
          <Send className="h-3 w-3" />
          {submitting
            ? "Sending..."
            : `Send request${gasEst && gasEst !== "—" ? ` · est. ${Number(gasEst).toFixed(6)} ETH gas` : ""}`}
        </button>
      </div>

      {/* Pending requests */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        <div className="text-xs font-medium text-[#64748b] mb-3">Pending requests — {pending.length}</div>
        {pending.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-4 text-center">No pending requests</div>
        )}
        <div className="flex flex-col gap-2">
          {pending.map((r) => (
            <div key={r.requestId.toString()} className="flex items-center gap-[10px] p-[10px] bg-[#f8fafc] rounded-lg">
              <div className="w-7 h-7 bg-[#FAEEDA] rounded-full flex items-center justify-center flex-shrink-0">
                <Clock className="h-3.5 w-3.5 text-[#633806]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{shortenAddr(r.patientAddress)}</div>
                <div className="text-[11px] text-[#64748b]">
                  {new Date(Number(r.requestedAt) * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  {" · "}{r.reason || "No reason"}
                </div>
              </div>
              <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#FAEEDA] text-[#633806]">
                Awaiting approval
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Approved accesses */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-3">Approved accesses — {approved.length}</div>
        {approved.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-4 text-center">No active approvals</div>
        )}
        <div className="flex flex-col gap-2">
          {approved.map((r) => {
            const daysLeft = Math.ceil((Number(r.expiresAt) - now) / 86400);
            return (
              <div key={r.requestId.toString()} className="flex items-center gap-[10px] px-[10px] py-2 border-b border-[#e2e8f0] last:border-0">
                <div className="w-7 h-7 bg-[#E1F5EE] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-medium text-[#085041]">
                    {r.patientAddress.slice(2, 4).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{shortenAddr(r.patientAddress)}</div>
                  <div className="text-[11px] text-[#64748b]">
                    Expires {new Date(Number(r.expiresAt) * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E1F5EE] text-[#085041]">
                  {daysLeft}d left
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
