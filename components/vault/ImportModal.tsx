"use client";

import { useEffect, useRef, useState } from 'react';
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
import { LoadingInfoPanel } from '@/components/vault/LoadingInfoPanel';
import { toast } from 'sonner';
import {
  FileDown, ShieldAlert, CheckCircle2, AlertCircle, RefreshCw, ArrowLeft,
  Lock, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
  status: 'pending' | 'encrypting' | 'success' | 'updated' | 'skipped' | 'unchanged' | 'error' | 'conflict';
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

type ImportPhase = 'idle' | 'encrypting' | 'saving' | 'done';

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
  const [importPhase, setImportPhase] = useState<ImportPhase>('idle');
  const [encryptProgress, setEncryptProgress] = useState(0);
  const [encryptTotal, setEncryptTotal] = useState(0);
  const [sessionId, setSessionId] = useState('');

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
    setImportPhase('idle');
    setEncryptProgress(0);
    setEncryptTotal(0);
  };

  const handleClose = () => {
    if (isProcessing || isChecking) return;
    onOpenChange(false);
    resetState();
  };

  const handleDialogOpenChange = (val: boolean) => {
    if (isProcessing || isChecking) return;
    onOpenChange(val);
    if (!val) resetState();
  };

  useEffect(() => {
    if (!open) resetState();
  }, [open]);

  const preparePrecheck = async (parsedSecrets: ParsedSecret[]) => {
    if (!derivedKey) { toast.error('Vault is locked'); return null; }
    setIsChecking(true);
    try {
      const res = await fetch('/api/secrets/import-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environmentId, folderId, keys: parsedSecrets.map((s) => s.key) }),
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
          if (!existing) return { ...secret, existing: undefined, sameValueAsExisting: false } satisfies PrecheckEntry;
          try {
            const aad = `${existing.keyName}:${environmentId}`;
            const existingValue = await decryptSecret(existing.valueEncrypted, existing.iv, derivedKey, aad);
            return { ...secret, existing, sameValueAsExisting: existingValue === secret.value } satisfies PrecheckEntry;
          } catch {
            return { ...secret, existing, sameValueAsExisting: false } satisfies PrecheckEntry;
          }
        })
      );

      return entries;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pre-check failed');
      return null;
    } finally {
      setIsChecking(false);
    }
  };

  const runImport = async (entries: PrecheckEntry[]) => {
    if (!derivedKey) { toast.error('Vault is locked'); return; }

    const sid = Date.now().toString();
    setSessionId(sid);
    setShowConfirmation(false);
    setIsProcessing(true);
    touchActivity();

    // Build initial result list with skip/unchanged resolved client-side
    const initialResults: ResultSecret[] = entries.map((e) => {
      if (e.existing && skipExisting) return { ...e, status: 'skipped' as const };
      if (e.existing && e.sameValueAsExisting) return { ...e, status: 'unchanged' as const };
      return { ...e, status: 'pending' as const };
    });
    setResults(initialResults);

    // Items that actually need encryption + DB write
    const toWrite = initialResults
      .map((r, idx) => ({ ...r, originalIdx: idx }))
      .filter((r) => r.status === 'pending');

    if (toWrite.length === 0) {
      setImportPhase('done');
      setIsProcessing(false);
      const skippedCount = initialResults.filter((r) => r.status === 'skipped').length;
      const unchangedCount = initialResults.filter((r) => r.status === 'unchanged').length;
      const parts: string[] = [];
      if (skippedCount > 0) parts.push(`${skippedCount} kept`);
      if (unchangedCount > 0) parts.push(`${unchangedCount} unchanged`);
      toast.success(`No new writes needed: ${parts.join(', ')}.`);
      return;
    }

    // Phase 1: parallel encryption
    setImportPhase('encrypting');
    setEncryptTotal(toWrite.length);
    setEncryptProgress(0);

    const workingResults = [...initialResults];
    toWrite.forEach(({ originalIdx }) => {
      workingResults[originalIdx] = { ...workingResults[originalIdx], status: 'encrypting' };
    });
    setResults([...workingResults]);

    let encDone = 0;
    const encrypted = await Promise.all(
      toWrite.map(async ({ key, value, originalIdx }) => {
        const aad = `${key}:${environmentId}`;
        try {
          const result = await encryptSecret(value, derivedKey, aad);
          encDone++;
          setEncryptProgress(encDone);
          return { keyName: key, originalIdx, ...result, error: null };
        } catch {
          encDone++;
          setEncryptProgress(encDone);
          return { keyName: key, originalIdx, valueEncrypted: '', iv: '', error: 'Encryption failed' };
        }
      })
    );

    // Mark encryption errors immediately
    const encryptFailed = encrypted.filter((e) => e.error);
    encryptFailed.forEach(({ originalIdx, error }) => {
      workingResults[originalIdx] = { ...workingResults[originalIdx], status: 'error', error: error ?? undefined };
    });
    const toSend = encrypted.filter((e) => !e.error);

    if (toSend.length === 0) {
      setImportPhase('done');
      setIsProcessing(false);
      setResults([...workingResults]);
      toast.error('All encryptions failed. Please try again.');
      return;
    }

    // Phase 2: single batch POST
    setImportPhase('saving');

    try {
      const res = await fetch('/api/secrets/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          environmentId,
          folderId,
          upsertOnConflict: !skipExisting,
          items: toSend.map(({ keyName, valueEncrypted, iv }) => ({ keyName, valueEncrypted, iv })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Batch import failed');
      }

      const { results: batchResults } = await res.json() as {
        results: { keyName: string; action: 'created' | 'updated' | 'conflict' }[];
      };

      const actionByKey = new Map(batchResults.map((r) => [r.keyName, r.action]));

      toSend.forEach(({ keyName, originalIdx }) => {
        const action = actionByKey.get(keyName);
        if (action === 'created') workingResults[originalIdx] = { ...workingResults[originalIdx], status: 'success' };
        else if (action === 'updated') workingResults[originalIdx] = { ...workingResults[originalIdx], status: 'updated' };
        else if (action === 'conflict') workingResults[originalIdx] = { ...workingResults[originalIdx], status: 'skipped' };
        else workingResults[originalIdx] = { ...workingResults[originalIdx], status: 'error', error: 'Unknown response' };
      });

      setResults([...workingResults]);

      const importedCount = workingResults.filter((r) => r.status === 'success').length;
      const updatedCount = workingResults.filter((r) => r.status === 'updated').length;
      const skippedCount = workingResults.filter((r) => r.status === 'skipped').length;
      const unchangedCount = workingResults.filter((r) => r.status === 'unchanged').length;

      if (importedCount > 0 || updatedCount > 0) {
        const parts: string[] = [];
        if (importedCount > 0) parts.push(`${importedCount} imported`);
        if (updatedCount > 0) parts.push(`${updatedCount} updated`);
        if (skippedCount > 0) parts.push(`${skippedCount} kept`);
        if (unchangedCount > 0) parts.push(`${unchangedCount} unchanged`);
        toast.success(`Import complete: ${parts.join(', ')}.`);
        onSuccess();
      } else if (skippedCount > 0 || unchangedCount > 0) {
        const parts: string[] = [];
        if (skippedCount > 0) parts.push(`${skippedCount} kept`);
        if (unchangedCount > 0) parts.push(`${unchangedCount} unchanged`);
        toast.success(`No new writes needed: ${parts.join(', ')}.`);
      } else {
        toast.error('No variables were imported.');
      }
    } catch (error) {
      toSend.forEach(({ originalIdx }) => {
        if (workingResults[originalIdx].status === 'encrypting' || workingResults[originalIdx].status === 'pending') {
          workingResults[originalIdx] = { ...workingResults[originalIdx], status: 'error', error: 'Save failed' };
        }
      });
      setResults([...workingResults]);
      toast.error(error instanceof Error ? error.message : 'Import failed. Please try again.');
    }

    setImportPhase('done');
    setIsProcessing(false);
  };

  const handleParseAndCheck = async () => {
    const parsedSecrets = parseEnv(content);
    if (parsedSecrets.length === 0) { toast.error('No valid key-value pairs found'); return; }
    if (!derivedKey) { toast.error('Vault is locked'); return; }

    const entries = await preparePrecheck(parsedSecrets);
    if (!entries) return;

    setPrecheckEntries(entries);

    const existingCount = entries.filter((e) => Boolean(e.existing)).length;
    if (existingCount > 0) { setShowConfirmation(true); return; }

    await runImport(entries);
  };

  const existingCount = precheckEntries?.filter((e) => Boolean(e.existing)).length ?? 0;
  const changedExistingCount = precheckEntries?.filter((e) => Boolean(e.existing) && !e.sameValueAsExisting).length ?? 0;
  const unchangedExistingCount = precheckEntries?.filter((e) => Boolean(e.existing) && e.sameValueAsExisting).length ?? 0;

  const showingResults = results !== null;
  const isActivelyImporting = isProcessing && importPhase !== 'done';

  const progressForPanel = isActivelyImporting
    ? importPhase === 'encrypting'
      ? { done: encryptProgress, total: encryptTotal, label: `Encrypting ${encryptProgress}/${encryptTotal} secrets…` }
      : { done: encryptTotal, total: encryptTotal, label: 'Saving to vault…' }
    : undefined;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className={cn(
          'max-h-[90vh] flex flex-col transition-all duration-500',
          showingResults ? 'sm:max-w-[960px]' : 'sm:max-w-[640px]'
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="w-5 h-5 text-indigo-600" />
            Bulk Import Secrets
          </DialogTitle>
          <DialogDescription>
            Paste your .env content below. Each key is encrypted in your browser before being saved.
          </DialogDescription>
        </DialogHeader>

        <div className={cn('flex-1 overflow-hidden min-h-[300px] py-4', showingResults ? 'flex gap-4' : '')}>

          {/* Left column / full width for non-import states */}
          <div className={cn(showingResults ? 'flex-1 overflow-y-auto min-w-0' : 'h-full')}>

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
                    {changedExistingCount} key{changedExistingCount === 1 ? '' : 's'} have changed values and can be updated.{' '}
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
                      Replacing keys only updates history when the imported value is different. Identical values do not increment version history.
                    </div>
                  )}
                </div>

                <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1">
                  {precheckEntries.map((item, idx) => (
                    <div key={`${item.key}-${idx}`} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                      <span className="font-mono text-xs font-bold text-slate-900">{item.key}</span>
                      {item.existing ? (
                        item.sameValueAsExisting ? (
                          <Badge className="text-slate-700 border border-slate-200 bg-slate-100">Unchanged</Badge>
                        ) : (
                          <Badge className="text-indigo-700 border border-indigo-200 bg-indigo-50">Will Replace</Badge>
                        )
                      ) : (
                        <Badge className="text-emerald-700 border border-emerald-200 bg-emerald-50">New</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {results ? (
              <div className="space-y-2">
                {/* Phase status header */}
                {isActivelyImporting && (
                  <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-indigo-50 border border-indigo-100">
                    {importPhase === 'encrypting' ? (
                      <>
                        <Lock className="w-4 h-4 text-indigo-600 shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold text-indigo-800">Encrypting in your browser…</p>
                          <div className="w-full bg-indigo-100 rounded-full h-1 mt-1 overflow-hidden">
                            <div
                              className="bg-indigo-600 h-1 rounded-full transition-all duration-200"
                              style={{ width: encryptTotal > 0 ? `${Math.round((encryptProgress / encryptTotal) * 100)}%` : '0%' }}
                            />
                          </div>
                        </div>
                        <span className="text-xs font-mono text-indigo-600 shrink-0">{encryptProgress}/{encryptTotal}</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 text-indigo-600 shrink-0 animate-pulse" />
                        <p className="text-xs font-semibold text-indigo-800">Saving to vault…</p>
                      </>
                    )}
                  </div>
                )}

                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Variables</p>
                {results.map((item, idx) => (
                  <div key={`${item.key}-${idx}`} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                    <span className="font-mono text-xs font-bold text-slate-900 truncate">{item.key}</span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {(item.status === 'pending' || item.status === 'encrypting') && (
                        <div className="w-3 h-3 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
                      )}
                      {item.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                      {item.status === 'updated' && <Badge className="text-indigo-700 border border-indigo-200 bg-indigo-50">Updated</Badge>}
                      {item.status === 'skipped' && <Badge className="text-slate-700 border border-slate-200 bg-slate-100">Kept</Badge>}
                      {item.status === 'unchanged' && <Badge className="text-slate-700 border border-slate-200 bg-slate-100">Unchanged</Badge>}
                      {item.status === 'conflict' && <Badge className="text-orange-700 border border-orange-200 bg-orange-50">Conflict</Badge>}
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

          {/* Right column: info panel — only during import */}
          {showingResults && (
            <div className="w-72 shrink-0 flex flex-col">
              <LoadingInfoPanel
                sessionId={sessionId}
                progress={progressForPanel}
                className="flex-1 min-h-[300px]"
              />
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 border-t border-slate-100">
          {!results && !showConfirmation ? (
            <>
              <Button variant="ghost" onClick={handleClose} disabled={isChecking}>Cancel</Button>
              <Button onClick={handleParseAndCheck} disabled={!content.trim() || isProcessing || isChecking}>
                {isChecking ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Checking…</>
                ) : 'Parse & Continue'}
              </Button>
            </>
          ) : null}

          {showConfirmation && precheckEntries ? (
            <>
              <Button variant="ghost" onClick={() => setShowConfirmation(false)} disabled={isProcessing || isChecking}>
                <ArrowLeft className="w-4 h-4 mr-2" />Back
              </Button>
              <Button onClick={() => runImport(precheckEntries)} disabled={isProcessing || isChecking}>
                {skipExisting ? 'Import New + Keep Existing' : 'Import & Replace Changed'}
              </Button>
            </>
          ) : null}

          {results ? (
            <Button onClick={handleClose} disabled={isProcessing}>
              {isProcessing ? 'Importing…' : 'Close'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
