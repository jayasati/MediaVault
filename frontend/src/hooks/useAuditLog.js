import { useState, useCallback } from "react";
import toast from "react-hot-toast";
import useContract from "./useContract";
import useWallet from "./useWallet";

const EVENT_LABELS = {
  AccessRequested: "Access requested",
  AccessApproved: "Access approved",
  AccessRejected: "Access rejected",
  AccessRevoked: "Access revoked",
};

function shortenAddress(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatDescription(eventName, args) {
  const doctor = shortenAddress(args.doctor || args.doctorAddress || args[1] || "");
  const patient = shortenAddress(args.patient || args.patientAddress || args[2] || "");
  const requestId = (args.requestId || args[0] || "").toString();

  switch (eventName) {
    case "AccessRequested":
      return `Dr. ${doctor} requested access to patient ${patient} (request #${requestId})`;
    case "AccessApproved":
      return `Request #${requestId} approved — expires at block timestamp ${args.expiresAt || args[1] || "N/A"}`;
    case "AccessRejected":
      return `Request #${requestId} rejected by patient`;
    case "AccessRevoked":
      return `Request #${requestId} revoked by patient`;
    default:
      return `${eventName} — request #${requestId}`;
  }
}

export default function useAuditLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const accessControl = useContract("MediAccessControl");
  const { provider } = useWallet();

  const fetchLogs = useCallback(async (address, role = "patient") => {
    if (!accessControl || !provider) {
      toast.error("Connect wallet to view audit logs");
      return;
    }

    setLoading(true);
    try {
      const eventNames = ["AccessRequested", "AccessApproved", "AccessRejected", "AccessRevoked"];
      const allEvents = [];

      for (const eventName of eventNames) {
        let filter;
        if (eventName === "AccessRequested") {
          // AccessRequested(uint256 indexed requestId, address indexed doctor, address indexed patient)
          filter = role === "doctor"
            ? accessControl.filters.AccessRequested(null, address, null)
            : accessControl.filters.AccessRequested(null, null, address);
        } else {
          // Other events only have indexed requestId — fetch all and filter client-side
          filter = accessControl.filters[eventName]();
        }

        const events = await accessControl.queryFilter(filter, 0, "latest");

        for (const event of events) {
          const block = await event.getBlock();
          allEvents.push({
            eventName,
            label: EVENT_LABELS[eventName],
            requestId: event.args[0]?.toString(),
            args: event.args,
            description: formatDescription(eventName, event.args),
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber,
            timestamp: block.timestamp,
            date: new Date(Number(block.timestamp) * 1000).toLocaleString(),
          });
        }
      }

      // For non-indexed events, filter by address via request lookup
      if (role === "patient" || role === "doctor") {
        const filtered = [];
        for (const evt of allEvents) {
          if (evt.eventName === "AccessRequested") {
            // Already filtered by the indexed param
            filtered.push(evt);
          } else {
            // Look up the request to check if it involves the address
            try {
              const req = await accessControl.getAccessRequest(evt.requestId);
              const involvedAddress = role === "doctor" ? req.doctorAddress : req.patientAddress;
              if (involvedAddress.toLowerCase() === address.toLowerCase()) {
                filtered.push(evt);
              }
            } catch {
              // Skip if request lookup fails
            }
          }
        }
        allEvents.length = 0;
        allEvents.push(...filtered);
      }

      // Sort newest first
      allEvents.sort((a, b) => b.timestamp - a.timestamp);
      setLogs(allEvents);
    } catch (err) {
      console.error("Audit log fetch error:", err);
      toast.error("Failed to fetch audit logs");
    } finally {
      setLoading(false);
    }
  }, [accessControl, provider]);

  return { logs, loading, fetchLogs };
}
