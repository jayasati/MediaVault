import { Star } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from "recharts";

const RATING_DATA = [
  { rating: "5", count: 102, pct: 72, color: "#0D9488" },
  { rating: "4", count: 28, pct: 20, color: "#9FE1CB" },
  { rating: "3", count: 8, pct: 6, color: "#E1F5EE" },
  { rating: "2", count: 3, pct: 2, color: "#E1F5EE" },
  { rating: "1", count: 1, pct: 1, color: "#E1F5EE" },
];

const REVIEWS = [
  {
    id: 1,
    stars: 5,
    patientId: "#2847",
    text: "Very thorough in explaining the diagnosis. Took time to answer all my questions and made me feel comfortable with the treatment plan.",
    date: "12 Jan 2025",
  },
  {
    id: 2,
    stars: 4,
    patientId: "#1936",
    text: "Good consultation overall. The prescription was effective and the follow-up was timely. Would recommend.",
    date: "8 Jan 2025",
  },
];

export default function ReputationTab() {
  const score = 4.8;
  const totalRatings = 142;
  const totalPatients = 312;
  const totalRecords = "1.8K";

  return (
    <div>
      {/* Score + breakdown grid */}
      <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4 mb-4">
        {/* Score card */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 text-center">
          <div className="text-[3.5rem] font-medium text-[#0D9488] leading-none">{score}</div>
          <div className="text-[16px] text-[#0D9488] mt-1 tracking-wider">
            {"★".repeat(Math.round(score))}
          </div>
          <div className="text-[11px] text-[#64748b] mt-1">Based on {totalRatings} ratings</div>

          <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-[#e2e8f0]">
            <div>
              <div className="text-[16px] font-medium">{totalPatients}</div>
              <div className="text-[10px] text-[#94a3b8]">Patients</div>
            </div>
            <div>
              <div className="text-[16px] font-medium">{totalRecords}</div>
              <div className="text-[10px] text-[#94a3b8]">Records</div>
            </div>
          </div>
        </div>

        {/* Rating breakdown */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
          <div className="text-xs font-medium text-[#64748b] mb-4">Rating breakdown</div>
          <div className="flex flex-col gap-2">
            {RATING_DATA.map((r) => (
              <div key={r.rating} className="flex items-center gap-3">
                <div className="w-4 text-right text-[11px] text-[#64748b] flex-shrink-0">{r.rating}</div>
                <Star className="h-3 w-3 text-[#0D9488] flex-shrink-0" />
                <div className="flex-1 bg-[#f1f5f9] rounded-[3px] h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-[3px] transition-all"
                    style={{ width: `${r.pct}%`, backgroundColor: r.color }}
                  />
                </div>
                <div className="w-7 text-right text-[11px] text-[#64748b] flex-shrink-0">{r.count}</div>
              </div>
            ))}
          </div>

          {/* Bar chart alternative view */}
          <div className="mt-4 pt-4 border-t border-[#e2e8f0]">
            <ResponsiveContainer width="100%" height={100}>
              <BarChart data={RATING_DATA} layout="vertical">
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="rating" width={20} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Bar dataKey="count" radius={[0, 3, 3, 0]} barSize={8}>
                  {RATING_DATA.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent reviews */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-3">Recent reviews</div>
        <div className="flex flex-col gap-3">
          {REVIEWS.map((rev) => (
            <div key={rev.id} className="pb-3 border-b border-[#e2e8f0] last:border-0 last:pb-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[13px] text-[#0D9488]">
                  {"★".repeat(rev.stars)}{"☆".repeat(5 - rev.stars)}
                </span>
                <span className="text-[10px] text-[#94a3b8]">Patient {rev.patientId}</span>
                <span className="text-[10px] text-[#94a3b8]">· {rev.date}</span>
              </div>
              <div className="text-xs text-[#334155] leading-[1.5]">{rev.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
