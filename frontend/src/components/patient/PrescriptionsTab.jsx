import { useState, useEffect, useCallback } from "react";
import { Pill, AlertTriangle, ExternalLink, CheckCircle, Clock } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";

function shortenAddr(addr) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "";
}

export default function PrescriptionsTab() {
  const { walletAddress } = useWallet();
  const prescriptionManager = useContract("PrescriptionManager");

  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadPrescriptions = useCallback(async () => {
    if (!prescriptionManager || !walletAddress) return;
    setLoading(true);
    try {
      // Get all prescription events for this patient
      const filter = prescriptionManager.filters.PrescriptionWritten(null, null, walletAddress);
      const events = await prescriptionManager.queryFilter(filter, 0, "latest");

      const rxList = [];
      for (const evt of events) {
        const rx = await prescriptionManager.getPrescription(evt.args[0]);
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
  }, [prescriptionManager, walletAddress]);

  useEffect(() => {
    loadPrescriptions();
  }, [loadPrescriptions]);

  const now = Date.now() / 1000;
  const active = prescriptions.filter((rx) => rx.isActive && Number(rx.expiresAt) > now);
  const history = prescriptions.filter((rx) => !rx.isActive || Number(rx.expiresAt) <= now);
  const hasControlled = active.some((rx) => rx.isControlled);

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
      {/* Controlled substance warning */}
      {hasControlled && (
        <div className="flex items-center gap-2 p-[10px] px-[14px] bg-[#FAEEDA] border border-[#FAC775] rounded-[9px] mb-4">
          <AlertTriangle className="h-4 w-4 text-[#854F0B] flex-shrink-0" />
          <div className="text-[12px] font-medium text-[#633806]">
            Controlled substance active —{" "}
            {active
              .filter((rx) => rx.isControlled)
              .map((rx) => `${rx.medicineName} ${rx.dosage}`)
              .join(", ")}
            . Inform emergency services if applicable.
          </div>
        </div>
      )}

      {/* Active prescriptions */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        <div className="text-xs font-medium text-[#64748b] mb-3">
          Active prescriptions — {active.length}
        </div>
        {active.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-4 text-center">No active prescriptions</div>
        )}
        <div className="flex flex-col gap-2">
          {active.map((rx) => (
            <div
              key={rx.prescriptionId.toString()}
              className="flex items-center gap-[10px] p-[10px] bg-[#f8fafc] rounded-[9px]"
            >
              <div
                className={`w-8 h-8 rounded-[7px] flex items-center justify-center text-[10px] font-medium flex-shrink-0 ${
                  rx.isControlled
                    ? "bg-[#FCEBEB] text-[#791F1F]"
                    : "bg-[#EEEDFE] text-[#3C3489]"
                }`}
              >
                <Pill className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium flex items-center gap-2">
                  {rx.medicineName} {rx.dosage}
                  {rx.isControlled && (
                    <span className="text-[9px] px-1.5 py-[1px] rounded bg-[#FCEBEB] text-[#791F1F] font-medium">
                      Controlled
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#64748b]">
                  Dr. {shortenAddr(rx.doctorAddress)} · Expires{" "}
                  {new Date(Number(rx.expiresAt) * 1000).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {" · Duration: "}{rx.durationDays.toString()} days
                </div>
              </div>
              {rx.isDispensed ? (
                <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E1F5EE] text-[#085041] flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Dispensed
                </span>
              ) : (
                <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E6F1FB] text-[#0C447C] flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Pending pickup
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* History */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-3">Prescription history</div>
        {history.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-4 text-center">No past prescriptions</div>
        )}
        <div className="flex flex-col gap-2">
          {history.map((rx) => (
            <div
              key={`h-${rx.prescriptionId.toString()}`}
              className="flex items-center gap-[10px] px-[10px] py-2 border-b border-[#e2e8f0] last:border-0"
            >
              <div className="w-7 h-7 bg-[#f1f5f9] rounded-[7px] flex items-center justify-center flex-shrink-0">
                <Pill className="h-3.5 w-3.5 text-[#64748b]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{rx.medicineName} {rx.dosage}</div>
                <div className="text-[11px] text-[#64748b]">
                  Issued{" "}
                  {new Date(Number(rx.issuedAt) * 1000).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {rx.txHash && (
                    <>
                      {" · "}
                      <a
                        href={`https://sepolia.etherscan.io/tx/${rx.txHash}`}
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
              <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#f1f5f9] text-[#64748b]">
                Expired
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
