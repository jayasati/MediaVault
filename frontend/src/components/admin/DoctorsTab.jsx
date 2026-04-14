import { useState, useEffect, useCallback } from "react";
import { UserPlus, ShieldCheck, XCircle, ExternalLink, Clock, RefreshCw, X, FileText, Eye } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";

const IPFS_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
function ipfsUrl(cid) {
  if (!cid) return "#";
  const cleaned = cid.replace(/^ipfs:\/\//, "").replace(/^\/ipfs\//, "");
  const base = IPFS_GATEWAY.endsWith("/") ? IPFS_GATEWAY : `${IPFS_GATEWAY}/`;
  return `${base}${cleaned}`;
}

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
  const [profileModal, setProfileModal] = useState(null); // { app, data, loading, error, previewDoc }

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
          licenseNumber: app.licenseNumber,
          profileIPFS: app.profileIPFS,
          hospitalId: app.hospitalId,
          appliedAt: Number(app.appliedAt),
        });
      }
      console.log(`[DoctorsTab] hospitalId=${myHospital} pendingIds=${pendingIds.length} loaded=${pending.length}`);
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
  }, [roleManager, walletAddress]);

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

  const openProfile = async (app) => {
    setProfileModal({ app, data: null, loading: true, error: null, previewDoc: null });
    try {
      const res = await fetch(ipfsUrl(app.profileIPFS));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProfileModal({ app, data, loading: false, error: null, previewDoc: null });
    } catch (err) {
      setProfileModal({ app, data: null, loading: false, error: err.message || "Failed to load", previewDoc: null });
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
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium text-[#64748b]">
            Pending applications — {pendingApps.length}
          </div>
          <button
            onClick={loadApplications}
            className="text-[11px] text-[#0D9488] hover:text-[#0B7C72] inline-flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
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
                  {shortenAddr(app.applicant)}
                  {app.licenseNumber && ` · License: ${app.licenseNumber}`}
                </div>
                <div className="text-[10px] text-[#94a3b8]">
                  Applied {new Date(app.appliedAt * 1000).toLocaleDateString("en-IN", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                  {app.profileIPFS && (
                    <>
                      {" · "}
                      <button
                        onClick={() => openProfile(app)}
                        className="text-[#0D9488] hover:underline inline-flex items-center gap-0.5"
                      >
                        View profile <Eye className="h-[9px] w-[9px]" />
                      </button>
                    </>
                  )}
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

      {profileModal && (
        <ProfileModal
          state={profileModal}
          onClose={() => setProfileModal(null)}
          onPreview={(key, cid) => setProfileModal((s) => ({ ...s, previewDoc: { key, cid } }))}
          onClosePreview={() => setProfileModal((s) => ({ ...s, previewDoc: null }))}
          onApprove={() => {
            const id = profileModal.app.applicationId;
            setProfileModal(null);
            handleApprove(id);
          }}
          onReject={() => {
            const id = profileModal.app.applicationId;
            setProfileModal(null);
            handleReject(id);
          }}
        />
      )}
    </div>
  );
}

const DOC_LABELS = {
  nmcCertificate: "NMC Certificate",
  degreeCertificate: "Degree Certificate",
  appointmentLetter: "Appointment Letter",
  governmentId: "Government ID",
  credentialsPdf: "Credentials PDF",
};

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[#94a3b8] font-medium">{label}</div>
      <div className={`text-[12px] text-[#0f172a] mt-0.5 break-all ${mono ? "font-mono" : ""}`}>
        {value || <span className="text-[#cbd5e1]">—</span>}
      </div>
    </div>
  );
}

function ProfileModal({ state, onClose, onPreview, onClosePreview, onApprove, onReject }) {
  const { app, data, loading, error, previewDoc } = state;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#e2e8f0]">
          <div>
            <div className="text-[13px] font-semibold text-[#0f172a]">
              {app.requestedRole === 3 ? "Researcher" : "Doctor"} Application
            </div>
            <div className="text-[10px] text-[#64748b]">Review details and verify documents</div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[#f1f5f9] text-[#64748b]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16 gap-3 text-[12px] text-[#64748b]">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
              Fetching profile from IPFS...
            </div>
          )}

          {error && (
            <div className="text-[12px] text-[#791F1F] bg-[#FCEBEB] border border-[#f9d5d5] rounded-lg p-3">
              Failed to load profile: {error}
            </div>
          )}

          {data && !loading && (() => {
            const isResearcher = data.role === "researcher" || app.requestedRole === 3;
            const avatarBg = isResearcher ? "bg-[#EEEDFE]" : "bg-[#E6F1FB]";
            const avatarText = isResearcher ? "text-[#3C3489]" : "text-[#0C447C]";
            return (
            <div className="space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-[#e2e8f0]">
                <div className={`w-12 h-12 ${avatarBg} rounded-full flex items-center justify-center text-[14px] font-semibold ${avatarText}`}>
                  {(data.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-[15px] font-semibold text-[#0f172a]">{data.name}</div>
                  <div className="text-[11px] text-[#64748b] capitalize">
                    {data.role}
                    {data.specialization ? ` · ${data.specialization}` : ""}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {!isResearcher && <Field label="License Number" value={data.licenseNumber} />}
                {!isResearcher && data.specialization && (
                  <Field label="Specialization" value={data.specialization} />
                )}
                <Field label="Qualifications" value={data.qualifications} />
                {!isResearcher && (
                  <Field
                    label="Years of Experience"
                    value={data.yearsOfExperience != null ? String(data.yearsOfExperience) : ""}
                  />
                )}
                <Field
                  label="Submitted"
                  value={data.submittedAt ? new Date(data.submittedAt).toLocaleString("en-IN") : ""}
                />
                <Field label="Wallet Address" value={data.wallet} mono />
                <Field label="Hospital ID" value={data.hospitalId} mono />
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-wide text-[#64748b] font-medium mb-2">
                  Verification Documents
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(data.documents || {}).map(([key, cid]) => (
                    <div
                      key={key}
                      className="flex items-center gap-2 p-[10px] bg-[#f8fafc] border border-[#e2e8f0] rounded-lg"
                    >
                      <FileText className="h-4 w-4 text-[#0D9488] flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-[#0f172a]">
                          {DOC_LABELS[key] || key}
                        </div>
                        <div className="text-[9px] font-mono text-[#94a3b8] truncate">{cid}</div>
                      </div>
                      <button
                        onClick={() => onPreview(key, cid)}
                        className="text-[10px] text-[#0D9488] hover:text-[#0B7C72] font-medium inline-flex items-center gap-0.5"
                      >
                        <Eye className="h-3 w-3" /> View
                      </button>
                      <a
                        href={ipfsUrl(cid)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-[#64748b] hover:text-[#0f172a] inline-flex items-center gap-0.5"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            );
          })()}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[#e2e8f0] bg-[#f8fafc]">
          <div className="text-[10px] text-[#94a3b8]">
            App #{app.applicationId} · {shortenAddr(app.applicant)}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onReject}
              className="px-3 py-[6px] bg-[#FCEBEB] text-[#791F1F] text-[11px] font-medium rounded-[7px] hover:bg-[#f9d5d5]"
            >
              Reject
            </button>
            <button
              onClick={onApprove}
              className="px-4 py-[6px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72]"
            >
              Approve
            </button>
          </div>
        </div>
      </div>

      {previewDoc && (
        <div
          className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
          onClick={onClosePreview}
        >
          <div
            className="bg-white rounded-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-[#e2e8f0]">
              <div className="text-[12px] font-medium text-[#0f172a]">
                {DOC_LABELS[previewDoc.key] || previewDoc.key}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={ipfsUrl(previewDoc.cid)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#0D9488] hover:underline inline-flex items-center gap-0.5"
                >
                  Open in new tab <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  onClick={onClosePreview}
                  className="p-1 rounded-md hover:bg-[#f1f5f9] text-[#64748b]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <iframe
              src={ipfsUrl(previewDoc.cid)}
              title={previewDoc.key}
              className="flex-1 w-full bg-[#f8fafc]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
