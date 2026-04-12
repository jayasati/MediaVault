import { Receipt } from "lucide-react";

const BILLS = [
  {
    id: 1,
    service: "Cardiology consultation",
    provider: "Dr. Rajesh Kumar · Apollo Hospital",
    date: "14 Jan 2025",
    amount: "₹1,200",
    status: "paid",
  },
  {
    id: 2,
    service: "Blood panel — complete",
    provider: "PathLab Diagnostics · Koramangala",
    date: "10 Jan 2025",
    amount: "₹650",
    status: "pending",
  },
];

const STATUS_STYLE = {
  paid: { label: "Paid", bg: "bg-[#E1F5EE]", text: "text-[#085041]" },
  pending: { label: "Pending", bg: "bg-[#FAEEDA]", text: "text-[#633806]" },
};

export default function BillingTab() {
  return (
    <div>
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-3">Billing statements</div>
        <div className="flex flex-col gap-2">
          {BILLS.map((bill) => {
            const style = STATUS_STYLE[bill.status];
            return (
              <div
                key={bill.id}
                className="flex items-center gap-[10px] p-[10px] bg-[#f8fafc] rounded-[9px]"
              >
                <div className="w-8 h-8 bg-[#E6F1FB] rounded-[7px] flex items-center justify-center flex-shrink-0">
                  <Receipt className="h-4 w-4 text-[#0C447C]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium">{bill.service}</div>
                  <div className="text-[11px] text-[#64748b]">
                    {bill.provider} · {bill.date}
                  </div>
                </div>
                <div className="text-[13px] font-medium text-right mr-2">{bill.amount}</div>
                <span className={`text-[10px] px-2 py-[2px] rounded-lg font-medium ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
