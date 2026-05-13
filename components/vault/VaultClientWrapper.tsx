"use client";

import { useVaultStore, useAutoLock, readKeepVaultUnlockedInTab } from '@/lib/store/vaultStore';
import { VaultUnlock } from '@/components/vault/VaultUnlock';
import { UsernameRequiredModal } from '@/components/account/UsernameRequiredModal';
import { useEffect } from 'react';
import { toast } from 'sonner';

export function VaultClientWrapper({ children }: { children: React.ReactNode }) {
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const lock = useVaultStore((s) => s.lock);
  
  useAutoLock(); // using default 15 mins
  
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && !readKeepVaultUnlockedInTab()) {
        lock();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    return () => window.removeEventListener('visibilitychange', handleVisibility);
  }, [lock]);

  useEffect(() => {
    if (!isUnlocked) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l';
      if (!isShortcut) return;
      event.preventDefault();
      lock();
      toast.success('Vault locked');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isUnlocked, lock]);

  return (
    <>
      {!isUnlocked && <VaultUnlock />}
      {isUnlocked && <UsernameRequiredModal />}
      {children}
    </>
  );
}
