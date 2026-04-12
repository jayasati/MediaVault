export default function ComplianceTab() {
  const score = 87;

  return (
    <div>
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <div className="text-xs font-medium text-[#64748b] mb-1">Compliance score</div>
        <div className="text-[11px] text-[#94a3b8] mb-6">
          Based on prescription adherence and check-up regularity
        </div>

        <div className="flex flex-col items-center py-4">
          <div className="text-[3rem] font-medium text-[#0D9488] leading-none">{score}</div>
          <div className="w-full max-w-xs mt-4 bg-[#f1f5f9] rounded-[3px] h-1.5 overflow-hidden">
            <div
              className="h-full bg-[#0D9488] rounded-[3px] transition-all"
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="mt-3 text-[10px] px-2 py-[2px] rounded-lg font-medium bg-[#E1F5EE] text-[#085041]">
            Excellent · Top 15% of patients
          </span>
        </div>
      </div>
    </div>
  );
}
