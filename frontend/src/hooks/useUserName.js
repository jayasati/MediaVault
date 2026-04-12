import { useState, useEffect } from "react";
import useContract from "./useContract";

/**
 * Resolves a wallet address to a human-readable name.
 *
 * Lookup order:
 *   1. RoleManager.getMyApplication() — returns doctor/researcher names from their applications
 *   2. PatientRegistry.getPatientByWallet() — returns patient names
 *
 * Results are cached in a module-level Map to avoid repeated contract calls
 * when the same address appears in multiple lists.
 */
const nameCache = new Map(); // lowercase address → name | null
const pendingLookups = new Map(); // lowercase address → Promise

export default function useUserName(address) {
  const roleManager = useContract("RoleManager");
  const patientRegistry = useContract("PatientRegistry");

  const [name, setName] = useState(() => {
    if (!address) return null;
    return nameCache.get(address.toLowerCase()) ?? null;
  });

  useEffect(() => {
    if (!address) {
      setName(null);
      return;
    }
    const key = address.toLowerCase();

    // Return cached result immediately
    if (nameCache.has(key)) {
      setName(nameCache.get(key));
      return;
    }

    // Dedupe concurrent lookups for the same address
    if (pendingLookups.has(key)) {
      let cancelled = false;
      pendingLookups.get(key).then((n) => {
        if (!cancelled) setName(n);
      });
      return () => {
        cancelled = true;
      };
    }

    if (!roleManager && !patientRegistry) return;

    let cancelled = false;

    const promise = (async () => {
      // 1. Try RoleManager application (doctors, researchers)
      if (roleManager) {
        try {
          const app = await roleManager.getMyApplication(address);
          if (app && app.name && app.name.length > 0) {
            nameCache.set(key, app.name);
            return app.name;
          }
        } catch {}
      }

      // 2. Try PatientRegistry
      if (patientRegistry) {
        try {
          const patient = await patientRegistry.getPatientByWallet(address);
          if (patient && patient.nameHash && patient.nameHash.length > 0) {
            nameCache.set(key, patient.nameHash);
            return patient.nameHash;
          }
        } catch {}
      }

      nameCache.set(key, null);
      return null;
    })();

    pendingLookups.set(key, promise);
    promise
      .then((n) => {
        if (!cancelled) setName(n);
      })
      .finally(() => {
        pendingLookups.delete(key);
      });

    return () => {
      cancelled = true;
    };
  }, [address, roleManager, patientRegistry]);

  return name;
}

/** Manually invalidate the cache for an address (e.g. after a profile update) */
export function invalidateUserName(address) {
  if (!address) return;
  nameCache.delete(address.toLowerCase());
}

/** Clear all cached names */
export function clearUserNameCache() {
  nameCache.clear();
}
