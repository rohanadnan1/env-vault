"use client";

import { useEffect, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';
import { FileDown, ShieldAlert, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

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
}

interface ResultSecret extends ParsedSecret {
  existing?: ExistingSecret;
  sameValueAsExisting?: boolean;
  status: 'pending' | 'success' | 'updated' | 'skipped' | 'unchanged' | 'error';
  error?: string;
}

interface ExistingSecret {
  id: string;
  keyName: string;
  valueEncrypted: string;
  iv: string;
}

interface PrecheckEntry extends ParsedSecret {
  existing?: ExistingSecret;
  sameValueAsExisting: boolean;
}

interface ImportPreviewResponse {
  targetFolderId: string | null;
  existing: ExistingSecret[];
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${className}`}>{children}</span>;
}

export function ImportModal({
  open,
  onOpenChange,
  environmentId,
  folderId,
  onSuccess,
}: ImportModalProps) {
  const [content, setContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<ResultSecret[] | null>(null);
  const [precheckEntries, setPrecheckEntries] = useState<PrecheckEntry[] | null>(null);
  const [skipExisting, setSkipExisting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  const parseEnv = (raw: string): ParsedSecret[] => {
    const lines = raw.split('\n');
    const parsed: ParsedSecret[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;

      const firstEqual = line.indexOf('=');
      if (firstEqual === -1) continue;

      const key = line.slice(0, firstEqual).trim();
      let value = line.slice(firstEqual + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      const cleanKey = key.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
      if (cleanKey) parsed.push({ key: cleanKey, value });
    }

    return parsed;
  };

  const resetState = () => {
    setResults(null);
    setContent('');
    setPrecheckEntries(null);
    setSkipExisting(false);
    setShowConfirmation(false);
    setIsChecking(false);
    setIsProcessing(false);
  };

  const handleClose = () => {
    if (isProcessing || isChecking) return;
    onOpenChange(false);
    resetState();
  };

  const handleDialogOpenChange = (val: boolean) => {
    if (isProcessing || isChecking) return;
    onOpenChange(val);
    if (!val) {
      resetState();
    }
  };

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  const preparePrecheck = async (parsedSecrets: ParsedSecret[]) => {
    if (!derivedKey) {
      toast.error('Vault is locked');
      return null;
    }

    setIsChecking(true);

    try {
      const res = await fetch('/api/secrets/import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environmentId,
          folderId,
          keys: parsedSecrets.map((s) => s.key),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to check existing variables');
      }

      const preview: ImportPreviewResponse = await res.json();
      const existingByKey = new Map(preview.existing.map((s) => [s.keyName, s]));

      const entries = await Promise.all(
        parsedSecrets.map(async (secret) => {
          const existing = existingByKey.get(secret.key);
          if (!existing) {
            return {
              ...secret,
              existing: undefined,
              sameValueAsExisting: false,
            } satisfies PrecheckEntry;
          }

          try {
            const aad = `${existing.keyName}:${environmentId}`;
            const existingValue = await decryptSecret(existing.valueEncrypted, existing.iv, derivedKey, aad);
            return {
              ...secret,
              existing,
              sameValueAsExisting: existingValue === secret.value,
            } satisfies PrecheckEntry;
          } catch {
            return {
              ...secret,
              existing,
              sameValueAsExisting: false,
            } satisfies PrecheckEntry;
          }
        })
      );

      return entries;
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Pre-check failed');
      return null;
    } finally {
      setIsChecking(false);
    }
  };

  const runImport = async (entries: PrecheckEntry[]) => {
    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    setResults(entries.map((e) => ({ ...e, status: 'pending' as const })));
    setShowConfirmation(false);
    setIsProcessing(true);
    touchActivity();

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let unchangedCount = 0;

    const updatedResults: ResultSecret[] = entries.map((e) => ({ ...e, status: 'pending' }));

    for (let i = 0; i < updatedResults.length; i++) {
      const item = updatedResults[i];

      if (item.existing && skipExisting) {
        updatedResults[i].status = 'skipped';
        skippedCount += 1;
        setResults([...updatedResults]);
        continue;
      }

      if (item.existing && item.sameValueAsExisting) {
        updatedResults[i].status = 'unchanged';
        unchangedCount += 1;
        setResults([...updatedResults]);
        continue;
      }

      try {
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
            upsertOnConflict: !skipExisting,
          }),
        });

        if (res.ok) {
          const payload = await res.json();
          if (payload.action === 'updated') {
            updatedResults[i].status = 'updated';
            updatedCount += 1;
          } else {
            updatedResults[i].status = 'success';
            importedCount += 1;
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          updatedResults[i].status = 'error';
          updatedResults[i].error = errData.error || 'Failed';
        }
      } catch (error) {
        console.error(error);
        updatedResults[i].status = 'error';
        updatedResults[i].error = 'Encryption failed';
      }

      setResults([...updatedResults]);
    }

    setIsProcessing(false);

    if (importedCount > 0 || updatedCount > 0) {
      const parts: string[] = [];
      if (importedCount > 0) parts.push(`${importedCount} imported`);
      if (updatedCount > 0) parts.push(`${updatedCount} updated`);
      if (skippedCount > 0) parts.push(`${skippedCount} kept`);
      if (unchangedCount > 0) parts.push(`${unchangedCount} unchanged`);
      toast.success(`Import complete: ${parts.join(', ')}.`);
      onSuccess();
      return;
    }

    if (skippedCount > 0 || unchangedCount > 0) {
      const parts: string[] = [];
      if (skippedCount > 0) parts.push(`${skippedCount} kept`);
      if (unchangedCount > 0) parts.push(`${unchangedCount} unchanged`);
      toast.success(`No new writes needed: ${parts.join(', ')}.`);
      return;
    }

    toast.error('No variables were imported.');
  };

  const handleParseAndCheck = async () => {
    const parsedSecrets = parseEnv(content);
    if (parsedSecrets.length === 0) {
      toast.error('No valid key-value pairs found');
      return;
    }

    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    const entries = await preparePrecheck(parsedSecrets);
    if (!entries) return;

    setPrecheckEntries(entries);

    const existingCount = entries.filter((e) => Boolean(e.existing)).length;
    if (existingCount > 0) {
      setShowConfirmation(true);
      return;
    }

    await runImport(entries);
  };

  const existingCount = precheckEntries?.filter((e) => Boolean(e.existing)).length ?? 0;
  const changedExistingCount = precheckEntries?.filter((e) => Boolean(e.existing) && !e.sameValueAsExisting).length ?? 0;
  const unchangedExistingCount = precheckEntries?.filter((e) => Boolean(e.existing) && e.sameValueAsExisting).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={handleDialogOpenChange}
    >
      <DialogContent className="sm:max-w-[640px] max-h-[90vh] flex flex-col">
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
          {!results && !showConfirmation ? (
            <div className="space-y-4 h-full flex flex-col">
              <div className="flex-1">
                <Label htmlFor="env-content" className="mb-2 block">.env Content</Label>
                <Textarea
                  id="env-content"
                  placeholder="PORT=3000&#10;DATABASE_URL=postgres://...&#10;# This is a comment"
                  className="font-mono text-sm h-[300px] resize-none"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={isProcessing || isChecking}
                />
              </div>
              <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Keys are converted to <strong>UPPERCASE_WITH_UNDERSCORES</strong>. We will check for existing keys before saving.
                </p>
              </div>
            </div>
          ) : null}

          {showConfirmation && precheckEntries ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                <p className="text-sm font-semibold text-indigo-900">
                  {existingCount} existing key{existingCount === 1 ? '' : 's'} found.
                </p>
                <p className="text-xs text-indigo-800 mt-1">
                  {changedExistingCount} key{changedExistingCount === 1 ? '' : 's'} have changed values and can be updated.
                  {" "}
                  {unchangedExistingCount} key{unchangedExistingCount === 1 ? '' : 's'} are identical and will not create a new version.
                </p>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Keep existing values</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Turn on to skip existing keys. Turn off to replace changed values.
                    </p>
                  </div>
                  <Switch checked={skipExisting} onCheckedChange={setSkipExisting} />
                </div>

                {!skipExisting && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    Replacing keys only updates history when the imported value is different. If value is the same,
                    version history is not incremented.
                  </div>
                )}
              </div>

              <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                {precheckEntries.map((item, idx) => (
                  <div key={`${item.key}-${idx}`} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                    <span className="font-mono text-xs font-bold text-slate-900">{item.key}</span>
                    {item.existing ? (
                      item.sameValueAsExisting ? (
                        <Badge className="text-[10px] text-slate-700 border border-slate-200 bg-slate-100">Unchanged</Badge>
                      ) : (
                        <Badge className="text-[10px] text-indigo-700 border border-indigo-200 bg-indigo-50">Will Replace</Badge>
                      )
                    ) : (
                      <Badge className="text-[10px] text-emerald-700 border border-emerald-200 bg-emerald-50">New</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {results ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold mb-4 text-slate-700">Import Progress:</p>
              {results.map((item, idx) => (
                <div key={`${item.key}-${idx}`} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-slate-900">{item.key}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'pending' && <div className="w-3 h-3 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />}
                    {item.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {item.status === 'updated' && <Badge className="text-[10px] text-indigo-700 border border-indigo-200 bg-indigo-50">Updated</Badge>}
                    {item.status === 'skipped' && <Badge className="text-[10px] text-slate-700 border border-slate-200 bg-slate-100">Kept</Badge>}
                    {item.status === 'unchanged' && <Badge className="text-[10px] text-slate-700 border border-slate-200 bg-slate-100">Unchanged</Badge>}
                    {item.status === 'error' && (
                      <div title={item.error}>
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter className="pt-4 border-t border-slate-100">
          {!results && !showConfirmation ? (
            <>
              <Button variant="ghost" onClick={handleClose} disabled={isChecking}>
                Cancel
              </Button>
              <Button onClick={handleParseAndCheck} disabled={!content.trim() || isProcessing || isChecking}>
                {isChecking ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  'Parse & Continue'
                )}
              </Button>
            </>
          ) : null}

          {showConfirmation && precheckEntries ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setShowConfirmation(false)}
                disabled={isProcessing || isChecking}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={() => runImport(precheckEntries)}
                disabled={isProcessing || isChecking}
              >
                {skipExisting ? 'Import New + Keep Existing' : 'Import & Replace Changed'}
              </Button>
            </>
          ) : null}

          {results ? (
            <Button onClick={handleClose} disabled={isProcessing}>
              {isProcessing ? 'Importing...' : 'Close'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
