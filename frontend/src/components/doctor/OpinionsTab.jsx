import { useState } from "react";
import { MessageSquare, Coins, Clock, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";

const OPEN_CASES = [
  {
    id: 1,
    specialty: "Cardiology",
    fee: 80,
    title: "56M, post-MI chest pain, troponin plateau",
    description: "Patient presenting with recurrent chest pain 3 weeks post-MI. Troponin levels plateaued at 0.8ng/mL. ECG shows non-specific ST changes. Seeking second opinion on catheterization timing.",
    deadline: 5,
    opinions: 3,
  },
  {
    id: 2,
    specialty: "Endocrinology",
    fee: 120,
    title: "34F, refractory hypothyroidism, elevated TPO",
    description: "TSH persistently elevated (12.4) despite levothyroxine 150mcg. TPO antibodies >1000. Considering immunosuppressive therapy. Requesting opinion on treatment escalation.",
    deadline: 3,
    opinions: 1,
  },
  {
    id: 3,
    specialty: "Neurology",
    fee: 150,
    title: "42M, progressive tremor, negative DaT scan",
    description: "Essential tremor vs early-onset Parkinson's. DaT scan negative but clinical presentation suggestive. Family history positive. Need opinion on further workup.",
    deadline: 7,
    opinions: 0,
  },
  {
    id: 4,
    specialty: "Oncology",
    fee: 200,
    title: "61F, incidental pulmonary nodule, 8mm",
    description: "Solitary pulmonary nodule found on routine CT. Non-smoker, no prior history. PET scan shows mild uptake. Biopsy vs surveillance discussion needed.",
    deadline: 4,
    opinions: 2,
  },
];

const MY_OPINIONS = [
  {
    id: 1,
    title: "Post-MI catheterization timing",
    date: "10 Jan 2025",
    txHash: "0x7a2f…",
    status: "selected",
    reward: 80,
  },
  {
    id: 2,
    title: "Refractory hypothyroidism management",
    date: "8 Jan 2025",
    txHash: "0x3b9c…",
    status: "pending",
    reward: 120,
  },
];

export default function OpinionsTab() {
  const { walletAddress } = useWallet();
  const [mediBalance] = useState(240);

  const handleSubmitOpinion = (caseId) => {
    toast.success("Opinion submission — coming in Phase 2");
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-medium">Second opinion marketplace</div>
          <div className="text-[11px] text-[#64748b]">{OPEN_CASES.length} open cases match your specialization</div>
        </div>
        <div className="text-[13px] font-medium text-[#0D9488]">Balance: {mediBalance} MEDI</div>
      </div>

      {/* Open cases grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {OPEN_CASES.map((c) => (
          <div key={c.id} className="bg-white border border-[#e2e8f0] rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E1F5EE] text-[#085041]">
                {c.specialty}
              </span>
              <span className="text-[13px] font-medium text-[#0D9488]">{c.fee} MEDI</span>
            </div>
            <div className="text-xs font-medium mb-1.5">{c.title}</div>
            <div className="text-[11px] text-[#64748b] leading-[1.6] mb-3">{c.description}</div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-[10px] text-[#94a3b8]">
                <Clock className="h-3 w-3" />
                Deadline: {c.deadline} days · {c.opinions} opinions so far
              </div>
              <button
                onClick={() => handleSubmitOpinion(c.id)}
                className="flex items-center gap-1 px-3 py-[5px] bg-[#0D9488] text-white text-[11px] font-medium rounded-[7px] hover:bg-[#0B7C72]"
              >
                <MessageSquare className="h-3 w-3" />
                Submit opinion
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* My submitted opinions */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-3">My submitted opinions</div>
        <div className="flex flex-col gap-2">
          {MY_OPINIONS.map((o) => (
            <div key={o.id} className="flex items-center gap-[10px] px-[10px] py-2 border-b border-[#e2e8f0] last:border-0">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{o.title}</div>
                <div className="text-[10px] text-[#64748b]">
                  Submitted {o.date} ·{" "}
                  <a href="#" className="text-[#0D9488] hover:underline inline-flex items-center gap-0.5">
                    Tx {o.txHash} <ExternalLink className="h-[9px] w-[9px]" />
                  </a>
                </div>
              </div>
              <span
                className={`text-[10px] px-2 py-[2px] rounded-lg font-medium ${
                  o.status === "selected"
                    ? "bg-[#E1F5EE] text-[#085041]"
                    : "bg-[#FAEEDA] text-[#633806]"
                }`}
              >
                {o.status === "selected" ? "Selected" : "Pending"}
              </span>
              <span
                className={`text-[12px] font-medium ${
                  o.status === "selected" ? "text-[#0D9488]" : "text-[#64748b]"
                }`}
              >
                {o.status === "selected" ? `+${o.reward} MEDI` : `${o.reward} MEDI`}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
