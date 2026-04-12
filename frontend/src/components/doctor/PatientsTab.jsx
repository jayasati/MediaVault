import { useState, useEffect, useCallback } from "react";
import { Search, Plus, FileText, Pill, ExternalLink, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import UserName from "@/components/UserName";
import { ethers } from "ethers";

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function PatientsTab() {
  const { walletAddress, signer } = useWallet();
  const accessControl = useContract("MediAccessControl");
  const registry = useContract("PatientRegistry");
  const rxManager = useContract("PrescriptionManager");

  const [patients, setPatients] = useState([]);
  const [selected, setSelected] = useState(null);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  // Prescription form
  const [rxName, setRxName] = useState("");
  const [rxDosage, setRxDosage] = useState("");
  const [rxDuration, setRxDuration] = useState("7");
  const [rxControlled, setRxControlled] = useState(false);
  const [rxGasEst, setRxGasEst] = useState("");
  const [writing, setWriting] = useState(false);

  // Load patients with active access
  const loadPatients = useCallback(async () => {
    if (!accessControl || !walletAddress) return;
    setLoading(true);
    try {
      const myRequests = await accessControl.getMyAccessRequests();
      const activePatients = [];
      for (const reqId of myRequests) {
        const req = await accessControl.getAccessRequest(reqId);
        if (Number(req.status) === 1 && Number(req.expiresAt) > Date.now() / 1000) {
          // Avoid duplicates
          if (!activePatients.find((p) => p.patientAddress.toLowerCase() === req.patientAddress.toLowerCase())) {
            activePatients.push({
              patientAddress: req.patientAddress,
              requestId: req.requestId,
              expiresAt: Number(req.expiresAt),
            });
          }
        }
      }
      setPatients(activePatients);
    } catch (err) {
      console.error("Failed to load patients:", err);
    } finally {
      setLoading(false);
    }
  }, [accessControl, walletAddress]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // Select patient and load profile
  const selectPatient = async (p) => {
    setSelected(p);
    setSelectedProfile(null);
    if (!registry) return;
    try {
      const profile = await registry.getPatientByWallet(p.patientAddress);
      setSelectedProfile(profile);
    } catch (err) {
      console.error("Failed to load patient profile:", err);
    }
  };

  // Estimate gas for prescription
  useEffect(() => {
    if (!rxManager || !selected || !rxName || !rxDosage || !rxDuration) {
      setRxGasEst("");
      return;
    }
    const estimate = async () => {
      try {
        const gas = await rxManager.writePrescription.estimateGas(
          selected.patientAddress, rxName, rxDosage, Number(rxDuration), rxControlled, ""
        );
        const price = await signer.provider.getFeeData();
        const cost = gas * (price.gasPrice || 0n);
        setRxGasEst(ethers.formatEther(cost));
      } catch {
        setRxGasEst("—");
      }
    };
    estimate();
  }, [rxManager, selected, rxName, rxDosage, rxDuration, rxControlled, signer]);

  const handleWriteRx = async () => {
    if (!rxManager || !selected) return;
    if (!rxName.trim() || !rxDosage.trim()) {
      toast.error("Medicine name and dosage required");
      return;
    }
    setWriting(true);
    const tid = toast.loading("Submitting prescription...");
    try {
      // Duplicate check
      const isDup = await rxManager.checkDuplicate(selected.patientAddress, rxName);
      if (isDup) {
        toast.error("Active prescription already exists for this medicine", { id: tid });
        setWriting(false);
        return;
      }

      const tx = await rxManager.writePrescription(
        selected.patientAddress, rxName, rxDosage, Number(rxDuration), rxControlled, ""
      );
      toast.loading("Waiting for confirmation...", { id: tid });
      const receipt = await tx.wait();
      toast.success(
        <span>
          Prescription written!{" "}
          <a href={`https://sepolia.etherscan.io/tx/${receipt.hash}`} target="_blank" rel="noopener noreferrer" className="underline">
            View tx
          </a>
        </span>,
        { id: tid }
      );
      setRxName("");
      setRxDosage("");
      setRxControlled(false);
    } catch (err) {
      if (err.code === "ACTION_REJECTED") {
        toast.error("Transaction rejected", { id: tid });
      } else if (err.reason) {
        toast.error(err.reason, { id: tid });
      } else {
        toast.error("Failed to write prescription", { id: tid });
      }
    } finally {
      setWriting(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !registry) return;
    try {
      let profile;
      if (searchQuery.startsWith("0x")) {
        profile = await registry.getPatientByWallet(searchQuery);
      } else {
        profile = await registry.getPatientById(Number(searchQuery));
      }
      if (profile.walletAddress === ethers.ZeroAddress) {
        toast.error("Patient not found");
        return;
      }
      setSelected({ patientAddress: profile.walletAddress, requestId: 0, expiresAt: 0 });
      setSelectedProfile(profile);
    } catch {
      toast.error("Patient not found");
    }
  };

  const daysLeft = (expiresAt) => {
    const d = Math.ceil((expiresAt - Date.now() / 1000) / 86400);
    return d > 0 ? `${d}d left` : "Expired";
  };

  return (
    <div>
      {/* Search bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by patient address or ID…"
            className="w-full pl-9 pr-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72]"
        >
          Search
        </button>
      </div>

      {/* Grid: patient list + detail */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4">
        {/* Patient list */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#64748b] mb-3">
            Active patients — {patients.length}
          </div>
          {loading && (
            <div className="flex items-center justify-center py-8 gap-2 text-[11px] text-[#64748b]">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
              Loading...
            </div>
          )}
          {!loading && patients.length === 0 && (
            <div className="text-[13px] text-[#94a3b8] py-6 text-center">
              No active patients. Request access first.
            </div>
          )}
          <div className="flex flex-col gap-1">
            {patients.map((p) => {
              const initials = p.patientAddress.slice(2, 4).toUpperCase();
              const isSelected = selected?.patientAddress === p.patientAddress;
              return (
                <button
                  key={p.patientAddress}
                  onClick={() => selectPatient(p)}
                  className={`flex items-center gap-[9px] px-[10px] py-2 rounded-lg text-left transition-colors ${
                    isSelected ? "bg-[#E1F5EE]" : "hover:bg-[#f8fafc]"
                  }`}
                >
                  <div className="w-7 h-7 bg-[#0D9488] rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate"><UserName address={p.patientAddress} showAddress={false} /></div>
                    <div className="text-[10px] text-[#94a3b8]">{daysLeft(p.expiresAt)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Patient detail */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          {!selected && (
            <div className="text-[13px] text-[#94a3b8] py-12 text-center">
              Select a patient to view their records
            </div>
          )}
          {selected && (
            <div>
              {/* Patient header */}
              <div className="flex items-center gap-3 mb-4 pb-4 border-b border-[#e2e8f0]">
                <div className="w-9 h-9 bg-[#0D9488] rounded-full flex items-center justify-center text-[13px] font-medium text-white flex-shrink-0">
                  {selected.patientAddress.slice(2, 4).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium"><UserName address={selected.patientAddress} showAddress={false} /></div>
                  <div className="text-[10px] text-[#64748b] font-mono">{selected.patientAddress}</div>
                </div>
                {selectedProfile && (
                  <div className="flex gap-2">
                    {selectedProfile.bloodType && (
                      <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#FCEBEB] text-[#791F1F]">
                        {selectedProfile.bloodType}
                      </span>
                    )}
                    {selectedProfile.isEmergencyDonor && (
                      <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E1F5EE] text-[#085041]">
                        Donor
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-4">
                <button className="flex items-center gap-1.5 px-3 py-[5px] bg-[#E1F5EE] text-[#085041] text-[11px] font-medium rounded-[6px]">
                  <FileText className="h-3 w-3" />
                  Add record
                </button>
                <button
                  onClick={() => document.getElementById("rx-form")?.scrollIntoView({ behavior: "smooth" })}
                  className="flex items-center gap-1.5 px-3 py-[5px] bg-[#E1F5EE] text-[#085041] text-[11px] font-medium rounded-[6px]"
                >
                  <Pill className="h-3 w-3" />
                  Write Rx
                </button>
              </div>

              {/* Patient records (from localStorage) */}
              <div className="mb-4">
                <div className="text-[11px] font-medium text-[#64748b] mb-2">Medical records</div>
                {(() => {
                  const saved = localStorage.getItem(`medivault-records-${selected.patientAddress}`);
                  const records = saved ? JSON.parse(saved) : [];
                  if (records.length === 0) {
                    return <div className="text-[11px] text-[#94a3b8] py-3 text-center">No records shared</div>;
                  }
                  return (
                    <div className="flex flex-col gap-1.5">
                      {records.slice(0, 5).map((r) => (
                        <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 bg-[#f8fafc] rounded-lg">
                          <div className="w-6 h-6 bg-[#E6F1FB] rounded flex items-center justify-center">
                            <FileText className="h-3 w-3 text-[#0C447C]" />
                          </div>
                          <div className="flex-1 text-[11px] font-medium truncate">{r.name}</div>
                          <span className="text-[10px] text-[#0D9488] cursor-pointer hover:underline">View</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Write prescription form */}
              <div id="rx-form" className="pt-4 border-t border-[#e2e8f0]">
                <div className="text-[11px] font-medium text-[#64748b] mb-3">Write new prescription</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    type="text"
                    value={rxName}
                    onChange={(e) => setRxName(e.target.value)}
                    placeholder="Medicine name"
                    className="px-[10px] py-[6px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                  />
                  <input
                    type="text"
                    value={rxDosage}
                    onChange={(e) => setRxDosage(e.target.value)}
                    placeholder="Dosage (e.g. 500mg 2x)"
                    className="px-[10px] py-[6px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                  />
                </div>
                <div className="mb-3">
                  <input
                    type="number"
                    value={rxDuration}
                    onChange={(e) => setRxDuration(e.target.value)}
                    placeholder="Duration (days)"
                    min="1"
                    className="w-full px-[10px] py-[6px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-[11px] text-[#64748b] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rxControlled}
                      onChange={(e) => setRxControlled(e.target.checked)}
                      className="accent-[#0D9488]"
                    />
                    Controlled substance
                  </label>
                  <button
                    onClick={handleWriteRx}
                    disabled={writing || !rxName || !rxDosage}
                    className="px-3 py-[6px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
                  >
                    {writing ? "Submitting..." : `Submit Rx${rxGasEst && rxGasEst !== "—" ? ` · est. ${Number(rxGasEst).toFixed(6)} ETH gas` : ""}`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
