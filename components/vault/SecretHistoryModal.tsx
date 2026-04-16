"use client";

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, Clock, History } from 'lucide-react';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';

interface HistoryItem {
  id: string;
  valueEncrypted: string;
  iv: string;
  createdAt: string;
}

interface SecretHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretId: string;
  keyName: string;
  environmentId: string;
}

export function SecretHistoryModal({
  open,
  onOpenChange,
  secretId,
  keyName,
  environmentId
}: SecretHistoryModalProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Record<string, string>>({});
  
  const derivedKey = useVaultStore((s) => s.derivedKey);

  useEffect(() => {
    if (open) {
      fetchHistory();
    } else {
      setRevealedIds({});
    }
  }, [open]);

  async function fetchHistory() {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/secrets/${secretId}/history`);
      if (!res.ok) throw new Error('Failed to fetch history');
      const data = await res.json();
      setHistory(data);
    } catch (err) {
      toast.error('Could not load history');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReveal(item: HistoryItem) {
    if (revealedIds[item.id]) {
      const newRevealed = { ...revealedIds };
      delete newRevealed[item.id];
      setRevealedIds(newRevealed);
      return;
    }

    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    try {
      const aad = `${keyName}:${environmentId}`;
      const decrypted = await decryptSecret(item.valueEncrypted, item.iv, derivedKey, aad);
      setRevealedIds({ ...revealedIds, [item.id]: decrypted });
    } catch (err) {
      toast.error('Decryption failed');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" />
            Secret History
          </DialogTitle>
          <DialogDescription>
            Viewing version history for <span className="font-mono font-bold text-slate-900">{keyName}</span>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-3">
          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm italic">
              No previous versions found.
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="p-3 border border-slate-100 rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-medium font-mono">
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(item.createdAt).toLocaleString()}
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                    onClick={() => handleReveal(item)}
                  >
                    {revealedIds[item.id] ? (
                      <><EyeOff className="w-3.5 h-3.5 mr-1.5" /> Hide</>
                    ) : (
                      <><Eye className="w-3.5 h-3.5 mr-1.5" /> Reveal</>
                    )}
                  </Button>
                </div>
                {revealedIds[item.id] ? (
                  <div className="p-2 bg-white rounded border border-indigo-100 font-mono text-xs text-indigo-700 break-all select-all animate-in fade-in slide-in-from-top-1 duration-200">
                    {revealedIds[item.id]}
                  </div>
                ) : (
                  <div className="p-2 bg-slate-100/50 rounded border border-slate-100 font-mono text-xs text-slate-300">
                    ••••••••••••••••••••••••••••••••
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
