import { useState, useEffect, useCallback } from "react";
import { Calendar, X, CheckCircle, Clock, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import UserName from "@/components/UserName";

const STATUS_LABELS = {
  0: { label: "Pending", color: "bg-[#FAEEDA] text-[#633806]", icon: Clock },
  1: { label: "Confirmed", color: "bg-[#E1F5EE] text-[#085041]", icon: CheckCircle },
  2: { label: "Rejected", color: "bg-[#FCEBEB] text-[#791F1F]", icon: X },
  3: { label: "Completed", color: "bg-[#E6F1FB] text-[#0C447C]", icon: CheckCircle },
  4: { label: "Cancelled", color: "bg-[#f1f5f9] text-[#64748b]", icon: X },
};

export default function MyAppointmentsTab() {
  const { walletAddress } = useWallet();
  const appointments = useContract("AppointmentSystem");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!appointments || !walletAddress) return;
    setLoading(true);
    try {
      const ids = await appointments.getPatientAppointments(walletAddress);
      const items = [];
      for (const id of ids) {
        const apt = await appointments.getAppointment(id);
        items.push({
          id: Number(apt.appointmentId),
          doctor: apt.doctor,
          requestedAt: Number(apt.requestedAt),
          scheduledFor: Number(apt.scheduledFor),
          status: Number(apt.status),
          reason: apt.reason,
          notes: apt.notes,
        });
      }
      setList(items.reverse());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [appointments, walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (id) => {
    if (!appointments) return;
    const tid = toast.loading("Cancelling...");
    try {
      const tx = await appointments.cancelAppointment(id);
      await tx.wait();
      toast.success("Appointment cancelled", { id: tid });
      load();
    } catch (err) {
      toast.error(err.reason || "Failed to cancel", { id: tid });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-3 text-[13px] text-[#64748b]">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
        Loading appointments...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <div className="text-[15px] font-medium">My appointments</div>
        <div className="text-[11px] text-[#64748b]">{list.length} total</div>
      </div>

      {list.length === 0 && (
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-12 text-center">
          <Calendar className="h-10 w-10 text-[#94a3b8] mx-auto mb-2" />
          <div className="text-[13px] text-[#64748b]">No appointments yet</div>
          <div className="text-[11px] text-[#94a3b8] mt-1">Use the Find Doctor tab to book your first one.</div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {list.map((apt) => {
          const status = STATUS_LABELS[apt.status];
          const Icon = status.icon;
          const canCancel = apt.status === 0 || apt.status === 1;
          return (
            <div key={apt.id} className="bg-white border border-[#e2e8f0] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-[#E1F5EE] rounded-full flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-4 w-4 text-[#085041]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      <UserName address={apt.doctor} showAddress={false} />
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-[2px] rounded-lg font-medium ${status.color}`}>
                      <Icon className="h-3 w-3" />
                      {status.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#64748b]">
                    Scheduled: {new Date(apt.scheduledFor * 1000).toLocaleString("en-IN", {
                      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                  <div className="text-[11px] text-[#64748b] mt-1">Reason: {apt.reason}</div>
                  {apt.notes && (
                    <div className="text-[10px] text-[#94a3b8] mt-1 italic">"{apt.notes}"</div>
                  )}
                </div>
                {canCancel && (
                  <button
                    onClick={() => handleCancel(apt.id)}
                    className="px-2 py-[4px] bg-[#FCEBEB] text-[#791F1F] text-[10px] rounded-[6px] hover:bg-[#f9d5d5]"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
