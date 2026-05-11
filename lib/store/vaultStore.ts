import { create } from 'zustand';
import { useEffect } from 'react';

export const VAULT_AUTOLOCK_KEY = 'envault_autolock';
export const VAULT_KEEP_UNLOCKED_IN_TAB_KEY = 'envault_keep_unlocked_in_tab';

export function readVaultAutoLockMinutes() {
  if (typeof window === 'undefined') return 15;
  const saved = window.localStorage.getItem(VAULT_AUTOLOCK_KEY);
  const parsed = saved ? parseInt(saved, 10) : 15;
  return Number.isFinite(parsed) ? parsed : 15;
}

export function readKeepVaultUnlockedInTab() {
  if (typeof window === 'undefined') return false;
  return window.sessionStorage.getItem(VAULT_KEEP_UNLOCKED_IN_TAB_KEY) === 'true';
}

export function writeKeepVaultUnlockedInTab(enabled: boolean) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(VAULT_KEEP_UNLOCKED_IN_TAB_KEY, enabled ? 'true' : 'false');
}

interface VaultStore {
  derivedKey: CryptoKey | null;
  isUnlocked: boolean;
  lastActivity: number;
  isBiometricSupported: boolean;
  isBiometricEnrolled: boolean;
  unlock: (key: CryptoKey) => void;
  lock: () => void;
  touchActivity: () => void;
  setBiometricSupport: (supported: boolean) => void;
  setBiometricEnrolled: (enrolled: boolean) => void;
}

export const useVaultStore = create<VaultStore>((set) => ({
  derivedKey: null,
  isUnlocked: false,
  lastActivity: 0,
  isBiometricSupported: false,
  isBiometricEnrolled: false,
  unlock: (key) => set({ derivedKey: key, isUnlocked: true, lastActivity: Date.now() }),
  lock: () => set({ derivedKey: null, isUnlocked: false }),
  touchActivity: () => set({ lastActivity: Date.now() }),
  setBiometricSupport: (supported) => set({ isBiometricSupported: supported }),
  setBiometricEnrolled: (enrolled) => set({ isBiometricEnrolled: enrolled }),
}));

export function useAutoLock() {
  const lastActivity = useVaultStore((s) => s.lastActivity);
  const lock = useVaultStore((s) => s.lock);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);

  useEffect(() => {
    if (!isUnlocked) return;

    if (readKeepVaultUnlockedInTab()) return;

    const timeoutMins = readVaultAutoLockMinutes();

    // 0 means "Never"
    if (timeoutMins === 0) return;

    const timeoutMs = timeoutMins * 60 * 1000;

    const interval = setInterval(() => {
      if (Date.now() - lastActivity > timeoutMs) {
        lock();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [lastActivity, isUnlocked, lock]);
}
