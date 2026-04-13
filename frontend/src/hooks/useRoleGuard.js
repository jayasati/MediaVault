import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import useWallet from "./useWallet";
import useContract from "./useContract";
import { useWalletStore } from "@/store";
import { clearWalletCache } from "@/utils/storage";

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

const ROLE_CHECK_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, label = "Operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export default function useRoleGuard(requiredRole) {
  const { walletAddress, isConnected } = useWallet();
  const roleManager = useContract("RoleManager");
  const setRole = useWalletStore((s) => s.setRole);
  const navigate = useNavigate();

  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isConnected) {
      navigate("/");
      return;
    }

    if (!roleManager || !walletAddress) {
      setChecking(true);
      return;
    }

    let cancelled = false;
    setTimedOut(false);

    const verify = async () => {
      setChecking(true);
      try {
        const onChainRole = Number(
          await withTimeout(
            roleManager.getRole(walletAddress),
            ROLE_CHECK_TIMEOUT_MS,
            "Role check"
          )
        );
        if (cancelled) return;

        const allowedRoles = ROLE_MAP[requiredRole] || [];

        if (allowedRoles.includes(onChainRole)) {
          setVerified(true);
          setRole(requiredRole);
        } else if (onChainRole === 0) {
          // User has no role on-chain — clear cached dashboard data
          clearWalletCache(walletAddress);
          toast.error("You're not registered. Please register on the home page.", {
            id: "role-denied",
          });
          navigate("/");
        } else {
          // Different valid role — redirect to correct dashboard
          const correctPath = ROLE_PATHS[onChainRole];
          const roleName = ROLE_NAMES[onChainRole];
          toast.error(`You're registered as ${roleName}. Redirecting...`, {
            id: "role-redirect",
          });
          if (correctPath && correctPath !== window.location.pathname) {
            navigate(correctPath);
          } else {
            navigate("/");
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Role verification failed:", err);
        if (err.message && err.message.includes("timed out")) {
          setTimedOut(true);
          toast.error(
            "Role check timed out. Check your network connection or RPC endpoint.",
            { id: "role-timeout" }
          );
        } else {
          toast.error("Failed to verify role on-chain.", { id: "role-error" });
          navigate("/");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    verify();
    return () => {
      cancelled = true;
    };
  }, [isConnected, walletAddress, roleManager, requiredRole, navigate, setRole, attempt]);

  const retry = () => setAttempt((a) => a + 1);

  return { verified, checking, timedOut, retry };
}
