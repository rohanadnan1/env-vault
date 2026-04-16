"use client";

import { useVaultStore, useAutoLock } from '@/lib/store/vaultStore';
import { VaultUnlock } from '@/components/vault/VaultUnlock';
import { useEffect } from 'react';

export function VaultClientWrapper({ children }: { children: React.ReactNode }) {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const lock = useVaultStore((s) => s.lock);
  
  useAutoLock(); // using default 15 mins
  
  useEffect(() => {
    const handleVisibility = () => {
      // Lock vault when document becomes hidden
      if (document.hidden) {
        lock();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    return () => window.removeEventListener('visibilitychange', handleVisibility);
  }, [lock]);

  return (
    <>
      {!isUnlocked && <VaultUnlock />}
      {children}
    </>
  );
}
