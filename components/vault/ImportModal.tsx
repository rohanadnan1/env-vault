"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';
import { FileDown, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: string;
  folderId: string | null;
  onSuccess: () => void;
}

interface ParsedSecret {
  key: string;
  value: string;
  status?: 'pending' | 'success' | 'error' | 'duplicate';
  error?: string;
}

export function ImportModal({
  open,
  onOpenChange,
  environmentId,
  folderId,
  onSuccess
}: ImportModalProps) {
  const [content, setContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ParsedSecret[] | null>(null);
  
  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  const parseEnv = (raw: string): ParsedSecret[] => {
    const lines = raw.split('\n');
    const parsed: ParsedSecret[] = [];
    
    for (let line of lines) {
      line = line.trim();
      // Skip comments and empty lines
      if (!line || line.startsWith('#')) continue;
      
      const firstEqual = line.indexOf('=');
      if (firstEqual === -1) continue;
      
      const key = line.slice(0, firstEqual).trim();
      let value = line.slice(firstEqual + 1).trim();
      
      // Remove optional quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // Clean key (uppercase, underscores)
      const cleanKey = key.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
      
      if (cleanKey) {
        parsed.push({ key: cleanKey, value, status: 'pending' });
      }
    }
    return parsed;
  };

  const handleImport = async () => {
    const secrets = parseEnv(content);
    if (secrets.length === 0) {
      toast.error('No valid key-value pairs found');
      return;
    }

    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    setResults(secrets);
    setIsProcessing(true);
    touchActivity();

    let successCount = 0;
    const updatedResults = [...secrets];

    for (let i = 0; i < updatedResults.length; i++) {
      const item = updatedResults[i];
      try {
        // Enforce re-encryption with derived key + AAD
        const aad = `${item.key}:${environmentId}`;
        const { valueEncrypted, iv } = await encryptSecret(item.value, derivedKey, aad);

        const res = await fetch('/api/secrets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keyName: item.key,
            valueEncrypted,
            iv,
            environmentId,
            folderId,
          }),
        });

        if (res.ok) {
          updatedResults[i].status = 'success';
          successCount++;
        } else {
          const errData = await res.json();
          updatedResults[i].status = errData.error?.includes('unique constraint') ? 'duplicate' : 'error';
          updatedResults[i].error = errData.error || 'Failed';
        }
      } catch (err) {
        updatedResults[i].status = 'error';
        updatedResults[i].error = 'Encryption failed';
      }
      setResults([...updatedResults]);
    }

    setIsProcessing(false);
    if (successCount > 0) {
      toast.success(`Successfully imported ${successCount} secrets`);
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!isProcessing) {
        onOpenChange(val);
        if (!val) {
          setResults(null);
          setContent('');
        }
      }
    }}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="w-5 h-5 text-indigo-600" />
            Bulk Import Secrets
          </DialogTitle>
          <DialogDescription>
            Paste your .env content below. Each key will be encrypted in your browser before being saved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-[300px] py-4">
          {!results ? (
            <div className="space-y-4 h-full flex flex-col">
              <div className="flex-1">
                <Label htmlFor="env-content" className="mb-2 block">.env Content</Label>
                <Textarea
                  id="env-content"
                  placeholder="PORT=3000&#10;DATABASE_URL=postgres://...&#10;# This is a comment"
                  className="font-mono text-sm h-[300px] resize-none"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Keys will be automatically converted to <strong>UPPERCASE_WITH_UNDERSCORES</strong>. 
                  Duplicates in the same folder will be skipped.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-semibold mb-4 text-slate-700">Import Progress:</p>
              {results.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-slate-900">{item.key}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'pending' && <div className="w-3 h-3 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />}
                    {item.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {item.status === 'duplicate' && (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">Duplicate</Badge>
                    )}
                    {item.status === 'error' && (
                      <div title={item.error}>
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t border-slate-100">
          {!results ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleImport} disabled={!content.trim() || isProcessing}>
                {isProcessing ? "Processing..." : "Parse & Import"}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)} disabled={isProcessing}>
              {isProcessing ? "Importing..." : "Close"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Badge({ children, className, variant }: any) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{children}</span>;
}
