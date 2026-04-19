"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Copy, Trash2, History, Check, AlertTriangle, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';
import { SecretHistoryModal } from './SecretHistoryModal';
import { cn } from '@/lib/utils';

interface SecretRowProps {
  id: string;
  keyName: string;
  valueEncrypted: string;
  iv: string;
  tags?: string;
  environmentId: string;
  folderId: string | null;
  onEdit?: () => void;
  onShowHistory?: () => void;
}

interface RevealState {
  isRevealed: boolean;
  decryptedValue: string | null;
  countdown: number;
}

export function SecretRow({
  id,
  keyName,
  valueEncrypted,
  iv,
  tags = "",
  environmentId,
  folderId,
}: SecretRowProps) {
  const router = useRouter();
  const [revealState, setRevealState] = useState<RevealState>({
    isRevealed: false,
    decryptedValue: null,
    countdown: 0,
  });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  const REVEAL_DURATION = 30;

  // Optimized atomic timer effect
  useEffect(() => {
    if (!revealState.isRevealed) return;

    if (revealState.countdown === 0) {
      setRevealState({ isRevealed: false, decryptedValue: null, countdown: 0 });
      return;
    }

    const timer = setInterval(() => {
      setRevealState(prev => ({
        ...prev,
        countdown: Math.max(0, prev.countdown - 1)
      }));
    }, 1000);

    return () => clearInterval(timer);
  }, [revealState.isRevealed, revealState.countdown]);

  // Handle clipboard clear timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isCopied) {
      timer = setTimeout(() => {
        setIsCopied(false);
        try {
          if (document.hasFocus()) {
            navigator.clipboard.writeText('');
          }
        } catch (err) {
          console.error('Failed to clear clipboard:', err);
        }
      }, REVEAL_DURATION * 1000);
    }
    return () => clearTimeout(timer);
  }, [isCopied]);

  const handleReveal = async () => {
    if (revealState.isRevealed) {
      setRevealState({ isRevealed: false, decryptedValue: null, countdown: 0 });
      return;
    }

    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    setIsDecrypting(true);
    touchActivity();
    
    try {
      await new Promise(r => setTimeout(r, 10));
      const aad = `${keyName}:${environmentId}`;
      const decrypted = await decryptSecret(valueEncrypted, iv, derivedKey, aad);
      
      // Atomic update of all reveal states
      setRevealState({
        isRevealed: true,
        decryptedValue: decrypted,
        countdown: REVEAL_DURATION,
      });
      
      console.log(`[SecretRow] Decrypted ${keyName}: length=${decrypted.length}`);
    } catch (err) {
      console.error('[SecretRow] Decryption failed:', err);
      toast.error('Decryption failed. Check your master password.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleCopy = async () => {
    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    try {
      const aad = `${keyName}:${environmentId}`;
      const decrypted = await decryptSecret(valueEncrypted, iv, derivedKey, aad);
      await navigator.clipboard.writeText(decrypted);
      setIsCopied(true);
      toast.success('Copied to clipboard. Will clear in 30s.');
      touchActivity();
    } catch (err) {
      console.error(err);
      toast.error('Failed to copy secret');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/secrets/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete secret');
      }

      toast.success('Secret deleted successfully');
      setIsDeleteOpen(false);
      router.refresh(); // Update the server component list
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete secret');
      setIsDeleting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/envvault', JSON.stringify({ type: 'secret', id, sourceId: folderId }));
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="flex items-center justify-between p-3 border-b border-slate-100 hover:bg-slate-50/80 transition-colors group"
    >
      <GripVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 shrink-0 cursor-grab mr-1 transition-colors" />
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="flex flex-col min-w-0 w-full">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-slate-900 truncate tracking-tight">{keyName}</span>
            {tags.split(',').filter(Boolean).map(tag => (
              <Badge key={tag} variant="outline" className="text-[10px] h-4 px-1 text-slate-400 border-slate-200">
                {tag}
              </Badge>
            ))}
          </div>
          
          <div className="mt-1.5 flex items-start gap-3 w-full">
            <div className={cn(
              "font-mono text-xs flex-1 transition-all",
              revealState.isRevealed 
                ? "text-slate-900 bg-slate-100/80 p-2.5 rounded-lg border border-slate-200 shadow-inner break-all whitespace-pre-wrap ring-1 ring-slate-900/5" 
                : "text-slate-400 py-1 truncate max-w-[300px]"
            )}>
              {revealState.isRevealed ? (
                <span className="font-medium select-all leading-relaxed whitespace-pre-wrap">{revealState.decryptedValue}</span>
              ) : (
                <span className="tracking-widest">••••••••••••••••</span>
              )}
            </div>
            {revealState.isRevealed && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-bold bg-indigo-600 text-white shrink-0 mt-1 shadow-sm">
                {revealState.countdown}s
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity ml-4">
        <Button 
          variant="ghost" 
          size="icon" 
          className={cn("h-8 w-8", revealState.isRevealed ? "text-indigo-600 bg-indigo-50" : "text-slate-400")}
          onClick={handleReveal}
          disabled={isDecrypting}
          title={revealState.isRevealed ? "Hide secret" : "Reveal secret"}
        >
          {isDecrypting ? (
            <div className="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
          ) : revealState.isRevealed ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          className={cn("h-8 w-8", isCopied ? "text-emerald-600 bg-emerald-50" : "text-slate-400")}
          onClick={handleCopy}
          title="Copy secret"
        >
          {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </Button>

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-slate-100"
          onClick={() => setIsHistoryOpen(true)}
          title="Value history"
        >
          <History className="w-4 h-4" />
        </Button>

        <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <DialogTrigger 
            render={
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                title="Delete secret"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            }
          />
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-rose-600 font-bold">
                <AlertTriangle className="w-5 h-5" />
                Delete Secret?
              </DialogTitle>
              <DialogDescription className="pt-2 text-slate-600 font-medium">
                Are you sure you want to delete <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">{keyName}</span>?
              </DialogDescription>
              <p className="text-sm text-slate-400 pt-2 italic">This action cannot be undone and will purge all history for this key.</p>
            </DialogHeader>
            <DialogFooter className="pt-6 sm:justify-between gap-3">
              <Button 
                variant="ghost" 
                onClick={() => setIsDeleteOpen(false)}
                disabled={isDeleting}
                className="rounded-xl flex-1 border border-slate-200"
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleDelete}
                disabled={isDeleting}
                className="rounded-xl flex-1 font-bold shadow-lg shadow-rose-200"
              >
                {isDeleting ? "Deleting..." : "Delete Permanently"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <SecretHistoryModal 
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        secretId={id}
        keyName={keyName}
        environmentId={environmentId}
      />
    </div>
  );
}
