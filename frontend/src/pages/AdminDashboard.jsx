import { useState } from "react";
import { Stethoscope, ScrollText, Receipt, Heart, LogOut, ShieldCheck, AlertTriangle, History } from "lucide-react";
import useWallet from "@/hooks/useWallet";
import useRoleGuard from "@/hooks/useRoleGuard";

import DoctorsTab from "@/components/admin/DoctorsTab";
import HistoryTab from "@/components/admin/HistoryTab";
import AuditTab from "@/components/admin/AuditTab";
import BillingAdminTab from "@/components/admin/BillingAdminTab";
import OrganWaitlistTab from "@/components/admin/OrganWaitlistTab";

const TABS = [
  { id: "doctors", label: "Doctors", icon: Stethoscope },
  { id: "history", label: "History", icon: History },
  { id: "audit", label: "Audit log", icon: ScrollText },
  { id: "billing", label: "Billing", icon: Receipt },
  { id: "organ", label: "Organ waitlist", icon: Heart },
];

const TAB_COMPONENTS = {
  doctors: DoctorsTab,
  history: HistoryTab,
  audit: AuditTab,
  billing: BillingAdminTab,
  organ: OrganWaitlistTab,
};

export default function AdminDashboard() {
  const { walletAddress, isConnected, isCorrectNetwork, disconnect, switchToSepolia } = useWallet();
  const { verified, checking } = useRoleGuard("admin");
  const [activeTab, setActiveTab] = useState("doctors");

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Verifying admin privileges on-chain...
      </div>
    );
  }
  if (!verified) return null;

  const ActiveComponent = TAB_COMPONENTS[activeTab];
  const initials = walletAddress ? walletAddress.slice(2, 4).toUpperCase() : "??";

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
            <div className="w-9 h-9 bg-[#854F0B] rounded-full flex items-center justify-center text-[13px] font-medium text-white flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">System admin</div>
              <div className="text-[10px] text-[#64748b] font-mono truncate">
                {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : ""}
              </div>
            </div>
          </div>
          <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#FAEEDA] text-[#633806]">
            Super admin
          </span>
        </div>

        <div className="text-[10px] text-[#94a3b8] font-medium mb-1.5 px-[10px]">Navigation</div>

        <nav className="flex flex-col gap-[2px]">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-[9px] px-[10px] py-2 rounded-lg text-[13px] text-left transition-colors ${
                activeTab === id
                  ? "bg-[#E1F5EE] text-[#085041] font-medium"
                  : "text-[#64748b] hover:bg-[#f8fafc]"
              }`}
            >
              <Icon className="h-[15px] w-[15px]" />
              {label}
            </button>
          ))}
        </nav>

        {/* System health */}
        <div className="mt-auto pt-4 border-t border-[#e2e8f0]">
          <div className="text-[11px] font-medium text-[#64748b] mb-2">System health</div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[#94a3b8]">Active contracts</span>
              <span className="text-[#0D9488] font-medium">5 / 5</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[#94a3b8]">IPFS nodes</span>
              <span className="text-[#0D9488] font-medium">12 online</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-[#94a3b8]">Pending verifications</span>
              <span className="text-[#854F0B] font-medium">3 doctors</span>
            </div>
          </div>
          <button
            onClick={disconnect}
            className="mt-3 flex items-center gap-1 text-[10px] text-[#64748b] hover:text-[#ef4444] transition-colors"
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
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-[9px] text-[13px] border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === id
                    ? "text-[#0D9488] border-[#0D9488] font-medium"
                    : "text-[#64748b] border-transparent hover:text-[#334155]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="py-3 text-[11px] text-[#64748b]">Admin portal</div>
        </div>

        {isConnected && !isCorrectNetwork && (
          <div className="mx-5 mt-4 flex items-center gap-2 p-3 bg-[#FAEEDA] border border-[#FAC775] rounded-lg">
            <AlertTriangle className="h-4 w-4 text-[#854F0B]" />
            <span className="text-xs text-[#633806] font-medium">Wrong network.</span>
            <button onClick={switchToSepolia} className="text-xs text-[#0D9488] font-medium hover:underline">Switch</button>
          </div>
        )}

        <div className="p-5 flex-1 bg-[#f8fafc]">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
