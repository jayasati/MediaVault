import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BrowserProvider } from "ethers";
import toast from "react-hot-toast";
import { CHAIN_ID, NETWORK_NAME } from "@/constants/contracts";
import { clearWalletCache } from "@/utils/storage";

const SEPOLIA_CHAIN_ID_HEX = `0x${CHAIN_ID.toString(16)}`;

const useWalletStore = create(
  persist(
    (set, get) => ({
      // State
      address: null,
      isConnected: false,
      chainId: null,
      isCorrectNetwork: false,
      role: null, // "patient" | "doctor" | "admin" | "researcher"

      // Non-persisted (rebuilt on reconnect)
      provider: null,
      signer: null,

      // Actions
      setWallet: ({ address, chainId, provider, signer }) => {
        const correct = Number(chainId) === CHAIN_ID;
        set({ address, chainId: Number(chainId), isConnected: true, isCorrectNetwork: correct, provider, signer });
      },

      clearWallet: () => {
        if (window.ethereum) {
          window.ethereum.removeAllListeners("accountsChanged");
          window.ethereum.removeAllListeners("chainChanged");
        }
        // Clear cached dashboard data for this wallet before clearing wallet state
        const currentAddr = get().address;
        if (currentAddr) {
          clearWalletCache(currentAddr);
        }
        set({
          address: null,
          isConnected: false,
          chainId: null,
          isCorrectNetwork: false,
          role: null,
          provider: null,
          signer: null,
        });
      },

      setRole: (role) => set({ role }),

      // Wallet operations
      connect: async () => {
        if (!window.ethereum) {
          toast.error("MetaMask not detected. Please install MetaMask.");
          return;
        }

        try {
          const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
          const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
          const browserProvider = new BrowserProvider(window.ethereum);
          const signer = await browserProvider.getSigner();
          const chainId = Number(chainIdHex);

          get().setWallet({ address: accounts[0], chainId, provider: browserProvider, signer });
          get()._setupListeners(browserProvider);

          if (chainId !== CHAIN_ID) {
            toast.error(`Wrong network — please switch to ${NETWORK_NAME}`, { id: "wrong-network" });
          } else {
            toast.success(`Wallet connected: ${accounts[0].slice(0, 6)}…${accounts[0].slice(-4)}`);
          }
        } catch (err) {
          if (err.code === 4001) {
            toast.error("Connection rejected by user");
          } else {
            toast.error("Failed to connect wallet");
            console.error("Wallet connection error:", err);
          }
        }
      },

      // Silent reconnect on page refresh — no popup
      reconnect: async () => {
        if (!window.ethereum) return;
        try {
          const accounts = await window.ethereum.request({ method: "eth_accounts" });
          if (accounts.length === 0) {
            get().clearWallet();
            return;
          }
          const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
          const browserProvider = new BrowserProvider(window.ethereum);
          const signer = await browserProvider.getSigner();

          get().setWallet({ address: accounts[0], chainId: Number(chainIdHex), provider: browserProvider, signer });
          get()._setupListeners(browserProvider);
        } catch {
          get().clearWallet();
        }
      },

      disconnect: () => {
        get().clearWallet();
        toast.success("Wallet disconnected");
      },

      switchToSepolia: async () => {
        if (!window.ethereum) return;
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
          });
        } catch (err) {
          if (err.code === 4902) {
            try {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: SEPOLIA_CHAIN_ID_HEX,
                  chainName: "Sepolia Testnet",
                  nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["https://rpc.sepolia.org"],
                  blockExplorerUrls: ["https://sepolia.etherscan.io"],
                }],
              });
            } catch {
              toast.error("Failed to add Sepolia network");
            }
          } else {
            toast.error("Failed to switch network");
          }
        }
      },

      // Internal — sets up MetaMask event listeners
      _setupListeners: (browserProvider) => {
        window.ethereum.removeAllListeners("accountsChanged");
        window.ethereum.removeAllListeners("chainChanged");

        window.ethereum.on("accountsChanged", (accs) => {
          if (accs.length === 0) {
            get().disconnect();
          } else {
            // Clear stale role from previous wallet — new wallet must re-verify on-chain
            set({ role: null });
            browserProvider.getSigner().then((s) => {
              get().setWallet({ address: accs[0], chainId: get().chainId, provider: browserProvider, signer: s });
            });
            toast.success(`Switched to ${accs[0].slice(0, 6)}…${accs[0].slice(-4)}`, { id: "account-change" });
          }
        });

        window.ethereum.on("chainChanged", (newChainHex) => {
          const id = Number(newChainHex);
          const p = new BrowserProvider(window.ethereum);
          p.getSigner().then((s) => {
            get().setWallet({ address: get().address, chainId: id, provider: p, signer: s });
          });
          if (id !== CHAIN_ID) {
            toast.error(`Wrong network — please switch to ${NETWORK_NAME}`, { id: "wrong-network" });
          }
        });
      },
    }),
    {
      name: "medivault-wallet",
      partialize: (state) => ({
        address: state.address,
        isConnected: state.isConnected,
        chainId: state.chainId,
        role: state.role,
      }),
    }
  )
);

export default useWalletStore;
