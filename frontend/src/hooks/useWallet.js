import useWalletStore from "@/store/walletStore";

export default function useWallet() {
  const store = useWalletStore();
  return {
    walletAddress: store.address,
    isConnected: store.isConnected,
    isCorrectNetwork: store.isCorrectNetwork,
    chainId: store.chainId,
    role: store.role,
    provider: store.provider,
    signer: store.signer,
    connect: store.connect,
    disconnect: store.disconnect,
    reconnect: store.reconnect,
    switchToSepolia: store.switchToSepolia,
    setRole: store.setRole,
  };
}
