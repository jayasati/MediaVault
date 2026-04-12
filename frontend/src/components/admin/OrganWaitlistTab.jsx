import { useState } from "react";
import { Heart, Users, ExternalLink } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";

const ORGANS = ["kidney", "liver", "heart", "cornea", "lung"];

const DEMO_WAITLIST = {
  kidney: [
    { id: 1, patient: "0x4f3a…8d2c", blood: "A+", urgency: 9, waiting: "42 days" },
    { id: 2, patient: "0x8b1c…4a7f", blood: "O+", urgency: 8, waiting: "38 days" },
    { id: 3, patient: "0x3c44…93BC", blood: "B+", urgency: 7, waiting: "25 days" },
    { id: 4, patient: "0x90F7…b906", blood: "AB-", urgency: 5, waiting: "12 days" },
  ],
  liver: [
    { id: 5, patient: "0x15d3…6A65", blood: "O-", urgency: 10, waiting: "60 days" },
    { id: 6, patient: "0x9965…4dc", blood: "A-", urgency: 6, waiting: "15 days" },
  ],
  heart: [
    { id: 7, patient: "0x976E…aa9", blood: "B-", urgency: 10, waiting: "90 days" },
  ],
  cornea: [
    { id: 8, patient: "0x14dC…9955", blood: "A+", urgency: 4, waiting: "8 days" },
    { id: 9, patient: "0x2361…1E8f", blood: "O+", urgency: 3, waiting: "5 days" },
  ],
  lung: [],
};

const DEMO_TRANSPLANTS = [
  { id: 1, donor: "0xBcd4…4096", recipient: "0xa0Ee…79720", organ: "kidney", date: "8 Jan 2025", hospital: "0xf39F…2266" },
  { id: 2, donor: "0x71bE…5788", recipient: "0xFABB…694a", organ: "cornea", date: "3 Jan 2025", hospital: "0xf39F…2266" },
];

const URGENCY_COLORS = {
  10: "#dc2626", 9: "#ef4444", 8: "#f97316", 7: "#f59e0b",
  6: "#eab308", 5: "#84cc16", 4: "#22c55e", 3: "#0D9488", 2: "#06b6d4", 1: "#64748b",
};

export default function OrganWaitlistTab() {
  const [selectedOrgan, setSelectedOrgan] = useState("kidney");

  // Form state
  const [txDonor, setTxDonor] = useState("");
  const [txRecipient, setTxRecipient] = useState("");
  const [txOrgan, setTxOrgan] = useState("kidney");

  const waitlist = DEMO_WAITLIST[selectedOrgan] || [];

  const chartData = ORGANS.map((o) => ({
    organ: o.charAt(0).toUpperCase() + o.slice(1),
    count: (DEMO_WAITLIST[o] || []).length,
  }));

  const handleRecordTransplant = () => {
    if (!txDonor || !txRecipient) {
      toast.error("Fill donor and recipient addresses");
      return;
    }
    toast.success("Transplant recorded (demo mode)");
    setTxDonor("");
    setTxRecipient("");
  };

  return (
    <div>
      {/* Organ selector + chart */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1.5fr] gap-4 mb-4">
        {/* Organ filter */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#64748b] mb-3">Select organ type</div>
          <div className="flex flex-col gap-1">
            {ORGANS.map((o) => (
              <button
                key={o}
                onClick={() => setSelectedOrgan(o)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                  selectedOrgan === o ? "bg-[#E1F5EE] text-[#085041] font-medium" : "text-[#64748b] hover:bg-[#f8fafc]"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Heart className="h-3.5 w-3.5" />
                  {o.charAt(0).toUpperCase() + o.slice(1)}
                </span>
                <span className="text-[10px] px-1.5 py-[1px] rounded bg-[#f1f5f9] text-[#64748b]">
                  {(DEMO_WAITLIST[o] || []).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#64748b] mb-3">Waitlist by organ</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData}>
              <XAxis dataKey="organ" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#0D9488" barSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Waitlist table */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
          <div className="text-xs font-medium text-[#64748b]">
            {selectedOrgan.charAt(0).toUpperCase() + selectedOrgan.slice(1)} waitlist — {waitlist.length} patients
          </div>
          <div className="text-[10px] text-[#94a3b8]">Ranked by: blood match → urgency → wait time</div>
        </div>
        <div className="grid grid-cols-[60px_1fr_80px_80px_80px] gap-2 px-5 py-2 bg-[#f8fafc] border-b border-[#e2e8f0]">
          <div className="text-[10px] font-medium text-[#94a3b8]">Rank</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Patient</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Blood</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Urgency</div>
          <div className="text-[10px] font-medium text-[#94a3b8]">Waiting</div>
        </div>
        {waitlist.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-6 text-center">No patients on waitlist</div>
        )}
        {waitlist.map((entry, i) => (
          <div key={entry.id} className="grid grid-cols-[60px_1fr_80px_80px_80px] gap-2 px-5 py-[10px] border-b border-[#e2e8f0] last:border-0 items-center">
            <div className="text-xs font-medium text-[#64748b]">#{i + 1}</div>
            <div className="text-xs font-mono">{entry.patient}</div>
            <div>
              <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#FCEBEB] text-[#791F1F]">
                {entry.blood}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: URGENCY_COLORS[entry.urgency] || "#64748b" }}
              />
              <span className="text-xs font-medium">{entry.urgency}/10</span>
            </div>
            <div className="text-[11px] text-[#64748b]">{entry.waiting}</div>
          </div>
        ))}
      </div>

      {/* Record transplant + history */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Record transplant form */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-[13px] font-medium mb-3">Record transplant</div>
          <div className="flex flex-col gap-2">
            <input type="text" value={txDonor} onChange={(e) => setTxDonor(e.target.value)}
              placeholder="Donor address (0x…)"
              className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]" />
            <input type="text" value={txRecipient} onChange={(e) => setTxRecipient(e.target.value)}
              placeholder="Recipient address (0x…)"
              className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]" />
            <select value={txOrgan} onChange={(e) => setTxOrgan(e.target.value)}
              className="px-[10px] py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white focus:outline-none focus:border-[#0D9488]">
              {ORGANS.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
            </select>
            <button onClick={handleRecordTransplant}
              className="mt-1 px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72]">
              Record transplant
            </button>
          </div>
        </div>

        {/* Transplant history */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#64748b] mb-3">Transplant history</div>
          <div className="flex flex-col gap-2">
            {DEMO_TRANSPLANTS.map((t) => (
              <div key={t.id} className="flex items-center gap-[10px] px-[10px] py-2 border-b border-[#e2e8f0] last:border-0">
                <div className="w-7 h-7 bg-[#E1F5EE] rounded-full flex items-center justify-center flex-shrink-0">
                  <Heart className="h-3.5 w-3.5 text-[#085041]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{t.organ.charAt(0).toUpperCase() + t.organ.slice(1)}</div>
                  <div className="text-[10px] text-[#64748b]">
                    {t.donor} → {t.recipient} · {t.date}
                  </div>
                </div>
                <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E1F5EE] text-[#085041]">
                  Complete
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
