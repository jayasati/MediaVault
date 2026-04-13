/**
 * Clear all MediVault cached data for a specific wallet (revoked user, disconnect, etc.)
 *
 * Clears:
 *   - Records (IPFS metadata cache)
 *   - Marketplace opt-in flag
 *   - Any other wallet-scoped cache keys
 */
export function clearWalletCache(walletAddress) {
  if (!walletAddress) return;
  const addr = walletAddress.toLowerCase();
  // Collect keys to delete (can't delete while iterating)
  const keysToDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    // Match any medivault-* key that contains this wallet address
    if (key.startsWith("medivault-") && key.toLowerCase().includes(addr)) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    localStorage.removeItem(key);
  }
}

/** Clear all MediVault caches regardless of wallet */
export function clearAllCache() {
  const keysToDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("medivault-")) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    localStorage.removeItem(key);
  }
}
