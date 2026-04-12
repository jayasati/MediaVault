import { useState, useEffect, useCallback } from "react";
import { Download, FileText, ExternalLink, Eye } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { PINATA_GATEWAY } from "@/constants/contracts";

export default function PurchasedTab() {
  const { walletAddress } = useWallet();
  const marketplace = useContract("DataMarketplace");

  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadPurchases = useCallback(async () => {
    if (!marketplace || !walletAddress) return;
    setLoading(true);
    try {
      const ids = await marketplace.getMyPurchases(walletAddress);
      const list = [];
      for (const id of ids) {
        const access = await marketplace.getAccess(id);
        const listing = await marketplace.getListing(access.listingId);
        list.push({
          accessId: Number(access.accessId),
          listingId: Number(access.listingId),
          cid: listing.anonymizedCID,
          accessedAt: Number(access.accessedAt),
          amountPaid: access.amountPaid,
        });
      }
      setPurchases(list.reverse());
    } catch (err) {
      console.error("Failed to load purchases:", err);
    } finally {
      setLoading(false);
    }
  }, [marketplace, walletAddress]);

  useEffect(() => {
    loadPurchases();
  }, [loadPurchases]);

  const handleView = (cid) => {
    window.open(`${PINATA_GATEWAY}${cid}`, "_blank");
    toast.success("Opening IPFS data...");
  };

  // Demo data when no purchases
  const demoPurchases = [
    { accessId: 1, cid: "QmAnon_BloodPanel_2025", accessedAt: Date.now() / 1000 - 86400 * 2, amountPaid: "10" },
    { accessId: 2, cid: "QmAnon_CardiacHistory", accessedAt: Date.now() / 1000 - 86400 * 5, amountPaid: "25" },
    { accessId: 3, cid: "QmAnon_DiabetesPanel", accessedAt: Date.now() / 1000 - 86400 * 10, amountPaid: "15" },
  ];

  const displayPurchases = purchases.length > 0 ? purchases : demoPurchases;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Loading purchases...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <div className="text-[15px] font-medium">My purchased data</div>
        <div className="text-[11px] text-[#64748b]">{displayPurchases.length} datasets accessed</div>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_120px] gap-2 px-5 py-2 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <div className="text-[10px] font-medium text-[#94a3b8]">Dataset CID</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Purchased</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Amount</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Action</div>
        </div>

        {displayPurchases.map((p) => {
          const price = typeof p.amountPaid === "string" ? p.amountPaid : (Number(p.amountPaid) / 1e18).toFixed(0);
          return (
            <div key={p.accessId} className="grid grid-cols-[1fr_120px_120px_120px] gap-2 px-5 py-[10px] border-b border-[#e2e8f0] last:border-0 items-center">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 bg-[#EEEDFE] rounded-[7px] flex items-center justify-center flex-shrink-0">
                  <FileText className="h-3.5 w-3.5 text-[#3C3489]" />
                </div>
                <span className="text-xs font-mono text-[#0D9488] truncate">{p.cid}</span>
              </div>
              <div className="text-[11px] text-[#64748b]">
                {new Date(Number(p.accessedAt) * 1000).toLocaleDateString("en-IN", {
                  day: "numeric", month: "short", year: "numeric",
                })}
              </div>
              <div className="text-[11px] font-medium text-[#0D9488]">{price} MEDI</div>
              <div className="flex gap-1">
                <button
                  onClick={() => handleView(p.cid)}
                  className="flex items-center gap-1 px-2 py-[4px] border border-[#cbd5e1] rounded-[6px] text-[10px] hover:bg-[#f8fafc]"
                >
                  <Eye className="h-3 w-3" /> View
                </button>
                <button
                  onClick={() => handleView(p.cid)}
                  className="flex items-center gap-1 px-2 py-[4px] border border-[#cbd5e1] rounded-[6px] text-[10px] hover:bg-[#f8fafc]"
                >
                  <Download className="h-3 w-3" /> DL
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
