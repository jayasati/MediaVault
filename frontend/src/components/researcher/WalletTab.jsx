import { useState, useEffect, useCallback } from "react";
import { Coins, ExternalLink, ArrowUpRight, ShoppingCart } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { ethers } from "ethers";

export default function WalletTab() {
  const { walletAddress } = useWallet();
  const mediToken = useContract("MEDIToken");

  const [balance, setBalance] = useState("0");
  const [loading, setLoading] = useState(false);

  const loadBalance = useCallback(async () => {
    if (!mediToken || !walletAddress) return;
    setLoading(true);
    try {
      const raw = await mediToken.balanceOf(walletAddress);
      setBalance(ethers.formatEther(raw));
    } catch (err) {
      console.error("Failed to load balance:", err);
    } finally {
      setLoading(false);
    }
  }, [mediToken, walletAddress]);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  const balNum = parseFloat(balance);

  // Demo tx history
  const txHistory = [
    { id: 1, type: "Purchase", desc: "Blood panel dataset", amount: "-10 MEDI", date: "10 Jan 2025", txHash: "0x7a2f…" },
    { id: 2, type: "Purchase", desc: "Cardiac history dataset", amount: "-25 MEDI", date: "8 Jan 2025", txHash: "0x3b9c…" },
    { id: 3, type: "Purchase", desc: "Diabetes panel dataset", amount: "-15 MEDI", date: "5 Jan 2025", txHash: "0x9e7d…" },
    { id: 4, type: "Received", desc: "Token purchase (Uniswap)", amount: "+500 MEDI", date: "1 Jan 2025", txHash: "0x1a4b…" },
  ];

  return (
    <div>
      {/* Balance card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="flex items-center gap-2 text-[11px] text-[#64748b] mb-2">
            <Coins className="h-3.5 w-3.5" />
            MEDI Balance
          </div>
          <div className="text-[22px] font-medium text-[#0D9488]">
            {loading ? "..." : balNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-[#94a3b8]">≈ ${(balNum * 0.0218).toFixed(2)} USD</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="flex items-center gap-2 text-[11px] text-[#64748b] mb-2">
            <ShoppingCart className="h-3.5 w-3.5" />
            Total spent
          </div>
          <div className="text-[22px] font-medium">50 MEDI</div>
          <div className="text-[10px] text-[#94a3b8]">3 datasets purchased</div>
        </div>

        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col justify-between">
          <div className="text-[11px] text-[#64748b] mb-2">Get more MEDI</div>
          <a
            href="https://app.uniswap.org"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-4 py-[7px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72]"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            Buy on Uniswap (Testnet)
          </a>
          <div className="text-[9px] text-[#94a3b8] mt-1 text-center">Sepolia testnet only</div>
        </div>
      </div>

      {/* Transaction history */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e2e8f0]">
          <div className="text-xs font-medium text-[#64748b]">Transaction history</div>
        </div>
        <div className="grid grid-cols-[1fr_120px_100px_100px] gap-2 px-5 py-2 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <div className="text-[10px] font-medium text-[#94a3b8]">Description</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Date</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Amount</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Tx</div>
        </div>
        {txHistory.map((tx) => (
          <div key={tx.id} className="grid grid-cols-[1fr_120px_100px_100px] gap-2 px-5 py-[10px] border-b border-[#e2e8f0] last:border-0 items-center">
            <div>
              <div className="text-xs font-medium">{tx.desc}</div>
              <span className={`text-[9px] px-1.5 py-[1px] rounded font-medium ${
                tx.type === "Purchase" ? "bg-[#FAEEDA] text-[#633806]" : "bg-[#E1F5EE] text-[#085041]"
              }`}>{tx.type}</span>
            </div>
            <div className="text-[11px] text-[#64748b]">{tx.date}</div>
            <div className={`text-[11px] font-medium ${tx.amount.startsWith("+") ? "text-[#0D9488]" : "text-[#64748b]"}`}>
              {tx.amount}
            </div>
            <a href="#" className="text-[10px] text-[#0D9488] hover:underline inline-flex items-center gap-0.5">
              {tx.txHash} <ExternalLink className="h-[9px] w-[9px]" />
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
