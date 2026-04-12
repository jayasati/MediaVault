import { useState, useEffect, useCallback } from "react";
import { Search, ShieldCheck, Eye, Lock, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";

const CONSENT_LABELS = { 0: "Basic", 1: "Detailed", 2: "Full" };
const CONSENT_STYLES = {
  0: { bg: "bg-[#E1F5EE]", text: "text-[#085041]" },
  1: { bg: "bg-[#E6F1FB]", text: "text-[#0C447C]" },
  2: { bg: "bg-[#EEEDFE]", text: "text-[#3C3489]" },
};

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function BrowseTab() {
  const { walletAddress } = useWallet();
  const marketplace = useContract("DataMarketplace");
  const mediToken = useContract("MEDIToken");

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterConsent, setFilterConsent] = useState("all");
  const [purchasing, setPurchasing] = useState(null);

  const loadListings = useCallback(async () => {
    if (!marketplace) return;
    setLoading(true);
    try {
      const all = [];
      for (let level = 0; level <= 2; level++) {
        const ids = await marketplace.getListings(level);
        for (const id of ids) {
          const listing = await marketplace.getListing(id);
          all.push({
            listingId: Number(listing.listingId),
            patientAddress: listing.patientAddress,
            anonymizedCID: listing.anonymizedCID,
            consentLevel: Number(listing.consentLevel),
            pricePerAccess: listing.pricePerAccess,
            accessCount: Number(listing.accessCount),
            isActive: listing.isActive,
          });
        }
      }
      setListings(all);
    } catch (err) {
      console.error("Failed to load listings:", err);
    } finally {
      setLoading(false);
    }
  }, [marketplace]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const handlePurchase = async (listingId) => {
    if (!marketplace || !mediToken) {
      toast.error("Contracts not available");
      return;
    }
    setPurchasing(listingId);
    const tid = toast.loading("Processing purchase...");
    try {
      const listing = listings.find((l) => l.listingId === listingId);
      // Approve token spending
      const tx1 = await mediToken.approve(await marketplace.getRunner().getAddress(), listing.pricePerAccess);
      await tx1.wait();
      // Purchase
      const tx2 = await marketplace.purchaseAccess(listingId);
      await tx2.wait();
      toast.success("Access purchased! CID unlocked.", { id: tid });
      loadListings();
    } catch (err) {
      if (err.code === "ACTION_REJECTED") {
        toast.error("Rejected", { id: tid });
      } else {
        toast.error(err.reason || "Purchase failed", { id: tid });
      }
    } finally {
      setPurchasing(null);
    }
  };

  const filtered = filterConsent === "all"
    ? listings
    : listings.filter((l) => l.consentLevel === Number(filterConsent));

  // Demo listings for when contract isn't available
  const demoListings = [
    { listingId: 1, patientAddress: "0x4f3a…8d2c", anonymizedCID: "QmAnon_BloodPanel_2025", consentLevel: 0, pricePerAccess: "10", accessCount: 23, isActive: true },
    { listingId: 2, patientAddress: "0x8b1c…4a7f", anonymizedCID: "QmAnon_CardiacHistory", consentLevel: 1, pricePerAccess: "25", accessCount: 8, isActive: true },
    { listingId: 3, patientAddress: "0x3c44…93BC", anonymizedCID: "QmAnon_FullGenomics", consentLevel: 2, pricePerAccess: "100", accessCount: 3, isActive: true },
    { listingId: 4, patientAddress: "0x90F7…b906", anonymizedCID: "QmAnon_DiabetesPanel", consentLevel: 0, pricePerAccess: "15", accessCount: 45, isActive: true },
    { listingId: 5, patientAddress: "0x15d3…6A65", anonymizedCID: "QmAnon_AllergyProfile", consentLevel: 1, pricePerAccess: "20", accessCount: 12, isActive: true },
    { listingId: 6, patientAddress: "0x9965…4dc", anonymizedCID: "QmAnon_NeurologicalScan", consentLevel: 2, pricePerAccess: "150", accessCount: 1, isActive: true },
  ];

  const displayListings = filtered.length > 0 ? filtered : (filterConsent === "all" ? demoListings : demoListings.filter((l) => l.consentLevel === Number(filterConsent)));

  return (
    <div>
      {/* Anonymization notice */}
      <div className="flex items-center gap-2 p-[10px] px-[14px] bg-[#E6F1FB] border border-[#93c5fd] rounded-[9px] mb-4">
        <ShieldCheck className="h-4 w-4 text-[#0C447C] flex-shrink-0" />
        <div className="text-[12px] text-[#0C447C]">
          <span className="font-medium">All data is anonymized.</span> Patient identities are removed before listing. Researchers access only de-identified health records.
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={filterConsent}
          onChange={(e) => setFilterConsent(e.target.value)}
          className="px-3 py-[6px] text-[11px] border border-[#cbd5e1] rounded-[7px] bg-white"
        >
          <option value="all">All consent levels</option>
          <option value="0">Basic</option>
          <option value="1">Detailed</option>
          <option value="2">Full</option>
        </select>
        <div className="text-[11px] text-[#64748b]">{displayListings.length} listings</div>
      </div>

      {/* Grid */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-2 text-[11px] text-[#64748b]">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
          Loading marketplace...
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayListings.map((l) => {
          const style = CONSENT_STYLES[l.consentLevel] || CONSENT_STYLES[0];
          const price = typeof l.pricePerAccess === "string" ? l.pricePerAccess : (Number(l.pricePerAccess) / 1e18).toFixed(0);
          return (
            <div key={l.listingId} className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-[10px] px-2 py-[2px] rounded-lg font-medium ${style.bg} ${style.text}`}>
                  {CONSENT_LABELS[l.consentLevel]}
                </span>
                <span className="text-[13px] font-medium text-[#0D9488]">{price} MEDI</span>
              </div>

              <div className="text-[11px] font-mono text-[#0D9488] mb-2 truncate">{l.anonymizedCID}</div>

              <div className="text-[10px] text-[#64748b] mb-1">
                Patient: {typeof l.patientAddress === "string" && l.patientAddress.startsWith("0x") && l.patientAddress.length > 10 ? shortenAddr(l.patientAddress) : l.patientAddress}
              </div>

              <div className="flex items-center gap-1 text-[10px] text-[#94a3b8] mb-4">
                <Eye className="h-3 w-3" />
                {l.accessCount} accesses
              </div>

              <button
                onClick={() => handlePurchase(l.listingId)}
                disabled={purchasing === l.listingId}
                className="mt-auto flex items-center justify-center gap-1.5 px-4 py-[7px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
              >
                <Lock className="h-3 w-3" />
                {purchasing === l.listingId ? "Purchasing..." : "Purchase Access"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
