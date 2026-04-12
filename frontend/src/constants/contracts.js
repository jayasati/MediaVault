import MEDITokenArtifact from "../../../blockchain/artifacts/contracts/MEDIToken.sol/MEDIToken.json";
import PatientRegistryArtifact from "../../../blockchain/artifacts/contracts/PatientRegistry.sol/PatientRegistry.json";
import MediAccessControlArtifact from "../../../blockchain/artifacts/contracts/MediAccessControl.sol/MediAccessControl.json";

// Addresses — prefer env vars (set after deployment), fall back to deployment JSON
const env = import.meta.env;

export const CONTRACTS = {
  MEDIToken: {
    address: env.VITE_MEDITOKEN_ADDRESS || "",
    abi: MEDITokenArtifact.abi,
  },
  PatientRegistry: {
    address: env.VITE_PATIENT_REGISTRY_ADDRESS || "",
    abi: PatientRegistryArtifact.abi,
  },
  MediAccessControl: {
    address: env.VITE_ACCESS_CONTROL_ADDRESS || "",
    abi: MediAccessControlArtifact.abi,
  },
};

export const CHAIN_ID = Number(env.VITE_CHAIN_ID) || 11155111; // Sepolia
export const NETWORK_NAME = env.VITE_NETWORK_NAME || "sepolia";
export const RPC_URL = env.VITE_RPC_URL || "";
export const API_URL = env.VITE_API_URL || "http://localhost:5000/api";
export const PINATA_GATEWAY = env.VITE_PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/";
