import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, CheckCircle, Clock, ExternalLink } from "lucide-react";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import UserName from "@/components/UserName";

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function PrescriptionsWrittenTab() {
  const { walletAddress } = useWallet();
  const rxManager = useContract("PrescriptionManager");

  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadPrescriptions = useCallback(async () => {
    if (!rxManager || !walletAddress) return;
    setLoading(true);
    try {
      const filter = rxManager.filters.PrescriptionWritten(null, walletAddress);
      const events = await rxManager.queryFilter(filter, 0, "latest");
      const rxList = [];
      for (const evt of events) {
        const rx = await rxManager.getPrescription(evt.args[0]);
        rxList.push({
          prescriptionId: rx.prescriptionId.toString(),
          doctorAddress: rx.doctorAddress,
          patientAddress: rx.patientAddress,
          medicineName: rx.medicineName,
          dosage: rx.dosage,
          durationDays: Number(rx.durationDays),
          isControlled: rx.isControlled,
          issuedAt: Number(rx.issuedAt),
          expiresAt: Number(rx.expiresAt),
          isDispensed: rx.isDispensed,
          isActive: rx.isActive,
          txHash: evt.transactionHash,
        });
      }
      setPrescriptions(rxList.reverse());
    } catch (err) {
      console.error("Failed to load prescriptions:", err);
    } finally {
      setLoading(false);
    }
  }, [rxManager, walletAddress]);

  useEffect(() => {
    loadPrescriptions();
  }, [loadPrescriptions]);

  const now = Date.now() / 1000;
  const thisMonth = prescriptions.filter((rx) => {
    const d = new Date(Number(rx.issuedAt) * 1000);
    const n = new Date();
    return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Loading prescriptions...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-medium">Prescriptions written</div>
          <div className="text-[11px] text-[#64748b]">{thisMonth.length} total this month</div>
        </div>
      </div>

      {/* Duplicate check warning */}
      <div className="flex items-center gap-2 p-[10px] px-[14px] bg-[#FAEEDA] border border-[#FAC775] rounded-[9px] mb-4">
        <AlertTriangle className="h-4 w-4 text-[#854F0B] flex-shrink-0" />
        <div className="text-[12px] font-medium text-[#633806]">
          Duplicate check active — duplicate prescriptions will be flagged before submission.
        </div>
      </div>

      {/* Prescriptions table */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-5 py-2 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <div className="text-[10px] font-medium text-[#94a3b8]">Patient / medicine</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Dosage</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Written</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Dispensed</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Status</div>
        </div>

        {prescriptions.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-8 text-center">No prescriptions written yet</div>
        )}

        {/* Rows */}
        {prescriptions.map((rx) => {
          const isActive = rx.isActive && Number(rx.expiresAt) > now;
          return (
            <div
              key={rx.prescriptionId.toString()}
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 px-5 py-[10px] border-b border-[#e2e8f0] last:border-0 items-center"
            >
              <div>
                <div className="text-xs font-medium flex items-center gap-1.5">
                  <UserName address={rx.patientAddress} showAddress={false} /> — {rx.medicineName}
                  {rx.isControlled && (
                    <span className="text-[9px] px-1.5 py-[1px] rounded bg-[#FCEBEB] text-[#791F1F] font-medium">
                      CS
                    </span>
                  )}
                </div>
                {rx.txHash && (
                  <a
                    href={`https://sepolia.etherscan.io/tx/${rx.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-[#0D9488] hover:underline inline-flex items-center gap-0.5"
                  >
                    Tx <ExternalLink className="h-[9px] w-[9px]" />
                  </a>
                )}
              </div>
              <div className="text-[11px] text-[#64748b]">{rx.dosage}</div>
              <div className="text-[11px] text-[#64748b]">
                {new Date(Number(rx.issuedAt) * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </div>
              <div className="text-[11px] text-[#64748b] flex items-center gap-1">
                {rx.isDispensed ? (
                  <>
                    <CheckCircle className="h-3 w-3 text-[#085041]" /> Yes
                  </>
                ) : (
                  <>
                    <Clock className="h-3 w-3 text-[#94a3b8]" /> No
                  </>
                )}
              </div>
              <div>
                <span
                  className={`text-[10px] px-2 py-[2px] rounded-lg font-medium ${
                    isActive ? "bg-[#E1F5EE] text-[#085041]" : "bg-[#f1f5f9] text-[#64748b]"
                  }`}
                >
                  {isActive ? "Active" : "Expired"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
