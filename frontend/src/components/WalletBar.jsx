import useWallet from "@/hooks/useWallet";
import { Wallet, LogOut, AlertTriangle } from "lucide-react";

export default function WalletBar() {
  const { walletAddress, isConnected, isCorrectNetwork, connect, disconnect, switchToSepolia } = useWallet();

  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
            <span className="text-xs font-bold text-primary-foreground">M</span>
          </div>
          <span className="font-semibold text-sm">MediVault</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isConnected && !isCorrectNetwork && (
          <button
            onClick={switchToSepolia}
            className="inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Wrong network — switch
          </button>
        )}

        {isConnected ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-mono">
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
            </div>
            <button
              onClick={disconnect}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-secondary transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Wallet className="h-4 w-4" />
            Connect MetaMask
          </button>
        )}
      </div>
    </div>
  );
}
