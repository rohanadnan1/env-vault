"use client";

import { useVaultStore } from '@/lib/store/vaultStore';
import { Button } from '@/components/ui/button';
import { Unlock, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function VaultLockButton() {
  const lock = useVaultStore((s) => s.lock);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const router = useRouter();

  if (!isUnlocked) {
    return (
      <div className="p-2 border border-slate-200 rounded-md bg-slate-50 items-center justify-center hidden sm:flex" title="Vault is locked">
         <Lock className="w-4 h-4 text-slate-400" />
      </div>
    );
  }

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={() => {
        lock();
        router.push('/dashboard');
      }}
      className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 font-medium"
      title="Lock vault immediately"
    >
      <Unlock className="w-4 h-4 mr-2" />
      Lock Vault
    </Button>
  );
}
