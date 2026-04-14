import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Search, MapPin, Stethoscope, Calendar, Coins, ExternalLink, Building2, User, ChevronDown, X } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { ethers } from "ethers";

function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

const FILTER_TABS = [
  { key: "city", label: "City", icon: MapPin },
  { key: "specialization", label: "Specialization", icon: Stethoscope },
  { key: "hospital", label: "Hospital", icon: Building2 },
  { key: "doctor", label: "Doctor", icon: User },
];

export default function BookAppointmentTab() {
  const { walletAddress } = useWallet();
  const appointments = useContract("AppointmentSystem");
  const roleManager = useContract("RoleManager");

  const [filterMode, setFilterMode] = useState("city");
  const [selected, setSelected] = useState({ city: "", specialization: "", hospitalId: "", doctorAddress: "" });
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [reason, setReason] = useState("");
  const [booking, setBooking] = useState(false);

  // Cached index of the entire network
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [hospitals, setHospitals] = useState([]); // [{ hospitalId, name, city }]
  const [doctors, setDoctors] = useState([]); // [{ address, name, specialization, city, bio, fee, hospitalId, hospitalName }]

  // Load hospitals + approved doctors once on mount
  useEffect(() => {
    if (!roleManager || !appointments) return;
    let cancelled = false;
    (async () => {
      setLoadingIndex(true);
      try {
        // 1. Hospitals
        const hList = await roleManager.getAllHospitals();
        const hospitalsArr = hList.map((h) => ({
          hospitalId: h.hospitalId,
          name: h.name,
          city: h.city,
        }));
        const hospitalById = new Map(hospitalsArr.map((h) => [h.hospitalId, h]));

        // 2. Approved doctors — source from RoleManager events so doctors appear
        //    even before they complete AppointmentSystem profile setup.
        const filter = roleManager.filters.ApplicationApproved();
        const events = await roleManager.queryFilter(filter, 0, "latest");
        const seen = new Set();
        const doctorsArr = [];
        for (const evt of events) {
          const appId = evt.args[0];
          let app;
          try {
            app = await roleManager.getApplication(appId);
          } catch { continue; }
          if (Number(app.requestedRole) !== 2) continue;
          const addr = app.applicant;
          const key = addr.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);

          // Confirm the user is still a doctor on-chain
          let details;
          try {
            details = await roleManager.getUserDetails(addr);
          } catch { continue; }
          if (Number(details.role) !== 2) continue;

          const hospital = hospitalById.get(details.hospitalId) || hospitalById.get(app.hospitalId) || null;

          // Overlay AppointmentSystem profile if the doctor has completed setup
          let profile = null;
          try {
            profile = await appointments.getProfile(addr);
          } catch {
            // doctor hasn't set up booking profile yet
          }
          const isListed = !!(profile && profile.isListed);

          doctorsArr.push({
            address: addr,
            name: (profile && profile.name) || app.name,
            specialization: (profile && profile.specialization) || app.specialization || "",
            city: hospital?.city || (profile && profile.cityDisplay) || "",
            bio: profile?.bio || "",
            fee: profile ? ethers.formatEther(profile.consultationFeeMEDI) : "0",
            hospitalId: hospital?.hospitalId || app.hospitalId || "",
            hospitalName: hospital?.name || "",
            isListed,
          });
        }
        if (cancelled) return;
        setHospitals(hospitalsArr);
        setDoctors(doctorsArr);
      } catch (err) {
        console.error("Failed to load search index:", err);
        if (!cancelled) toast.error("Failed to load doctor directory");
      } finally {
        if (!cancelled) setLoadingIndex(false);
      }
    })();
    return () => { cancelled = true; };
  }, [roleManager, appointments]);

  // Derived option lists (cascade based on current filter selections)
  const { cityOptions, specializationOptions, hospitalOptions, doctorOptions } = useMemo(() => {
    const citySet = new Set();
    const specSet = new Set();
    for (const d of doctors) {
      if (d.city) citySet.add(d.city);
      if (d.specialization) specSet.add(d.specialization);
    }
    return {
      cityOptions: Array.from(citySet).sort(),
      specializationOptions: Array.from(specSet).sort(),
      hospitalOptions: hospitals,
      doctorOptions: doctors,
    };
  }, [doctors, hospitals]);

  const handleSearch = useCallback(() => {
    setSearching(true);
    try {
      let filtered = doctors;
      if (filterMode === "city" && selected.city) {
        filtered = filtered.filter((d) => d.city === selected.city);
      } else if (filterMode === "specialization" && selected.specialization) {
        filtered = filtered.filter((d) => d.specialization === selected.specialization);
      } else if (filterMode === "hospital" && selected.hospitalId) {
        filtered = filtered.filter((d) => d.hospitalId === selected.hospitalId);
      } else if (filterMode === "doctor" && selected.doctorAddress) {
        filtered = filtered.filter((d) => d.address.toLowerCase() === selected.doctorAddress.toLowerCase());
      }
      setResults(filtered);
      if (filtered.length === 0) toast("No doctors found");
    } finally {
      setSearching(false);
    }
  }, [doctors, filterMode, selected]);

  // Show all doctors by default once the index loads
  useEffect(() => {
    if (!loadingIndex) setResults(doctors);
  }, [loadingIndex, doctors]);

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
        <div className="text-[11px] text-[#64748b]">
          Filter by city, specialization, hospital, or doctor name
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 mb-4">
        {/* Filter mode tabs */}
        <div className="flex gap-1 mb-3 bg-[#f1f5f9] p-1 rounded-[8px] w-fit">
          {FILTER_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = filterMode === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterMode(tab.key)}
                className={`px-3 py-[5px] text-[11px] font-medium rounded-[6px] inline-flex items-center gap-1.5 transition ${
                  active ? "bg-white text-[#0D9488] shadow-sm" : "text-[#64748b] hover:text-[#0f172a]"
                }`}
              >
                <Icon className="h-3 w-3" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
          {filterMode === "city" && (
            <Combobox
              icon={MapPin}
              placeholder={loadingIndex ? "Loading cities..." : "Select a city"}
              value={selected.city}
              options={cityOptions.map((c) => ({ value: c, label: c }))}
              onChange={(v) => setSelected((s) => ({ ...s, city: v }))}
              disabled={loadingIndex}
              emptyLabel="No cities in network"
            />
          )}
          {filterMode === "specialization" && (
            <Combobox
              icon={Stethoscope}
              placeholder={loadingIndex ? "Loading..." : "Select a specialization"}
              value={selected.specialization}
              options={specializationOptions.map((s) => ({ value: s, label: s }))}
              onChange={(v) => setSelected((s) => ({ ...s, specialization: v }))}
              disabled={loadingIndex}
              emptyLabel="No specializations in network"
            />
          )}
          {filterMode === "hospital" && (
            <Combobox
              icon={Building2}
              placeholder={loadingIndex ? "Loading hospitals..." : "Select a hospital"}
              value={selected.hospitalId}
              options={hospitalOptions.map((h) => ({
                value: h.hospitalId,
                label: h.name,
                sublabel: h.city,
              }))}
              onChange={(v) => setSelected((s) => ({ ...s, hospitalId: v }))}
              disabled={loadingIndex}
              emptyLabel="No hospitals in network"
            />
          )}
          {filterMode === "doctor" && (
            <Combobox
              icon={User}
              placeholder={loadingIndex ? "Loading doctors..." : "Select a doctor"}
              value={selected.doctorAddress}
              options={doctorOptions.map((d) => ({
                value: d.address,
                label: d.name,
                sublabel: `${d.specialization}${d.hospitalName ? " · " + d.hospitalName : ""}`,
              }))}
              onChange={(v) => setSelected((s) => ({ ...s, doctorAddress: v }))}
              disabled={loadingIndex}
              emptyLabel="No doctors in network"
            />
          )}
          <button
            onClick={() => {
              setSelected({ city: "", specialization: "", hospitalId: "", doctorAddress: "" });
              setResults(doctors);
            }}
            className="px-3 py-[7px] border border-[#cbd5e1] text-[#64748b] text-xs rounded-[7px] hover:bg-[#f1f5f9]"
          >
            Clear
          </button>
          <button
            onClick={handleSearch}
            disabled={searching || loadingIndex}
            className="px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Search className="h-3.5 w-3.5" />
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        {!loadingIndex && (
          <div className="text-[10px] text-[#94a3b8] mt-2">
            {doctors.length} doctor{doctors.length === 1 ? "" : "s"} · {hospitalOptions.length} hospital{hospitalOptions.length === 1 ? "" : "s"} · {cityOptions.length} cit{cityOptions.length === 1 ? "y" : "ies"}
          </div>
        )}
      </div>

      {loadingIndex && (
        <div className="flex items-center justify-center py-16 gap-3 text-[12px] text-[#64748b]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0D9488] border-t-transparent" />
          Loading doctor directory from chain...
        </div>
      )}

      {!loadingIndex && results.length === 0 && (
        <div className="bg-white border border-dashed border-[#e2e8f0] rounded-xl py-12 text-center">
          <div className="text-[13px] text-[#64748b]">No doctors match your filter</div>
          <div className="text-[10px] text-[#94a3b8] mt-1">Try a different filter or Clear to see all</div>
        </div>
      )}

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
            {doc.hospitalName && (
              <div className="flex items-center gap-2 text-[11px] text-[#64748b] mb-1">
                <Building2 className="h-3 w-3" /> {doc.hospitalName}
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-[#64748b] mb-2">
              <MapPin className="h-3 w-3" /> {doc.city}
            </div>
            {doc.bio && <div className="text-[10px] text-[#94a3b8] mb-3 line-clamp-2">{doc.bio}</div>}
            {doc.isListed ? (
              <div className="flex items-center gap-1 text-[12px] text-[#0D9488] font-medium mt-auto mb-2">
                <Coins className="h-3 w-3" /> {doc.fee} MEDI
              </div>
            ) : (
              <div className="text-[10px] text-[#b45309] bg-[#fef3c7] border border-[#fde68a] rounded px-2 py-1 mt-auto mb-2">
                Profile setup incomplete — not yet bookable
              </div>
            )}
            <button
              onClick={() => setSelectedDoctor(doc)}
              disabled={!doc.isListed}
              className="px-3 py-[6px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50 disabled:cursor-not-allowed"
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

function Combobox({ icon: Icon, placeholder, value, options, onChange, disabled, emptyLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selectedOption = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sublabel || "").toLowerCase().includes(query.toLowerCase())
      )
    : options;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="w-full flex items-center gap-2 pl-9 pr-8 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white hover:border-[#94a3b8] focus:outline-none focus:border-[#0D9488] disabled:bg-[#f8fafc] disabled:cursor-not-allowed text-left relative"
      >
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
        <span className={selectedOption ? "text-[#0f172a]" : "text-[#94a3b8]"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        {selectedOption && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
              setQuery("");
            }}
            className="absolute right-7 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[#f1f5f9] text-[#94a3b8]"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#94a3b8]" />
      </button>

      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-[#e2e8f0] rounded-[7px] shadow-lg max-h-64 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-[#e2e8f0]">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Type to filter..."
              className="w-full px-2 py-1 text-xs border border-[#e2e8f0] rounded-[5px] focus:outline-none focus:border-[#0D9488]"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-[#94a3b8] text-center">
                {options.length === 0 ? emptyLabel : "No matches"}
              </div>
            )}
            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full px-3 py-[7px] text-left text-xs hover:bg-[#f8fafc] ${
                  opt.value === value ? "bg-[#E6F1FB] text-[#0C447C]" : "text-[#0f172a]"
                }`}
              >
                <div className="font-medium">{opt.label}</div>
                {opt.sublabel && <div className="text-[10px] text-[#94a3b8]">{opt.sublabel}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
