import { useState } from "react";
import {
  FileText,
  UserPlus,
  Pill,
  Heart,
  Clock,
  BarChart3,
  Receipt,
  Wallet,
  LogOut,
  AlertTriangle,
} from "lucide-react";
import useWallet from "@/hooks/useWallet";
import useRoleGuard from "@/hooks/useRoleGuard";

import RecordsTab from "@/components/patient/RecordsTab";
import AccessTab from "@/components/patient/AccessTab";
import PrescriptionsTab from "@/components/patient/PrescriptionsTab";
import EmergencyTab from "@/components/patient/EmergencyTab";
import EarningsTab from "@/components/patient/EarningsTab";
import ComplianceTab from "@/components/patient/ComplianceTab";
import BillingTab from "@/components/patient/BillingTab";

const TABS = [
  { id: "records", label: "Records", icon: FileText },
  { id: "access", label: "Access", icon: UserPlus },
  { id: "prescriptions", label: "Prescriptions", icon: Pill },
  { id: "emergency", label: "Emergency", icon: Heart },
  { id: "earnings", label: "Earnings", icon: Clock },
  { id: "compliance", label: "Compliance", icon: BarChart3 },
  { id: "billing", label: "Billing", icon: Receipt },
];

const TAB_COMPONENTS = {
  records: RecordsTab,
  access: AccessTab,
  prescriptions: PrescriptionsTab,
  emergency: EmergencyTab,
  earnings: EarningsTab,
  compliance: ComplianceTab,
  billing: BillingTab,
};

export default function PatientDashboard() {
  const { walletAddress, isConnected, isCorrectNetwork, connect, disconnect, switchToSepolia } = useWallet();
  const { verified, checking, timedOut, retry } = useRoleGuard("patient");
  const [activeTab, setActiveTab] = useState("records");

  if (timedOut) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8fafc] gap-4 p-8">
        <AlertTriangle className="h-10 w-10 text-[#854F0B]" />
        <div className="text-center">
          <div className="text-sm font-medium mb-1">Role check timed out</div>
          <div className="text-xs text-[#64748b] max-w-md">
            The RoleManager contract didn't respond within 5 seconds. Check that your
            Hardhat node is running and MetaMask is on the correct network.
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={retry} className="px-4 py-2 bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72]">
            Retry
          </button>
          <button onClick={disconnect} className="px-4 py-2 border border-[#cbd5e1] text-xs rounded-[7px] hover:bg-[#f1f5f9]">
            Disconnect
          </button>
        </div>
      </div>
    );
  }
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Verifying role on-chain...
      </div>
    );
  }
  if (!verified) return null;

  const ActiveComponent = TAB_COMPONENTS[activeTab];
  const initials = walletAddress
    ? walletAddress.slice(2, 4).toUpperCase()
    : "??";

  return (
    <div className="flex min-h-screen" style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* ── Sidebar ── */}
      <aside className="w-[220px] flex-shrink-0 bg-white border-r border-[#e2e8f0] p-5 flex flex-col">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-6 h-6 bg-[#0D9488] rounded-md flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">M</span>
          </div>
          <span className="text-sm font-medium">MediVault</span>
        </div>

        {/* User card */}
        <div className="bg-[#f8fafc] rounded-[10px] p-[10px] mb-5 flex items-center gap-[9px]">
          <div className="w-9 h-9 bg-[#0D9488] rounded-full flex items-center justify-center text-[13px] font-medium text-white flex-shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-medium truncate">Patient</div>
            <div className="text-[10px] text-[#64748b] font-mono truncate">
              {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : ""}
            </div>
          </div>
        </div>

        {/* Nav label */}
        <div className="text-[10px] text-[#94a3b8] font-medium mb-1.5 px-[10px]">Navigation</div>

        {/* Nav items */}
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

        {/* Footer */}
        <div className="mt-auto pt-4 border-t border-[#e2e8f0]">
          <div className="flex items-center gap-[7px]">
            <span className={`w-[7px] h-[7px] rounded-full block flex-shrink-0 ${isConnected ? "bg-[#10B981]" : "bg-[#ef4444]"}`} />
            <span className="text-[11px] text-[#64748b]">
              {isConnected ? "MetaMask connected" : "Not connected"}
            </span>
          </div>
          {isConnected && (
            <div className="text-[10px] text-[#94a3b8] mt-1">
              {isCorrectNetwork ? "Local testnet" : "Wrong network"} · Gas: ~0 gwei
            </div>
          )}
          <button
            onClick={disconnect}
            className="mt-2 flex items-center gap-1 text-[10px] text-[#64748b] hover:text-[#ef4444] transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Disconnect
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
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
          <div className="py-3 text-[11px] text-[#64748b]">Patient portal</div>
        </div>

        {/* Wrong network warning */}
        {isConnected && !isCorrectNetwork && (
          <div className="mx-5 mt-4 flex items-center gap-2 p-3 bg-[#FAEEDA] border border-[#FAC775] rounded-lg">
            <AlertTriangle className="h-4 w-4 text-[#854F0B]" />
            <span className="text-xs text-[#633806] font-medium">
              Wrong network detected.
            </span>
            <button
              onClick={switchToSepolia}
              className="text-xs text-[#0D9488] font-medium hover:underline"
            >
              Switch network
            </button>
          </div>
        )}

        {/* Active panel */}
        <div className="p-5 flex-1 bg-[#f8fafc]">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
