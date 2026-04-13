import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  UserMinus,
  ShieldCheck,
  ExternalLink,
  LogOut,
  AlertTriangle,
  Building2,
  FileCheck2,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useRoleGuard from "@/hooks/useRoleGuard";
import useContract from "@/hooks/useContract";

const IPFS_GATEWAY = import.meta.env.VITE_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

function ipfsUrl(cid) {
  if (!cid) return "#";
  const cleaned = cid.replace(/^ipfs:\/\//, "").replace(/^\/ipfs\//, "");
  const base = IPFS_GATEWAY.endsWith("/") ? IPFS_GATEWAY : `${IPFS_GATEWAY}/`;
  return `${base}${cleaned}`;
}

function errMsg(err, fallback) {
  return err?.reason || err?.shortMessage || err?.message || fallback;
}

const TABS = [
  { id: "pending", label: "Pending Applications", icon: FileCheck2 },
  { id: "hospitals", label: "Registered Hospitals", icon: Building2 },
  { id: "admins", label: "Active Admins", icon: Shield },
];

export default function SuperAdminDashboard() {
  const { walletAddress, disconnect } = useWallet();
  const { verified, checking, timedOut, retry } = useRoleGuard("super_admin");
  const roleManager = useContract("RoleManager");

  const [tab, setTab] = useState("pending");
  const [pending, setPending] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(false);

  const [busyId, setBusyId] = useState(null);
  const [rejectModal, setRejectModal] = useState(null); // applicationId or null
  const [rejectReason, setRejectReason] = useState("");
  const [detailApp, setDetailApp] = useState(null); // full application object or null

  // ── Loaders ──────────────────────────────────────────────

  const loadPending = useCallback(async () => {
    if (!roleManager) return;
    try {
      const ids = await roleManager.getPendingHospitalApplications();
      const apps = await Promise.all(
        ids.map(async (id) => {
          const a = await roleManager.getHospitalApplication(id);
          return {
            id: Number(a.applicationId),
            applicant: a.applicant,
            hospitalId: a.hospitalId,
            name: a.name,
            city: a.city,
            stateName: a.stateName,
            registrationNumber: a.registrationNumber,
            documentsIPFS: a.documentsIPFS,
            adminName: a.adminName,
            appliedAt: Number(a.appliedAt),
          };
        })
      );
      setPending(apps);
    } catch (err) {
      console.error("Failed to load pending hospital applications:", err);
    }
  }, [roleManager]);

  const loadHospitals = useCallback(async () => {
    if (!roleManager) return;
    try {
      const list = await roleManager.getAllHospitals();
      setHospitals(
        list.map((h) => ({
          hospitalId: h.hospitalId,
          name: h.name,
          city: h.city,
          stateName: h.stateName,
          registrationNumber: h.registrationNumber,
          documentsIPFS: h.documentsIPFS,
          currentAdmin: h.currentAdmin,
          active: h.active,
          approvedAt: Number(h.approvedAt),
        }))
      );
    } catch (err) {
      console.error("Failed to load hospitals:", err);
    }
  }, [roleManager]);

  const loadAdmins = useCallback(async () => {
    if (!roleManager) return;
    try {
      const addFilter = roleManager.filters.AdminAdded();
      const removeFilter = roleManager.filters.AdminRemoved();
      const addEvents = await roleManager.queryFilter(addFilter, 0, "latest");
      const removeEvents = await roleManager.queryFilter(removeFilter, 0, "latest");

      // Last-event-wins per address (handles re-add scenarios)
      const status = new Map();
      for (const evt of addEvents) status.set(evt.args[0].toLowerCase(), { added: evt, removed: null });
      for (const evt of removeEvents) {
        const k = evt.args[0].toLowerCase();
        if (status.has(k)) status.get(k).removed = evt;
      }

      const list = [];
      for (const [, { added, removed }] of status) {
        if (removed && removed.blockNumber > added.blockNumber) continue;
        const addr = added.args[0];
        const details = await roleManager.getUserDetails(addr);
        if (Number(details.role) === 4) {
          list.push({
            address: addr,
            displayName: details.displayName,
            hospitalId: details.hospitalId,
            registeredAt: Number(details.registeredAt),
            txHash: added.transactionHash,
          });
        }
      }
      setAdmins(list);
    } catch (err) {
      console.error("Failed to load admins:", err);
    }
  }, [roleManager]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadPending(), loadHospitals(), loadAdmins()]);
    setLoading(false);
  }, [loadPending, loadHospitals, loadAdmins]);

  useEffect(() => {
    if (verified) refreshAll();
  }, [verified, refreshAll]);

  // ── Actions ──────────────────────────────────────────────

  const handleApprove = async (applicationId) => {
    if (!roleManager) return;
    setBusyId(applicationId);
    const tid = toast.loading("Approving hospital on-chain...");
    try {
      const tx = await roleManager.approveHospital(applicationId);
      await tx.wait();
      toast.success("Hospital approved and admin onboarded", { id: tid });
      setDetailApp(null);
      await refreshAll();
    } catch (err) {
      toast.error(errMsg(err, "Approval failed"), { id: tid });
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (applicationId) => {
    setRejectModal(applicationId);
    setRejectReason("");
  };

  const submitReject = async () => {
    if (!roleManager || !rejectModal) return;
    if (!rejectReason.trim()) {
      toast.error("Provide a rejection reason");
      return;
    }
    setBusyId(rejectModal);
    const tid = toast.loading("Rejecting application...");
    try {
      const tx = await roleManager.rejectHospital(rejectModal, rejectReason.trim());
      await tx.wait();
      toast.success("Application rejected", { id: tid });
      setRejectModal(null);
      setRejectReason("");
      setDetailApp(null);
      await refreshAll();
    } catch (err) {
      toast.error(errMsg(err, "Rejection failed"), { id: tid });
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveAdmin = async (addr) => {
    if (!roleManager) return;
    const tid = toast.loading("Removing admin...");
    try {
      const tx = await roleManager.removeAdmin(addr);
      await tx.wait();
      toast.success(`${shortenAddr(addr)} removed`, { id: tid });
      await refreshAll();
    } catch (err) {
      toast.error(errMsg(err, "Failed to remove admin"), { id: tid });
    }
  };

  // ── Guards ───────────────────────────────────────────────

  if (timedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] gap-4 p-8">
        <AlertTriangle className="h-10 w-10 text-[#854F0B]" />
        <div className="text-center">
          <div className="text-sm font-medium mb-1">Role check timed out</div>
          <div className="text-xs text-[#64748b] max-w-md">The contract didn't respond within 5 seconds.</div>
        </div>
        <div className="flex gap-2">
          <button onClick={retry} className="px-4 py-2 bg-[#0D9488] text-white text-xs font-medium rounded-[7px]">Retry</button>
          <button onClick={disconnect} className="px-4 py-2 border border-[#cbd5e1] text-xs rounded-[7px]">Disconnect</button>
        </div>
      </div>
    );
  }
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Verifying super admin privileges on-chain...
      </div>
    );
  }
  if (!verified) return null;

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 bg-white border-r border-[#e2e8f0] p-5 flex flex-col">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-6 h-6 bg-[#0D9488] rounded-md flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">M</span>
          </div>
          <span className="text-sm font-medium">MediVault</span>
        </div>

        <div className="bg-[#f8fafc] rounded-[10px] p-[10px] mb-5">
          <div className="flex items-center gap-[9px] mb-2">
            <div className="w-9 h-9 bg-[#dc2626] rounded-full flex items-center justify-center text-[13px] font-medium text-white flex-shrink-0">
              SA
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">Super Admin</div>
              <div className="text-[10px] text-[#64748b] font-mono truncate">
                {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : ""}
              </div>
            </div>
          </div>
          <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#FCEBEB] text-[#791F1F] inline-flex items-center gap-1">
            <Shield className="h-3 w-3" />
            National Authority
          </span>
        </div>

        <div className="text-[10px] text-[#94a3b8] font-medium mb-1.5 px-[10px]">Responsibilities</div>
        <div className="text-[11px] text-[#64748b] px-[10px] leading-relaxed mb-4">
          Onboard hospitals to the MediVault network. Each approved application creates a Hospital record and grants the applicant the ADMIN role.
        </div>

        <div className="mt-auto pt-4 border-t border-[#e2e8f0]">
          <div className="flex items-center gap-[7px]">
            <span className="w-[7px] h-[7px] rounded-full block flex-shrink-0 bg-[#10B981]" />
            <span className="text-[11px] text-[#64748b]">Contract deployer</span>
          </div>
          <button
            onClick={disconnect}
            className="mt-2 flex items-center gap-1 text-[10px] text-[#64748b] hover:text-[#ef4444] transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Disconnect
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b border-[#e2e8f0] px-5 flex items-center justify-between">
          <div className="flex">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-4 py-[9px] text-[13px] border-b-2 font-medium flex items-center gap-1.5 ${
                    active ? "text-[#0D9488] border-[#0D9488]" : "text-[#64748b] border-transparent hover:text-[#334155]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                  {t.id === "pending" && pending.length > 0 && (
                    <span className="ml-1 text-[9px] bg-[#0D9488] text-white px-[6px] py-[1px] rounded-full">
                      {pending.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="py-3 text-[11px] text-[#64748b]">National medical authority</div>
        </div>

        <div className="p-5 flex-1 bg-[#f8fafc]">
          <div className="flex items-center gap-2 p-[10px] px-[14px] bg-[#E6F1FB] border border-[#93c5fd] rounded-[9px] mb-4">
            <ShieldCheck className="h-4 w-4 text-[#0C447C] flex-shrink-0" />
            <div className="text-[12px] text-[#0C447C]">
              <span className="font-medium">Role hierarchy:</span> Super Admin onboards Hospitals → each Hospital's Admin onboards Doctors & Researchers → Patients self-register.
            </div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-6 gap-2 text-[11px] text-[#64748b]">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
              Loading...
            </div>
          )}

          {/* Pending tab */}
          {tab === "pending" && !loading && (
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
              <div className="text-xs font-medium text-[#64748b] mb-3">
                Pending Hospital Applications — {pending.length}
              </div>
              {pending.length === 0 && (
                <div className="text-[13px] text-[#94a3b8] py-6 text-center">
                  No pending applications.
                </div>
              )}
              <div className="flex flex-col gap-3">
                {pending.map((app) => (
                  <div
                    key={app.id}
                    onClick={() => setDetailApp(app)}
                    className="border border-[#e2e8f0] rounded-lg p-[14px] cursor-pointer hover:border-[#0D9488] hover:bg-[#f0fdfa] transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium">{app.name}</div>
                        <div className="text-[11px] text-[#64748b]">
                          {app.city}, {app.stateName} · Reg #{app.registrationNumber}
                        </div>
                        <div className="text-[11px] text-[#64748b] mt-1">
                          Admin: <span className="font-medium text-[#334155]">{app.adminName}</span>
                          {" · "}
                          <span className="font-mono">{shortenAddr(app.applicant)}</span>
                        </div>
                        <div className="text-[10px] text-[#94a3b8] mt-1">
                          Applied {new Date(app.appliedAt * 1000).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                          {" · click to review"}
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleApprove(app.id)}
                          disabled={busyId === app.id}
                          className="px-3 py-[6px] bg-[#0D9488] text-white text-[11px] rounded-[6px] hover:bg-[#0B7C72] disabled:opacity-50 flex items-center gap-1"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Approve
                        </button>
                        <button
                          onClick={() => openReject(app.id)}
                          disabled={busyId === app.id}
                          className="px-3 py-[6px] bg-[#FCEBEB] text-[#791F1F] text-[11px] rounded-[6px] hover:bg-[#f9d5d5] disabled:opacity-50 flex items-center gap-1"
                        >
                          <XCircle className="h-3 w-3" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hospitals tab */}
          {tab === "hospitals" && !loading && (
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
              <div className="text-xs font-medium text-[#64748b] mb-3">
                Registered Hospitals — {hospitals.length}
              </div>
              {hospitals.length === 0 && (
                <div className="text-[13px] text-[#94a3b8] py-6 text-center">
                  No hospitals registered yet.
                </div>
              )}
              <div className="flex flex-col gap-2">
                {hospitals.map((h) => (
                  <div key={h.hospitalId} className="flex items-center gap-3 p-[10px] bg-[#f8fafc] rounded-lg">
                    <div className="w-8 h-8 bg-[#E6F1FB] rounded-md flex items-center justify-center flex-shrink-0">
                      <Building2 className="h-4 w-4 text-[#0C447C]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium">{h.name}</div>
                      <div className="text-[10px] text-[#64748b]">
                        {h.city}, {h.stateName} · Reg #{h.registrationNumber}
                      </div>
                      <div className="text-[10px] text-[#64748b]">
                        Admin: <span className="font-mono">{shortenAddr(h.currentAdmin)}</span>
                        {" · "}
                        <a
                          href={ipfsUrl(h.documentsIPFS)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0D9488] hover:underline inline-flex items-center gap-0.5"
                        >
                          Docs <ExternalLink className="h-[9px] w-[9px]" />
                        </a>
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-[2px] rounded-lg font-medium ${
                      h.active ? "bg-[#DEF7EC] text-[#03543F]" : "bg-[#E5E7EB] text-[#374151]"
                    }`}>
                      {h.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admins tab */}
          {tab === "admins" && !loading && (
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
              <div className="text-xs font-medium text-[#64748b] mb-3">
                Active Hospital Admins — {admins.length}
              </div>
              {admins.length === 0 && (
                <div className="text-[13px] text-[#94a3b8] py-6 text-center">
                  No hospital admins yet. Approve a hospital application to onboard one.
                </div>
              )}
              <div className="flex flex-col gap-2">
                {admins.map((admin) => {
                  const hospital = hospitals.find((h) => h.hospitalId === admin.hospitalId);
                  return (
                    <div key={admin.address} className="flex items-center gap-[10px] p-[10px] bg-[#f8fafc] rounded-lg">
                      <div className="w-7 h-7 bg-[#FAEEDA] rounded-full flex items-center justify-center text-[10px] font-medium text-[#633806] flex-shrink-0">
                        {(admin.displayName || admin.address.slice(2, 4)).slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">
                          {admin.displayName || "—"}
                          {hospital && <span className="text-[#64748b] font-normal"> · {hospital.name}</span>}
                        </div>
                        <div className="text-[10px] font-mono text-[#64748b]">{shortenAddr(admin.address)}</div>
                        <div className="text-[10px] text-[#64748b]">
                          Onboarded {new Date(admin.registeredAt * 1000).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveAdmin(admin.address)}
                        className="px-2 py-[4px] bg-[#FCEBEB] text-[#791F1F] text-[10px] rounded-[6px] hover:bg-[#f9d5d5] flex items-center gap-1"
                      >
                        <UserMinus className="h-3 w-3" />
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Application detail modal */}
      {detailApp && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-40 p-4"
          onClick={() => setDetailApp(null)}
        >
          <div
            className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-[#e2e8f0]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] text-[#94a3b8] font-medium uppercase tracking-wide">
                    Hospital Application #{detailApp.id}
                  </div>
                  <div className="text-[16px] font-semibold mt-0.5">{detailApp.name}</div>
                </div>
                <button
                  onClick={() => setDetailApp(null)}
                  className="text-[#94a3b8] hover:text-[#334155] text-lg leading-none px-1"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="p-5 flex flex-col gap-3">
              <div>
                <div className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-1">Location</div>
                <div className="text-[13px] text-[#334155]">{detailApp.city}, {detailApp.stateName}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-1">Registration Number</div>
                <div className="text-[13px] text-[#334155] font-mono">{detailApp.registrationNumber}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-1">Hospital Admin</div>
                <div className="text-[13px] text-[#334155] font-medium">{detailApp.adminName}</div>
                <div className="text-[11px] text-[#64748b] font-mono mt-0.5 break-all">{detailApp.applicant}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-1">Hospital ID (on-chain)</div>
                <div className="text-[10px] text-[#64748b] font-mono break-all">{detailApp.hospitalId}</div>
              </div>
              <div>
                <div className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-1">Submitted</div>
                <div className="text-[12px] text-[#334155]">
                  {new Date(detailApp.appliedAt * 1000).toLocaleString("en-IN", {
                    dateStyle: "medium", timeStyle: "short",
                  })}
                </div>
              </div>
              <div className="border border-[#e2e8f0] rounded-lg p-3 bg-[#f8fafc]">
                <div className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-1">Documents (IPFS)</div>
                <div className="text-[10px] text-[#64748b] font-mono break-all mb-2">{detailApp.documentsIPFS}</div>
                <a
                  href={ipfsUrl(detailApp.documentsIPFS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#0D9488] hover:underline inline-flex items-center gap-1"
                >
                  Open document bundle <ExternalLink className="h-3 w-3" />
                </a>
                <div className="text-[10px] text-[#94a3b8] mt-2">
                  Verify: hospital registration certificate, admin authorization letter, admin govt photo ID.
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-[#e2e8f0] flex gap-2 justify-end">
              <button
                onClick={() => openReject(detailApp.id)}
                disabled={busyId === detailApp.id}
                className="px-3 py-[7px] bg-[#FCEBEB] text-[#791F1F] text-xs rounded-[7px] hover:bg-[#f9d5d5] disabled:opacity-50 flex items-center gap-1"
              >
                <XCircle className="h-3 w-3" />
                Reject
              </button>
              <button
                onClick={() => handleApprove(detailApp.id)}
                disabled={busyId === detailApp.id}
                className="px-3 py-[7px] bg-[#0D9488] text-white text-xs rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50 flex items-center gap-1"
              >
                <CheckCircle2 className="h-3 w-3" />
                {busyId === detailApp.id ? "Approving..." : "Approve & Onboard"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject reason modal */}
      {rejectModal !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-5 w-full max-w-md">
            <div className="text-sm font-medium mb-2">Reject application #{rejectModal}</div>
            <div className="text-[11px] text-[#64748b] mb-3">
              Provide a reason. The applicant will see this and can re-apply after the cooldown.
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="e.g. Registration certificate is unreadable. Please re-upload a clear scan."
              className="w-full px-3 py-2 text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488] resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(""); }}
                className="px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] hover:bg-[#f8fafc]"
              >
                Cancel
              </button>
              <button
                onClick={submitReject}
                disabled={!rejectReason.trim() || busyId === rejectModal}
                className="px-3 py-[7px] bg-[#dc2626] text-white text-xs rounded-[7px] hover:bg-[#b91c1c] disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
