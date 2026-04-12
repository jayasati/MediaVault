import { useState, useCallback } from "react";
import CryptoJS from "crypto-js";
import axios from "axios";
import toast from "react-hot-toast";
import { PINATA_GATEWAY } from "@/constants/contracts";

const PINATA_API = "https://api.pinata.cloud";
const PINATA_KEY = import.meta.env.VITE_PINATA_API_KEY || "";
const PINATA_SECRET = import.meta.env.VITE_PINATA_SECRET || "";

export default function useIPFS() {
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Encrypt raw text with AES-256
  const encrypt = (data, key) => CryptoJS.AES.encrypt(data, key).toString();

  // Decrypt AES-256 cipher text
  const decrypt = (cipherText, key) => {
    const bytes = CryptoJS.AES.decrypt(cipherText, key);
    return bytes.toString(CryptoJS.enc.Utf8);
  };

  // Upload an encrypted file to Pinata → returns CID
  const uploadFile = useCallback(async (file, encryptionKey) => {
    if (!PINATA_KEY || !PINATA_SECRET) {
      toast.error("Pinata API keys not configured");
      return null;
    }

    setUploading(true);
    try {
      // Read file as base64
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Encrypt the base64 content
      const encrypted = encrypt(fileData, encryptionKey);

      // Wrap encrypted text into a Blob and upload
      const blob = new Blob([encrypted], { type: "application/octet-stream" });
      const formData = new FormData();
      formData.append("file", blob, `${file.name}.enc`);
      formData.append("pinataMetadata", JSON.stringify({
        name: `medivault-${file.name}`,
        keyvalues: { encrypted: "true", originalName: file.name },
      }));

      const res = await axios.post(`${PINATA_API}/pinning/pinFileToIPFS`, formData, {
        maxBodyLength: Infinity,
        headers: {
          "Content-Type": "multipart/form-data",
          pinata_api_key: PINATA_KEY,
          pinata_secret_api_key: PINATA_SECRET,
        },
      });

      toast.success("File encrypted & uploaded to IPFS");
      return res.data.IpfsHash;
    } catch (err) {
      console.error("IPFS upload error:", err);
      toast.error("Failed to upload file to IPFS");
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  // Upload a JSON object to Pinata → returns CID
  const uploadJSON = useCallback(async (jsonObject) => {
    if (!PINATA_KEY || !PINATA_SECRET) {
      toast.error("Pinata API keys not configured");
      return null;
    }

    setUploading(true);
    try {
      const res = await axios.post(`${PINATA_API}/pinning/pinJSONToIPFS`, {
        pinataContent: jsonObject,
        pinataMetadata: { name: `medivault-metadata-${Date.now()}` },
      }, {
        headers: {
          "Content-Type": "application/json",
          pinata_api_key: PINATA_KEY,
          pinata_secret_api_key: PINATA_SECRET,
        },
      });

      toast.success("Metadata uploaded to IPFS");
      return res.data.IpfsHash;
    } catch (err) {
      console.error("IPFS JSON upload error:", err);
      toast.error("Failed to upload metadata to IPFS");
      return null;
    } finally {
      setUploading(false);
    }
  }, []);

  // Fetch encrypted file from IPFS → decrypt → return data URL
  const getFile = useCallback(async (cid, decryptionKey) => {
    setDownloading(true);
    try {
      const res = await axios.get(`${PINATA_GATEWAY}${cid}`, { responseType: "text" });
      const decrypted = decrypt(res.data, decryptionKey);

      if (!decrypted) {
        toast.error("Decryption failed — wrong key?");
        return null;
      }

      return decrypted; // data URL (base64)
    } catch (err) {
      console.error("IPFS fetch error:", err);
      toast.error("Failed to retrieve file from IPFS");
      return null;
    } finally {
      setDownloading(false);
    }
  }, []);

  // Fetch plain JSON from IPFS
  const getJSON = useCallback(async (cid) => {
    setDownloading(true);
    try {
      const res = await axios.get(`${PINATA_GATEWAY}${cid}`);
      return res.data;
    } catch (err) {
      console.error("IPFS JSON fetch error:", err);
      toast.error("Failed to retrieve metadata from IPFS");
      return null;
    } finally {
      setDownloading(false);
    }
  }, []);

  return { uploadFile, uploadJSON, getFile, getJSON, uploading, downloading };
}
