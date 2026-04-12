import { useMemo } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { CONTRACTS, RPC_URL } from "@/constants/contracts";
import useWallet from "./useWallet";

export default function useContract(contractName) {
  const { signer, provider, isConnected } = useWallet();

  const contract = useMemo(() => {
    const config = CONTRACTS[contractName];
    if (!config) {
      console.error(`Unknown contract: ${contractName}`);
      return null;
    }
    if (!config.address) {
      console.warn(`No address configured for ${contractName}. Set VITE_${contractName.replace(/([A-Z])/g, "_$1").toUpperCase()}_ADDRESS in .env`);
      return null;
    }

    // Write calls: use signer (connected wallet)
    // Read-only: use provider from wallet, or fall back to a JSON-RPC provider
    if (isConnected && signer) {
      return new Contract(config.address, config.abi, signer);
    }

    const readProvider = provider || (RPC_URL ? new JsonRpcProvider(RPC_URL) : null);
    if (readProvider) {
      return new Contract(config.address, config.abi, readProvider);
    }

    return null;
  }, [contractName, signer, provider, isConnected]);

  return contract;
}
