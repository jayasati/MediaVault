import { useState, useEffect, useCallback } from "react";
import { Shield, UserPlus, UserMinus, ShieldCheck, ExternalLink, LogOut, AlertTriangle, Clock } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useRoleGuard from "@/hooks/useRoleGuard";
import useContract from "@/hooks/useContract";
import { ethers } from "ethers";

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function SuperAdminDashboard() {
  const { walletAddress, isConnected, disconnect } = useWallet();
  const { verified, checking } = useRoleGuard("super_admin");
  const roleManager = useContract("RoleManager");

  const [addAddr, setAddAddr] = useState("");
  const [addHospital, setAddHospital] = useState("");
  const [adding, setAdding] = useState(false);
  const [admins, setAdmins] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Load admin events
  const loadAdmins = useCallback(async () => {
    if (!roleManager) return;
    setLoadingAdmins(true);
    try {
      const addFilter = roleManager.filters.AdminAdded();
      const removeFilter = roleManager.filters.AdminRemoved();
      const addEvents = await roleManager.queryFilter(addFilter, 0, "latest");
      const removeEvents = await roleManager.queryFilter(removeFilter, 0, "latest");

      const removedSet = new Set(removeEvents.map((e) => e.args[0].toLowerCase()));
      const adminList = [];

      for (const evt of addEvents) {
        const addr = evt.args[0];
        if (!removedSet.has(addr.toLowerCase())) {
          const details = await roleManager.getUserDetails(addr);
          if (Number(details.role) === 4) {
            adminList.push({
              address: addr,
              hospitalId: details.hospitalId,
              registeredAt: Number(details.registeredAt),
              txHash: evt.transactionHash,
            });
          }
        }
      }
      setAdmins(adminList);
    } catch (err) {
      console.error("Failed to load admins:", err);
    } finally {
      setLoadingAdmins(false);
    }
  }, [roleManager]);

  useEffect(() => {
    if (verified) loadAdmins();
  }, [verified, loadAdmins]);

  const handleAddAdmin = async () => {
    if (!roleManager || !addAddr || !addHospital) {
      toast.error("Fill wallet address and hospital");
      return;
    }
    if (!ethers.isAddress(addAddr)) {
      toast.error("Invalid wallet address");
      return;
    }
    setAdding(true);
    const tid = toast.loading("Adding hospital admin on-chain...");
    try {
      // Hash hospital name to bytes32 — same format doctors use when applying
      const hospitalId = ethers.keccak256(ethers.toUtf8Bytes(addHospital.trim().toLowerCase()));
      const tx = await roleManager.addAdmin(addAddr, hospitalId);
      await tx.wait();
      toast.success(`${shortenAddr(addAddr)} is now admin for ${addHospital}`, { id: tid });
      setAddAddr("");
      setAddHospital("");
      loadAdmins();
    } catch (err) {
      toast.error(err.reason || "Failed to add admin", { id: tid });
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveAdmin = async (addr) => {
    if (!roleManager) return;
    const tid = toast.loading("Removing admin...");
    try {
      const tx = await roleManager.removeAdmin(addr);
      await tx.wait();
      toast.success(`${shortenAddr(addr)} removed from admin`, { id: tid });
      loadAdmins();
    } catch (err) {
      toast.error(err.reason || "Failed to remove admin", { id: tid });
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Verifying super admin privileges on-chain...
      </div>
    );
  }
  if (!verified) return null;

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
            Super Admin
          </span>
        </div>

        <div className="text-[10px] text-[#94a3b8] font-medium mb-1.5 px-[10px]">Responsibilities</div>
        <div className="text-[11px] text-[#64748b] px-[10px] leading-relaxed mb-4">
          Manage hospital admins. Admins manage doctors and researchers. You cannot directly approve doctors.
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
            <div className="px-4 py-[9px] text-[13px] border-b-2 text-[#0D9488] border-[#0D9488] font-medium">
              Hospital Admins
            </div>
          </div>
          <div className="py-3 text-[11px] text-[#64748b]">Super admin portal</div>
        </div>

        <div className="p-5 flex-1 bg-[#f8fafc]">
          {/* Info banner */}
          <div className="flex items-center gap-2 p-[10px] px-[14px] bg-[#E6F1FB] border border-[#93c5fd] rounded-[9px] mb-4">
            <ShieldCheck className="h-4 w-4 text-[#0C447C] flex-shrink-0" />
            <div className="text-[12px] text-[#0C447C]">
              <span className="font-medium">Role hierarchy:</span> Super Admin → adds Hospital Admins → Admins approve Doctors & Researchers → Patients self-register.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4">
            {/* Add admin form */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
              <div className="text-[13px] font-medium mb-1 flex items-center gap-1.5">
                <UserPlus className="h-3.5 w-3.5 text-[#0D9488]" />
                Add Hospital Admin
              </div>
              <div className="text-[10px] text-[#94a3b8] mb-3">
                Hospital heads who can approve doctors and researchers
              </div>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={addAddr}
                  onChange={(e) => setAddAddr(e.target.value)}
                  placeholder="Wallet address (0x…)"
                  className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                />
                <input
                  type="text"
                  value={addHospital}
                  onChange={(e) => setAddHospital(e.target.value)}
                  placeholder="Hospital identifier (e.g. apollo-bangalore)"
                  className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                />
                <div className="text-[10px] text-[#94a3b8]">
                  Doctors applying to this hospital must use the same identifier. Case-insensitive.
                </div>
                <button
                  onClick={handleAddAdmin}
                  disabled={adding || !addAddr || !addHospital}
                  className="px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
                >
                  {adding ? "Adding..." : "Add Admin"}
                </button>
              </div>
            </div>

            {/* Current admins list */}
            <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
              <div className="text-xs font-medium text-[#64748b] mb-3">
                Active Hospital Admins — {admins.length}
              </div>

              {loadingAdmins && (
                <div className="flex items-center justify-center py-6 gap-2 text-[11px] text-[#64748b]">
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
                  Loading...
                </div>
              )}

              {!loadingAdmins && admins.length === 0 && (
                <div className="text-[13px] text-[#94a3b8] py-6 text-center">
                  No hospital admins yet. Add one to start approving doctors.
                </div>
              )}

              <div className="flex flex-col gap-2">
                {admins.map((admin) => (
                  <div key={admin.address} className="flex items-center gap-[10px] p-[10px] bg-[#f8fafc] rounded-lg">
                    <div className="w-7 h-7 bg-[#FAEEDA] rounded-full flex items-center justify-center text-[10px] font-medium text-[#633806] flex-shrink-0">
                      {admin.address.slice(2, 4).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono font-medium">{shortenAddr(admin.address)}</div>
                      <div className="text-[10px] text-[#64748b]">
                        Hospital: <span className="font-mono">{admin.hospitalId.slice(0, 10)}…</span>
                      </div>
                      <div className="text-[10px] text-[#64748b]">
                        Added {new Date(admin.registeredAt * 1000).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                        {admin.txHash && (
                          <>
                            {" · "}
                            <a
                              href={`https://sepolia.etherscan.io/tx/${admin.txHash}`}
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
                    <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#FAEEDA] text-[#633806]">
                      Hospital Admin
                    </span>
                    <button
                      onClick={() => handleRemoveAdmin(admin.address)}
                      className="px-2 py-[4px] bg-[#FCEBEB] text-[#791F1F] text-[10px] rounded-[6px] hover:bg-[#f9d5d5] flex items-center gap-1"
                    >
                      <UserMinus className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
