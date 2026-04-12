import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import useWallet from "./useWallet";
import useContract from "./useContract";
import { useWalletStore } from "@/store";

/**
 * On-chain role verification guard.
 * Checks the RoleManager contract to verify the connected wallet
 * actually has the required role.
 *
 * Role enum in Solidity:
 *   0=NONE, 1=PATIENT, 2=DOCTOR, 3=RESEARCHER, 4=ADMIN, 5=SUPER_ADMIN
 */
const ROLE_MAP = {
  patient: [1],
  doctor: [2],
  researcher: [3],
  admin: [4],
  super_admin: [5],
};

const ROLE_PATHS = {
  1: "/patient",
  2: "/doctor",
  3: "/researcher",
  4: "/admin",
  5: "/super-admin",
};

const ROLE_NAMES = {
  0: "no role",
  1: "patient",
  2: "doctor",
  3: "researcher",
  4: "admin",
  5: "super admin",
};

export default function useRoleGuard(requiredRole) {
  const { walletAddress, isConnected } = useWallet();
  const roleManager = useContract("RoleManager");
  const setRole = useWalletStore((s) => s.setRole);
  const navigate = useNavigate();

  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isConnected) {
      navigate("/");
      return;
    }

    // Wait for contract instance — don't bail out, just keep checking state true
    if (!roleManager || !walletAddress) {
      setChecking(true);
      return;
    }

    let cancelled = false;

    const verify = async () => {
      setChecking(true);
      try {
        const onChainRole = Number(await roleManager.getRole(walletAddress));
        if (cancelled) return;

        const allowedRoles = ROLE_MAP[requiredRole] || [];

        if (allowedRoles.includes(onChainRole)) {
          // Correct role
          setVerified(true);
          setRole(requiredRole);
        } else if (onChainRole === 0) {
          // No on-chain role at all
          toast.error("You're not registered. Please register on the home page.", { id: "role-denied" });
          navigate("/");
        } else {
          // Wrong dashboard but valid role — redirect to correct dashboard
          const correctPath = ROLE_PATHS[onChainRole];
          const roleName = ROLE_NAMES[onChainRole];
          toast.error(`You're registered as ${roleName}. Redirecting...`, { id: "role-redirect" });
          if (correctPath && correctPath !== window.location.pathname) {
            navigate(correctPath);
          } else {
            navigate("/");
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Role verification failed:", err);
        toast.error("Failed to verify role on-chain. Check your network connection.", { id: "role-error" });
        navigate("/");
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, [isConnected, walletAddress, roleManager, requiredRole, navigate, setRole]);

  return { verified, checking };
}
