"use client";

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  KeyRound, Smartphone, ShieldAlert, Loader2, CheckCircle2, Copy, Check, RefreshCw,
  LockKeyhole, ShieldOff, Clock, FileKey2, TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { deriveVaultKey } from '@/lib/crypto/vault';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { LoadingInfoPanel } from '@/components/vault/LoadingInfoPanel';

type CodeType = 'totp' | 'recovery';
type Step = 'verify' | 'rekeying' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasRecoveryCodes: boolean;
  hasTotp: boolean;
}

interface EncryptedSecret { id: string; valueEncrypted: string; iv: string; keyName: string; environmentId: string }
interface EncryptedFileItem { id: string; contentEncrypted: string; iv: string; name: string; environmentId: string; folderId: string | null }
interface EncryptedComment { id: string; content: string; iv: string; fileId: string }

// Alphanumeric, no ambiguous characters (no 0/O/1/l/I)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function generateMasterPassword(length = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let pw = '';
  for (let i = 0; i < length; i++) pw += ALPHABET[bytes[i] % ALPHABET.length];
  return pw;
}

export function ChangeMasterPasswordModal({ open, onOpenChange, hasRecoveryCodes, hasTotp }: Props) {
  const [step, setStep] = useState<Step>('verify');
  const [codeType, setCodeType] = useState<CodeType>(hasTotp ? 'totp' : 'recovery');
  const [verifyCode, setVerifyCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [newPassword, setNewPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [rekeySessionId, setRekeySessionId] = useState('');

  const derivedKey = useVaultStore((s) => s.derivedKey);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const unlockVault = useVaultStore((s) => s.unlock);

  function reset() {
    setStep('verify');
    setVerifyCode('');
    setProgress({ done: 0, total: 0, label: '' });
    setNewPassword('');
    setCopied(false);
    setCountdown(15);
    setRekeySessionId('');
  }

  function handleClose() {
    if (isLoading || step === 'rekeying') return;
    onOpenChange(false);
    setTimeout(reset, 300);
  }

  // Countdown on done step — auto-closes at 0
  useEffect(() => {
    if (step !== 'done') return;
    if (countdown <= 0) {
      onOpenChange(false);
      setTimeout(reset, 300);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, countdown]);

  async function handleVerifyAndRekey() {
    if (!verifyCode.trim()) { toast.error('Please enter a code'); return; }
    if (!isUnlocked || !derivedKey) {
      toast.error('Please unlock your vault before resetting the master password');
      return;
    }
    setIsLoading(true);

    try {
      // Step 1: verify identity
      const prepRes = await fetch('/api/auth/master-password/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode.trim(), codeType }),
      });
      const prep = await prepRes.json();
      if (!prepRes.ok) { toast.error(prep.error ?? 'Verification failed'); setIsLoading(false); return; }

      // Step 2: transition to rekey screen — use in-memory derivedKey to decrypt
      setStep('rekeying');
      setRekeySessionId(Date.now().toString());
      setProgress({ done: 0, total: 0, label: 'Fetching encrypted vault data…' });

      // Fetch all encrypted blobs — retry up to 3 times on transient failures
      let allRes: Response | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          allRes = await fetch('/api/auth/master-password/all-encrypted');
          if (allRes.ok) break;
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
        } catch {
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }
      if (!allRes?.ok) { toast.error('Failed to fetch vault data — please retry'); setStep('verify'); setIsLoading(false); return; }
      const { secrets, secretHistories, files, fileHistories, fileComments, folderIds } = await allRes.json() as {
        secrets: EncryptedSecret[];
        secretHistories: EncryptedSecret[];
        files: EncryptedFileItem[];
        fileHistories: EncryptedFileItem[];
        fileComments: EncryptedComment[];
        folderIds: string[];
      };

      const oldKey = derivedKey;

      // Step 3: generate new random master password + new salt + new key
      setProgress({ done: 0, total: 0, label: 'Generating new master key…' });
      const generated = generateMasterPassword(32);
      const newSaltBytes = crypto.getRandomValues(new Uint8Array(32));
      const newSalt = btoa(String.fromCharCode(...newSaltBytes));
      const newKey = await deriveVaultKey(generated, newSalt);

      const total = secrets.length + secretHistories.length + files.length + fileHistories.length + fileComments.length;
      let done = 0;
      const tick = (label: string) => { done++; setProgress({ done, total, label }); };

      // Try AADs in order: primary → current folder-scoped → every known folder ID
      // (catches files moved after being encrypted with the old folderId) → no AAD
      // (very old files before AAD enforcement). Always re-encrypts with primaryAad
      // going forward so future rekeying never needs the brute-force path.
      async function tryDecrypt(
        ciphertext: string, iv: string, primaryAad: string, currentFolderAad: string | null, fileName?: string
      ): Promise<{ plain: string; aad: string } | null> {
        try {
          return { plain: await decryptSecret(ciphertext, iv, oldKey, primaryAad), aad: primaryAad };
        } catch { /* fall through */ }

        if (currentFolderAad) {
          try {
            return { plain: await decryptSecret(ciphertext, iv, oldKey, currentFolderAad), aad: primaryAad };
          } catch { /* fall through */ }
        }

        // Brute-force every folder the user has ever had — catches files that were
        // encrypted with an old folderId before being moved to a different folder.
        if (fileName) {
          for (const fid of folderIds) {
            const aad = `${fileName}:${fid}`;
            if (aad === currentFolderAad) continue; // already tried above
            try {
              return { plain: await decryptSecret(ciphertext, iv, oldKey, aad), aad: primaryAad };
            } catch { /* try next folder */ }
          }
        }

        // Last resort: no AAD (files created before AAD enforcement)
        try {
          return { plain: await decryptSecret(ciphertext, iv, oldKey, undefined), aad: primaryAad };
        } catch { /* fall through */ }

        return null;
      }

      // Secrets
      const newSecrets: { id: string; valueEncrypted: string; iv: string }[] = [];
      for (const s of secrets) {
        const aad = `${s.keyName}:${s.environmentId}`;
        const plain = await decryptSecret(s.valueEncrypted, s.iv, oldKey, aad);
        const r = await encryptSecret(plain, newKey, aad);
        newSecrets.push({ id: s.id, valueEncrypted: r.valueEncrypted, iv: r.iv });
        tick('Re-encrypting secrets…');
      }

      // Secret history — same AAD as parent secret
      const newSecretHistories: { id: string; valueEncrypted: string; iv: string }[] = [];
      for (const h of secretHistories) {
        const aad = `${h.keyName}:${h.environmentId}`;
        const plain = await decryptSecret(h.valueEncrypted, h.iv, oldKey, aad);
        const r = await encryptSecret(plain, newKey, aad);
        newSecretHistories.push({ id: h.id, valueEncrypted: r.valueEncrypted, iv: r.iv });
        tick('Re-encrypting secret history…');
      }

      // Files (current content) — try env-scoped AAD, then folder-scoped, then no AAD.
      // Files that fail all attempts have an irrecoverable old folder-scoped AAD (encrypted
      // before the environmentId fix and then moved). They are skipped so the rekey
      // continues — the file record stays in the DB untouched so no data is deleted.
      const newFiles: { id: string; contentEncrypted: string; iv: string }[] = [];
      const unreadableFiles: { id: string; name: string }[] = [];
      for (const f of files) {
        const primary = `${f.name}:${f.environmentId}`;
        const fallback = f.folderId ? `${f.name}:${f.folderId}` : null;
        const result = await tryDecrypt(f.contentEncrypted, f.iv, primary, fallback, f.name);
        if (!result) {
          unreadableFiles.push({ id: f.id, name: f.name });
          tick('Cleaning up unreadable files…');
          continue;
        }
        const r = await encryptSecret(result.plain, newKey, result.aad);
        newFiles.push({ id: f.id, contentEncrypted: r.valueEncrypted, iv: r.iv });
        tick('Re-encrypting files…');
      }

      // File history revisions — same try-order. Revisions that fail all attempts are
      // permanently orphaned (they'll become unreadable after the salt changes anyway),
      // so we collect their IDs for the server to delete atomically during the rekey.
      const newFileHistories: { id: string; contentEncrypted: string; iv: string }[] = [];
      const orphanFileHistoryIds: string[] = [];
      for (const h of fileHistories) {
        const primary = `${h.name}:${h.environmentId}`;
        const fallback = h.folderId ? `${h.name}:${h.folderId}` : null;
        const result = await tryDecrypt(h.contentEncrypted, h.iv, primary, fallback, h.name);
        if (!result) {
          orphanFileHistoryIds.push(h.id);
          tick('Cleaning up orphan history…');
          continue;
        }
        const r = await encryptSecret(result.plain, newKey, result.aad);
        newFileHistories.push({ id: h.id, contentEncrypted: r.valueEncrypted, iv: r.iv });
        tick('Re-encrypting file history…');
      }

      // File comments — AAD is "comment:fileId"
      const newFileComments: { id: string; content: string; iv: string }[] = [];
      for (const c of fileComments) {
        const aad = `comment:${c.fileId}`;
        const plain = await decryptSecret(c.content, c.iv, oldKey, aad);
        const r = await encryptSecret(plain, newKey, aad);
        newFileComments.push({ id: c.id, content: r.valueEncrypted, iv: r.iv });
        tick('Re-encrypting comments…');
      }

      // Warn about files that could not be re-encrypted (they stay in the DB untouched
      // but will be unreadable with the new key — they were already unreadable before
      // because their encryption context drifted when they were moved between folders).
      if (unreadableFiles.length > 0) {
        toast.warning(
          `${unreadableFiles.length} file${unreadableFiles.length > 1 ? 's' : ''} could not be re-encrypted and will remain locked: ${unreadableFiles.map((f) => f.name).join(', ')}. You can delete them manually from the vault.`,
          { duration: 10000 }
        );
      }

      // Step 7: atomic commit — retry up to 3 times on transient network errors
      setProgress({ done: total, total, label: 'Saving to server…' });
      const rekeyPayload = JSON.stringify({
        verifyId: prep.verifyId,
        newSalt,
        secrets: newSecrets,
        secretHistories: newSecretHistories,
        files: newFiles,
        fileHistories: newFileHistories,
        fileComments: newFileComments,
        deleteFileHistoryIds: orphanFileHistoryIds,
      });

      let rekeyRes: Response | null = null;
      let rekeyData: { error?: string; status?: string } = {};
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          rekeyRes = await fetch('/api/auth/master-password/rekey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: rekeyPayload,
          });
          rekeyData = await rekeyRes.json();
          if (rekeyRes.ok) break;
          // Server errors that indicate the challenge was consumed — don't retry
          if (rekeyRes.status === 400 || rekeyRes.status === 403 || rekeyRes.status === 429) break;
          // 5xx: retry after a short delay
          if (attempt < 3) {
            setProgress({ done: total, total, label: `Server error — retrying (${attempt}/3)…` });
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
        } catch {
          if (attempt < 3) {
            setProgress({ done: total, total, label: `Network error — retrying (${attempt}/3)…` });
            await new Promise((r) => setTimeout(r, 1500 * attempt));
          }
        }
      }

      if (!rekeyRes?.ok) {
        toast.error(rekeyData.error ?? 'Re-key failed — please try again');
        setStep('verify');
        setIsLoading(false);
        return;
      }

      // Step 8: update in-memory vault key, show the password
      unlockVault(newKey);
      setNewPassword(generated);
      setCountdown(15);
      setStep('done');
    } catch (err) {
      console.error('rekey error', err);
      toast.error('Something went wrong — please try again');
      setStep('verify');
    } finally {
      setIsLoading(false);
    }
  }

  async function copyPassword() {
    await navigator.clipboard.writeText(newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const progressPct = progress.total > 0
    ? Math.max(10, Math.round((progress.done / progress.total) * 100))
    : 10;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn('transition-all duration-500', step === 'rekeying' ? 'sm:max-w-[860px]' : 'sm:max-w-[520px]')}>

        {/* ── Step 1: Verify identity ──────────────────────────────────── */}
        {step === 'verify' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <KeyRound className="w-5 h-5 text-indigo-500 shrink-0" />
                Reset Master Password
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
                Verify your identity to reset your master password.
                A new password will be generated and shown for <strong>15 seconds</strong>.
                You <strong>must</strong> save it somewhere safe — we cannot show it again.
              </DialogDescription>
            </DialogHeader>

            {/* Code-type toggle */}
            {hasTotp && hasRecoveryCodes && (
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm font-medium">
                <button
                  className={cn(
                    'flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors',
                    codeType === 'totp' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  )}
                  onClick={() => { setCodeType('totp'); setVerifyCode(''); }}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Authenticator App
                </button>
                <button
                  className={cn(
                    'flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors border-l border-slate-200',
                    codeType === 'recovery' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  )}
                  onClick={() => { setCodeType('recovery'); setVerifyCode(''); }}
                >
                  <KeyRound className="w-3.5 h-3.5" /> Recovery Code
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              {codeType === 'totp' ? (
                <>
                  <Label>6-digit code from your authenticator app</Label>
                  <Input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && verifyCode.length === 6 && handleVerifyAndRekey()}
                    className="font-mono text-center text-lg tracking-[0.4em] h-11"
                    disabled={isLoading}
                    autoFocus
                    maxLength={6}
                  />
                </>
              ) : (
                <>
                  <Label>Recovery code</Label>
                  <Input
                    placeholder="xxxxxxxxxxxxxxxx"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerifyAndRekey()}
                    className="font-mono"
                    disabled={isLoading}
                    autoFocus={!hasTotp}
                  />
                  <p className="text-[11px] text-slate-400">16-character hex code. Using it marks it as spent.</p>
                </>
              )}
            </div>

            {/* What will happen */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-200 flex items-center gap-1.5">
                <TriangleAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">What will happen</span>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div className="mt-0.5 p-1 rounded-md bg-indigo-100 shrink-0">
                    <LockKeyhole className="w-3 h-3 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">New master password generated</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">A random password is shown for <strong>15 seconds only</strong>. You must save it — we cannot show it again.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div className="mt-0.5 p-1 rounded-md bg-emerald-100 shrink-0">
                    <FileKey2 className="w-3 h-3 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Everything re-encrypted in your browser</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">All secrets, files, and history are decrypted and re-encrypted locally with the new key. Nothing is sent to the server until the final step.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div className="mt-0.5 p-1 rounded-md bg-rose-100 shrink-0">
                    <ShieldOff className="w-3 h-3 text-rose-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Recovery codes &amp; 2FA vault unlock cleared</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">All existing recovery codes are invalidated and 2FA vault unlock is removed. Regenerate both in Settings after this.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 px-3 py-2.5">
                  <div className="mt-0.5 p-1 rounded-md bg-amber-100 shrink-0">
                    <Clock className="w-3 h-3 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-800">10-day cooldown starts now</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">You cannot change the master password again for 10 days after this action.</p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" className="border border-slate-200" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleVerifyAndRekey}
                disabled={isLoading || (codeType === 'totp' && verifyCode.length !== 6) || !verifyCode.trim()}
              >
                {isLoading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying…</>
                  : 'Reset Master Password'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: Re-keying progress ───────────────────────────────── */}
        {step === 'rekeying' && (
          <div className="flex gap-5 min-h-[320px]">
            {/* Left: progress */}
            <div className="flex flex-col flex-1 min-w-0">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                  <RefreshCw className="w-5 h-5 text-indigo-500 shrink-0 animate-spin" />
                  Re-encrypting Your Vault…
                </DialogTitle>
                <DialogDescription className="pt-1 text-slate-600">
                  Please keep this window open. Do not close your browser.
                </DialogDescription>
              </DialogHeader>

              <div className="py-6 space-y-4 flex-1">
                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="truncate">{progress.label}</span>
                    {progress.total > 0 && (
                      <span className="ml-2 shrink-0 tabular-nums font-mono">{progress.done}/{progress.total}</span>
                    )}
                  </div>
                </div>

                {/* Step indicators */}
                <div className="space-y-2 mt-2">
                  {[
                    { label: 'Verified identity', done: true },
                    { label: 'Generating new master key', done: progress.done > 0 || progress.label.includes('Generating') || progress.label.includes('Re-enc') || progress.label.includes('Saving') },
                    { label: 'Re-encrypting secrets & files', done: progress.label.includes('Saving') },
                    { label: 'Committing to server', done: false },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {s.done ? (
                        <span className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        </span>
                      ) : (
                        <span className="w-4 h-4 rounded-full border-2 border-slate-200 shrink-0" />
                      )}
                      <span className={s.done ? 'text-slate-700' : 'text-slate-400'}>{s.label}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-xs text-amber-700 mt-auto">
                  <ShieldAlert className="w-3.5 h-3.5 inline mr-1.5 mb-0.5 text-amber-500" />
                  All re-encryption happens locally in your browser. Nothing is sent until the final step.
                </div>
              </div>
            </div>

            {/* Right: info panel */}
            <div className="w-72 shrink-0">
              <LoadingInfoPanel
                sessionId={rekeySessionId}
                progress={progress.total > 0 ? progress : undefined}
                className="h-full min-h-[280px]"
              />
            </div>
          </div>
        )}

        {/* ── Step 3: Reveal new password for 15 seconds ───────────────── */}
        {step === 'done' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 font-bold text-lg">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                Your New Master Password
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
                Your vault is now encrypted with the password below.
                <strong className="text-red-600"> Save it now</strong> — it will not be shown again.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50 p-4 space-y-2">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">New Master Password</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-slate-900 text-sm break-all select-all bg-white rounded-lg px-3 py-2 border border-indigo-100">
                    {newPassword}
                  </code>
                  <button
                    onClick={copyPassword}
                    className="shrink-0 p-2 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 transition-colors text-indigo-600"
                    title="Copy"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800 leading-relaxed">
                <ShieldAlert className="w-4 h-4 inline mr-1.5 mb-0.5 text-amber-500" />
                <strong>Save this password now.</strong> Your recovery codes and 2FA vault unlock have been cleared.
                You cannot change your master password again for <strong>10 days</strong>.
              </div>

              <div className="flex items-center justify-center gap-2">
                <div
                  className={cn(
                    'relative w-12 h-12 rounded-full flex items-center justify-center font-bold tabular-nums transition-colors',
                    countdown <= 5 ? 'bg-red-50 text-red-600 border-2 border-red-200' : 'bg-slate-50 text-slate-700 border-2 border-slate-200'
                  )}
                >
                  {countdown}
                </div>
                <p className="text-sm text-slate-500">
                  Closing in <span className={cn('font-semibold', countdown <= 5 && 'text-red-600')}>{countdown}s</span>
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => { onOpenChange(false); setTimeout(reset, 300); }}
              >
                I&apos;ve saved it — Close
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
