import { useState, useCallback } from "react";
import { Search, MapPin, Stethoscope, Calendar, Coins, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { ethers } from "ethers";

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

export default function BookAppointmentTab() {
  const { walletAddress } = useWallet();
  const appointments = useContract("AppointmentSystem");

  const [city, setCity] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!appointments) {
      toast.error("Appointment contract not available");
      return;
    }
    setSearching(true);
    try {
      let addrs = [];
      if (city && specialization) {
        addrs = await appointments.searchByCityAndSpecialization(city, specialization);
      } else if (city) {
        addrs = await appointments.searchByCity(city);
      } else if (specialization) {
        addrs = await appointments.searchBySpecialization(specialization);
      } else {
        addrs = await appointments.getAllDoctors();
      }

      const profiles = [];
      for (const addr of addrs) {
        const profile = await appointments.getProfile(addr);
        profiles.push({
          address: addr,
          name: profile.name,
          specialization: profile.specialization,
          city: profile.cityDisplay,
          bio: profile.bio,
          fee: ethers.formatEther(profile.consultationFeeMEDI),
        });
      }
      setResults(profiles);
      if (profiles.length === 0) toast("No doctors found");
    } catch (err) {
      console.error(err);
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  }, [appointments, city, specialization]);

  const handleBook = async () => {
    if (!appointments || !selectedDoctor || !scheduleDate || !reason.trim()) {
      toast.error("Fill all fields");
      return;
    }
    const scheduledFor = Math.floor(new Date(scheduleDate).getTime() / 1000);
    if (scheduledFor <= Date.now() / 1000) {
      toast.error("Must schedule in the future");
      return;
    }
    setBooking(true);
    const tid = toast.loading("Booking appointment on-chain...");
    try {
      const tx = await appointments.bookAppointment(selectedDoctor.address, scheduledFor, reason.trim());
      await tx.wait();
      toast.success("Appointment requested!", { id: tid });
      setSelectedDoctor(null);
      setScheduleDate("");
      setReason("");
    } catch (err) {
      toast.error(err.reason || "Booking failed", { id: tid });
    } finally {
      setBooking(false);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <div className="text-[15px] font-medium">Find a doctor</div>
        <div className="text-[11px] text-[#64748b]">Search by city, specialization, or both</div>
      </div>

      {/* Search bar */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City (e.g. Delhi)"
              className="w-full pl-9 pr-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
            />
          </div>
          <div className="relative">
            <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
            <input
              type="text"
              value={specialization}
              onChange={(e) => setSpecialization(e.target.value)}
              placeholder="Specialization (e.g. Cardiology)"
              className="w-full pl-9 pr-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((doc) => (
          <div
            key={doc.address}
            className="bg-white border border-[#e2e8f0] rounded-xl p-5 flex flex-col"
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 bg-[#0D9488] rounded-full flex items-center justify-center text-[12px] font-medium text-white flex-shrink-0">
                {doc.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{doc.name}</div>
                <div className="text-[10px] text-[#64748b]">{shortenAddr(doc.address)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-[#64748b] mb-1">
              <Stethoscope className="h-3 w-3" /> {doc.specialization}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-[#64748b] mb-2">
              <MapPin className="h-3 w-3" /> {doc.city}
            </div>
            {doc.bio && <div className="text-[10px] text-[#94a3b8] mb-3 line-clamp-2">{doc.bio}</div>}
            <div className="flex items-center gap-1 text-[12px] text-[#0D9488] font-medium mt-auto mb-2">
              <Coins className="h-3 w-3" /> {doc.fee} MEDI
            </div>
            <button
              onClick={() => setSelectedDoctor(doc)}
              className="px-3 py-[6px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72]"
            >
              Book Appointment
            </button>
          </div>
        ))}
      </div>

      {/* Booking modal */}
      {selectedDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-xl p-6 border border-[#e2e8f0]">
            <div className="mb-4">
              <div className="text-sm font-medium">Book appointment with {selectedDoctor.name}</div>
              <div className="text-[11px] text-[#64748b]">
                {selectedDoctor.specialization} · {selectedDoctor.city} · {selectedDoctor.fee} MEDI
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] text-[#64748b] mb-1 block">Appointment date & time</label>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#64748b] mb-1 block">Reason for visit</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Describe your symptoms or reason"
                  className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] resize-none focus:outline-none focus:border-[#0D9488]"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setSelectedDoctor(null)}
                className="flex-1 px-4 py-[7px] border border-[#cbd5e1] text-xs rounded-[7px] hover:bg-[#f1f5f9]"
              >
                Cancel
              </button>
              <button
                onClick={handleBook}
                disabled={booking || !scheduleDate || !reason.trim()}
                className="flex-1 px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
              >
                {booking ? "Booking..." : "Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
