import { useState, useEffect, useCallback } from "react";
import { Calendar, X, CheckCircle, Clock } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import UserName from "@/components/UserName";

const STATUS_LABELS = {
  0: { label: "Requested", color: "bg-[#FAEEDA] text-[#633806]" },
  1: { label: "Confirmed", color: "bg-[#E1F5EE] text-[#085041]" },
  2: { label: "Rejected", color: "bg-[#FCEBEB] text-[#791F1F]" },
  3: { label: "Completed", color: "bg-[#E6F1FB] text-[#0C447C]" },
  4: { label: "Cancelled", color: "bg-[#f1f5f9] text-[#64748b]" },
};

export default function AppointmentsTab() {
  const { walletAddress } = useWallet();
  const appointments = useContract("AppointmentSystem");
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    if (!appointments || !walletAddress) return;
    setLoading(true);
    try {
      const ids = await appointments.getDoctorAppointments(walletAddress);
      const items = [];
      for (const id of ids) {
        const apt = await appointments.getAppointment(id);
        items.push({
          id: Number(apt.appointmentId),
          patient: apt.patient,
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

  const handleConfirm = async (id) => {
    const tid = toast.loading("Confirming...");
    try {
      const tx = await appointments.confirmAppointment(id);
      await tx.wait();
      toast.success("Appointment confirmed", { id: tid });
      load();
    } catch (err) {
      toast.error(err.reason || "Failed", { id: tid });
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt("Reason for rejection:", "Schedule conflict");
    if (!reason || !reason.trim()) return;
    const tid = toast.loading("Rejecting...");
    try {
      const tx = await appointments.rejectAppointment(id, reason.trim());
      await tx.wait();
      toast.success("Appointment rejected", { id: tid });
      load();
    } catch (err) {
      toast.error(err.reason || "Failed", { id: tid });
    }
  };

  const handleComplete = async (id) => {
    const notes = window.prompt("Visit notes/summary:", "");
    if (notes === null) return;
    const tid = toast.loading("Marking complete...");
    try {
      const tx = await appointments.completeAppointment(id, notes || "");
      await tx.wait();
      toast.success("Marked as completed", { id: tid });
      load();
    } catch (err) {
      toast.error(err.reason || "Failed", { id: tid });
    }
  };

  const filtered = filter === "all" ? list : list.filter((a) => {
    if (filter === "pending") return a.status === 0;
    if (filter === "confirmed") return a.status === 1;
    if (filter === "completed") return a.status === 3;
    return true;
  });

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
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-medium">Appointments</div>
          <div className="text-[11px] text-[#64748b]">{filtered.length} shown</div>
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-[6px] text-[11px] border border-[#cbd5e1] rounded-[7px] bg-white"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-12 text-center">
            <Calendar className="h-10 w-10 text-[#94a3b8] mx-auto mb-2" />
            <div className="text-[13px] text-[#64748b]">No appointments</div>
          </div>
        )}
        {filtered.map((apt) => {
          const status = STATUS_LABELS[apt.status];
          return (
            <div key={apt.id} className="bg-white border border-[#e2e8f0] rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-[#E1F5EE] rounded-full flex items-center justify-center flex-shrink-0">
                  <Calendar className="h-4 w-4 text-[#085041]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      <UserName address={apt.patient} showAddress={false} />
                    </span>
                    <span className={`text-[10px] px-2 py-[2px] rounded-lg font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#64748b]">
                    {new Date(apt.scheduledFor * 1000).toLocaleString("en-IN", {
                      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </div>
                  <div className="text-[11px] text-[#64748b] mt-1">Reason: {apt.reason}</div>
                  {apt.notes && <div className="text-[10px] text-[#94a3b8] mt-1 italic">"{apt.notes}"</div>}
                </div>
                <div className="flex flex-col gap-1">
                  {apt.status === 0 && (
                    <>
                      <button
                        onClick={() => handleConfirm(apt.id)}
                        className="px-3 py-[4px] bg-[#0D9488] text-white text-[10px] font-medium rounded-[6px] hover:bg-[#0B7C72]"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => handleReject(apt.id)}
                        className="px-3 py-[4px] bg-[#FCEBEB] text-[#791F1F] text-[10px] rounded-[6px] hover:bg-[#f9d5d5]"
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {apt.status === 1 && (
                    <button
                      onClick={() => handleComplete(apt.id)}
                      className="px-3 py-[4px] bg-[#0D9488] text-white text-[10px] font-medium rounded-[6px] hover:bg-[#0B7C72]"
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
