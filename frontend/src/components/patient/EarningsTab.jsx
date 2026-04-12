import { useState, useEffect, useCallback } from "react";
import { Coins, TrendingUp, Database, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { ethers } from "ethers";

export default function EarningsTab() {
  const { walletAddress } = useWallet();
  const mediToken = useContract("MEDIToken");

  const [balance, setBalance] = useState("0");
  const [marketplaceOptIn, setMarketplaceOptIn] = useState(false);
  const [loading, setLoading] = useState(false);

  // Demo earnings history
  const [earnings] = useState([
    { id: 1, desc: "Compliance reward — January", date: "15 Jan 2025", amount: "+80.00", txHash: "0x3a1b2c..." },
    { id: 2, desc: "Dataset purchase — anonymized blood panel", date: "12 Jan 2025", amount: "+245.50", txHash: "0x5c9e4f..." },
    { id: 3, desc: "Compliance reward — December", date: "15 Dec 2024", amount: "+80.00", txHash: "0x9e7d3a..." },
  ]);

  const loadBalance = useCallback(async () => {
    if (!mediToken || !walletAddress) return;
    setLoading(true);
    try {
      const raw = await mediToken.balanceOf(walletAddress);
      setBalance(ethers.formatEther(raw));
    } catch (err) {
      console.error("Failed to load MEDI balance:", err);
    } finally {
      setLoading(false);
    }
  }, [mediToken, walletAddress]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  // Load marketplace opt-in from localStorage
  useEffect(() => {
    if (!walletAddress) return;
    const saved = localStorage.getItem(`medivault-marketplace-${walletAddress}`);
    if (saved) setMarketplaceOptIn(JSON.parse(saved));
  }, [walletAddress]);

  const toggleMarketplace = () => {
    const next = !marketplaceOptIn;
    setMarketplaceOptIn(next);
    if (walletAddress) {
      localStorage.setItem(`medivault-marketplace-${walletAddress}`, JSON.stringify(next));
    }
    toast.success(next ? "Opted in to data marketplace" : "Opted out of data marketplace");
  };

  const balanceNum = parseFloat(balance);
  const usdEstimate = (balanceNum * 0.0218).toFixed(2); // Mock rate

  return (
    <div>
      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="flex items-center gap-2 text-[11px] text-[#64748b] mb-2">
            <Coins className="h-3.5 w-3.5" />
            MEDI balance
          </div>
          <div className="text-[22px] font-medium text-[#0D9488]">
            {loading ? "..." : Number(balanceNum).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-[#94a3b8]">≈ ${usdEstimate} USD</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="flex items-center gap-2 text-[11px] text-[#64748b] mb-2">
            <TrendingUp className="h-3.5 w-3.5" />
            Compliance rewards
          </div>
          <div className="text-[22px] font-medium text-[#0D9488]">+320.00</div>
          <div className="text-[10px] text-[#94a3b8]">All time</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="flex items-center gap-2 text-[11px] text-[#64748b] mb-2">
            <Database className="h-3.5 w-3.5" />
            Data earnings
          </div>
          <div className="text-[22px] font-medium text-[#0D9488]">+522.50</div>
          <div className="text-[10px] text-[#94a3b8]">Data marketplace</div>
        </div>
      </div>

      {/* Data marketplace opt-in */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-medium mb-1">Data marketplace</div>
            <div className="text-[11px] text-[#64748b]">
              Share anonymized records with researchers for MEDI rewards
            </div>
          </div>
          <button
            onClick={toggleMarketplace}
            className={`w-9 h-5 rounded-full transition-colors relative flex-shrink-0 ${
              marketplaceOptIn ? "bg-[#0D9488]" : "bg-[#cbd5e1]"
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                marketplaceOptIn ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Earnings history */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-3">Earnings history</div>
        <div className="flex flex-col gap-2">
          {earnings.map((e) => (
            <div key={e.id} className="flex items-center gap-[10px] px-[10px] py-2 border-b border-[#e2e8f0] last:border-0">
              <div className="w-7 h-7 bg-[#E1F5EE] rounded-full flex items-center justify-center flex-shrink-0">
                <Coins className="h-3.5 w-3.5 text-[#085041]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{e.desc}</div>
                <div className="text-[11px] text-[#64748b]">
                  {e.date}
                  {" · "}
                  <a
                    href={`https://sepolia.etherscan.io/tx/${e.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#0D9488] hover:underline inline-flex items-center gap-0.5"
                  >
                    Tx <ExternalLink className="h-[9px] w-[9px]" />
                  </a>
                </div>
              </div>
              <div className="text-[13px] font-medium text-[#0D9488]">{e.amount}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
