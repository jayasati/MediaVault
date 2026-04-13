import { useState, useEffect, useCallback } from "react";
import { UserPlus, ShieldCheck, XCircle, ExternalLink, Clock } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";

const ROLE_LABELS = { 2: "Doctor", 3: "Researcher" };
const STATUS_LABELS = { 0: "Pending", 1: "Approved", 2: "Rejected" };

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function DoctorsTab() {
  const { walletAddress } = useWallet();
  const roleManager = useContract("RoleManager");

  const [pendingApps, setPendingApps] = useState([]);
  const [approvedList, setApprovedList] = useState([]);
  const [adminHospital, setAdminHospital] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadApplications = useCallback(async () => {
    if (!roleManager || !walletAddress) return;
    setLoading(true);
    try {
      // Look up the current admin's hospitalId
      const me = await roleManager.getUserDetails(walletAddress);
      const myHospital = me.hospitalId;
      const isSuperAdmin = Number(me.role) === 5;
      setAdminHospital(myHospital);

      // Fetch pending applications scoped to this hospital
      // (super admins see everything via getPendingApplications)
      const pendingIds = isSuperAdmin
        ? await roleManager.getPendingApplications()
        : await roleManager.getPendingApplicationsForHospital(myHospital);

      const pending = [];
      for (const id of pendingIds) {
        const app = await roleManager.getApplication(id);
        pending.push({
          applicationId: Number(app.applicationId),
          applicant: app.applicant,
          requestedRole: Number(app.requestedRole),
          name: app.name,
          specialization: app.specialization,
          credentials: app.credentials,
          hospitalId: app.hospitalId,
          appliedAt: Number(app.appliedAt),
        });
      }
      setPendingApps(pending);

      // Approved doctors/researchers — filter by same hospital (unless super admin)
      const filter = roleManager.filters.ApplicationApproved();
      const events = await roleManager.queryFilter(filter, 0, "latest");

      const byWallet = new Map();
      for (const evt of events) {
        const app = await roleManager.getApplication(evt.args[0]);
        byWallet.set(app.applicant.toLowerCase(), {
          address: app.applicant,
          name: app.name,
          role: Number(app.requestedRole),
          specialization: app.specialization,
          hospitalId: app.hospitalId,
          txHash: evt.transactionHash,
        });
      }

      // Filter: only keep wallets whose current on-chain role is still DOCTOR or RESEARCHER
      // AND belong to this admin's hospital (unless super admin)
      const approved = [];
      for (const entry of byWallet.values()) {
        if (!isSuperAdmin && entry.hospitalId !== myHospital) continue;
        const details = await roleManager.getUserDetails(entry.address);
        const currentRole = Number(details.role);
        if (currentRole === 2 || currentRole === 3) {
          approved.push({
            ...entry,
            role: currentRole, // use current role in case it changed
            approvedAt: Number(details.registeredAt),
          });
        }
      }
      setApprovedList(approved);
    } catch (err) {
      console.error("Failed to load applications:", err);
    } finally {
      setLoading(false);
    }
  }, [roleManager]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const handleApprove = async (applicationId) => {
    if (!roleManager) return;
    const tid = toast.loading("Approving on-chain...");
    try {
      const tx = await roleManager.approveApplication(applicationId);
      await tx.wait();
      toast.success("Application approved!", { id: tid });
      loadApplications();
    } catch (err) {
      toast.error(err.reason || "Failed to approve", { id: tid });
    }
  };

  const handleReject = async (applicationId) => {
    if (!roleManager) return;
    const reason = window.prompt(
      "Rejection reason (shown to applicant):",
      "Credentials could not be verified. Please resubmit with additional documentation."
    );
    if (reason === null) return; // user cancelled
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    const tid = toast.loading("Rejecting...");
    try {
      const tx = await roleManager.rejectApplication(applicationId, reason.trim());
      await tx.wait();
      toast.success("Application rejected", { id: tid });
      loadApplications();
    } catch (err) {
      toast.error(err.reason || "Failed to reject", { id: tid });
    }
  };

  const handleRevoke = async (address) => {
    if (!roleManager) return;
    const tid = toast.loading("Revoking role...");
    try {
      const tx = await roleManager.revokeRole(address);
      await tx.wait();
      toast.success("Role revoked", { id: tid });
      loadApplications();
    } catch (err) {
      toast.error(err.reason || "Failed to revoke", { id: tid });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Loading applications from chain...
      </div>
    );
  }

  return (
    <div>
      {/* Hospital scope banner */}
      {adminHospital && (
        <div className="flex items-center gap-2 p-[10px] px-[14px] bg-[#E6F1FB] border border-[#93c5fd] rounded-[9px] mb-4">
          <div className="text-[11px] text-[#0C447C]">
            <span className="font-medium">Hospital scope:</span>{" "}
            <span className="font-mono">{adminHospital === "0x0000000000000000000000000000000000000000000000000000000000000000"
              ? "all hospitals (super admin)"
              : `${adminHospital.slice(0, 10)}…`}</span>
            <span className="ml-2 text-[#64748b]">
              — you only see applications targeting your hospital
            </span>
          </div>
        </div>
      )}

      {/* Pending applications */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        <div className="text-xs font-medium text-[#64748b] mb-3">
          Pending applications — {pendingApps.length}
        </div>

        {pendingApps.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-6 text-center">No pending applications</div>
        )}

        <div className="flex flex-col gap-2">
          {pendingApps.map((app) => (
            <div key={app.applicationId} className="flex items-center gap-[10px] p-[10px] bg-[#f8fafc] rounded-lg">
              <div className="w-8 h-8 bg-[#E6F1FB] rounded-full flex items-center justify-center text-[10px] font-medium text-[#0C447C] flex-shrink-0">
                {app.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium flex items-center gap-2">
                  {app.name}
                  <span className={`text-[9px] px-1.5 py-[1px] rounded font-medium ${
                    app.requestedRole === 2 ? "bg-[#E6F1FB] text-[#0C447C]" : "bg-[#EEEDFE] text-[#3C3489]"
                  }`}>
                    {ROLE_LABELS[app.requestedRole]}
                  </span>
                </div>
                <div className="text-[10px] text-[#64748b]">
                  {app.specialization && `${app.specialization} · `}
                  {shortenAddr(app.applicant)} · Cred: {app.credentials}
                </div>
                <div className="text-[10px] text-[#94a3b8]">
                  Applied {new Date(app.appliedAt * 1000).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </div>
              </div>
              <button
                onClick={() => handleApprove(app.applicationId)}
                className="px-3 py-[5px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72]"
              >
                Approve
              </button>
              <button
                onClick={() => handleReject(app.applicationId)}
                className="px-3 py-[5px] bg-[#FCEBEB] text-[#791F1F] text-[11px] rounded-[7px] hover:bg-[#f9d5d5]"
              >
                Reject
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Approved doctors & researchers */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e8f0]">
          <div className="text-xs font-medium text-[#64748b]">
            Approved doctors & researchers — {approvedList.length}
          </div>
        </div>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-5 py-2 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <div className="text-[10px] font-medium text-[#94a3b8]">Name / Address</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Role</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Specialization</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Approved</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Action</div>
        </div>

        {approvedList.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-6 text-center">No approved users yet</div>
        )}

        {approvedList.map((user) => (
          <div key={user.address} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-5 py-[10px] border-b border-[#e2e8f0] last:border-0 items-center">
            <div>
              <div className="text-xs font-medium">{user.name}</div>
              <div className="text-[10px] font-mono text-[#64748b]">{shortenAddr(user.address)}</div>
            </div>
            <span className={`text-[10px] px-2 py-[2px] rounded-lg font-medium w-fit ${
              user.role === 2 ? "bg-[#E6F1FB] text-[#0C447C]" : "bg-[#EEEDFE] text-[#3C3489]"
            }`}>
              {ROLE_LABELS[user.role]}
            </span>
            <div className="text-[11px] text-[#64748b]">{user.specialization || "—"}</div>
            <div className="text-[11px] text-[#64748b]">
              {new Date(user.approvedAt * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </div>
            <button
              onClick={() => handleRevoke(user.address)}
              className="px-2 py-[3px] bg-[#FCEBEB] text-[#791F1F] text-[10px] rounded-[6px] hover:bg-[#f9d5d5] w-fit"
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
