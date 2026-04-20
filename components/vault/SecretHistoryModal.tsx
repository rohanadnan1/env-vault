"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Clock, History, Copy, Check } from 'lucide-react';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';

interface HistoryItem {
  id: string;
  valueEncrypted: string;
  iv: string;
  revisionNumber: number;
  previousHistoryId: string | null;
  createdAt: string;
}

interface HistoryResponse {
  history: HistoryItem[];
  graph?: {
    nodes: Array<{ id: string; revisionNumber: number; createdAt: string }>;
    edges: Array<{ from: string; to: string }>;
  };
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const derivedKey = useVaultStore((s) => s.derivedKey);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/secrets/${secretId}/history`);
      if (!res.ok) throw new Error('Failed to fetch history');
      const data: HistoryResponse | HistoryItem[] = await res.json();
      const normalized = Array.isArray(data) ? data : data.history;
      setHistory(normalized);
    } catch (err) {
      console.error(err);
      toast.error('Could not load history');
    } finally {
      setIsLoading(false);
    }
  }, [secretId]);

  useEffect(() => {
    if (open) {
      fetchHistory();
    } else {
      setRevealedIds({});
    }
  }, [open, fetchHistory]);

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
      console.error(err);
      toast.error('Decryption failed');
    }
  }

  async function handleCopy(item: HistoryItem) {
    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    try {
      const aad = `${keyName}:${environmentId}`;
      const value = revealedIds[item.id] || await decryptSecret(item.valueEncrypted, item.iv, derivedKey, aad);
      await navigator.clipboard.writeText(value);
      setCopiedId(item.id);
      toast.success(`Copied version v${item.revisionNumber}`);
      setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 1200);
    } catch (err) {
      console.error(err);
      toast.error('Copy failed');
    }
  }

  const revisionById = useMemo(() => {
    return new Map(history.map((item) => [item.id, item.revisionNumber]));
  }, [history]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-500" />
            Secret History
          </DialogTitle>
          <DialogDescription>
            Viewing version history for <span className="font-mono font-bold text-slate-900">{keyName}</span>.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-3 flex-1 min-h-0 overflow-y-auto overflow-x-hidden pr-1">
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
                  <div className="flex items-center gap-2 text-xs text-slate-400 font-medium font-mono flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold">
                      v{item.revisionNumber}
                    </span>
                    <Clock className="w-3.5 h-3.5" />
                    {new Date(item.createdAt).toLocaleString()}
                    {item.previousHistoryId && revisionById.has(item.previousHistoryId) && (
                      <span className="text-slate-400">
                        linked to v{revisionById.get(item.previousHistoryId)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                      onClick={() => handleCopy(item)}
                    >
                      {copiedId === item.id ? (
                        <><Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> Copied</>
                      ) : (
                        <><Copy className="w-3.5 h-3.5 mr-1.5" /> Copy</>
                      )}
                    </Button>
                  </div>
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
