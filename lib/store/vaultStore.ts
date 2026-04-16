import { create } from 'zustand';
import { useEffect } from 'react';

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

    // Read timeout from localStorage (minutes)
    const saved = localStorage.getItem("envault_autolock");
    const timeoutMins = saved ? parseInt(saved, 10) : 15;
    
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
