import useUserName from "@/hooks/useUserName";

/**
 * Displays a human-readable name for a wallet address.
 * Falls back to a shortened address if no name is registered.
 *
 * Props:
 *   - address: wallet address
 *   - showAddress: if true, shows "Name (0x..)" style, if false shows just the name
 *   - className: optional extra classes for the outer span
 */
export default function UserName({ address, showAddress = true, className = "" }) {
  const name = useUserName(address);
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  if (!address) return null;

  if (name) {
    return (
      <span className={className}>
        <span className="font-medium">{name}</span>
        {showAddress && (
          <span className="text-[#94a3b8] ml-1 font-mono text-[10px]">({short})</span>
        )}
      </span>
    );
  }

  return <span className={`${className} font-mono`}>{short}</span>;
}
