import { useState } from "react";
import { Search, ShoppingBag, Wallet, LogOut, FlaskConical, AlertTriangle } from "lucide-react";
import useWallet from "@/hooks/useWallet";
import useRoleGuard from "@/hooks/useRoleGuard";

import BrowseTab from "@/components/researcher/BrowseTab";
import PurchasedTab from "@/components/researcher/PurchasedTab";
import WalletTab from "@/components/researcher/WalletTab";

const TABS = [
  { id: "browse", label: "Browse", icon: Search },
  { id: "purchased", label: "Purchased", icon: ShoppingBag },
  { id: "wallet", label: "Wallet", icon: Wallet },
];

const TAB_COMPONENTS = {
  browse: BrowseTab,
  purchased: PurchasedTab,
  wallet: WalletTab,
};

export default function ResearcherDashboard() {
  const { walletAddress, isConnected, isCorrectNetwork, disconnect, switchToSepolia } = useWallet();
  const { verified, checking } = useRoleGuard("researcher");
  const [activeTab, setActiveTab] = useState("browse");

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Verifying researcher access on-chain...
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
            <div className="w-9 h-9 bg-[#3C3489] rounded-full flex items-center justify-center text-[13px] font-medium text-white flex-shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">Researcher</div>
              <div className="text-[10px] text-[#64748b] font-mono truncate">
                {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : ""}
              </div>
            </div>
          </div>
          <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#EEEDFE] text-[#3C3489] inline-flex items-center gap-1">
            <FlaskConical className="h-3 w-3" />
            Researcher
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

        <div className="mt-auto pt-4 border-t border-[#e2e8f0]">
          <div className="flex items-center gap-[7px]">
            <span className={`w-[7px] h-[7px] rounded-full block flex-shrink-0 ${isConnected ? "bg-[#10B981]" : "bg-[#ef4444]"}`} />
            <span className="text-[11px] text-[#64748b]">Wallet connected</span>
          </div>
          <div className="text-[10px] text-[#94a3b8] mt-1 font-mono">
            {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : ""}
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
          <div className="py-3 text-[11px] text-[#64748b]">Research portal</div>
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
