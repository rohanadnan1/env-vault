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
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { deriveVaultKey } from '@/lib/crypto/vault';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { useVaultStore } from '@/lib/store/vaultStore';

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
      setProgress({ done: 0, total: 0, label: 'Fetching encrypted vault data…' });

      const allRes = await fetch('/api/auth/master-password/all-encrypted');
      if (!allRes.ok) { toast.error('Failed to fetch vault data'); setStep('verify'); setIsLoading(false); return; }
      const { secrets, secretHistories, files, fileHistories, fileComments } = await allRes.json() as {
        secrets: EncryptedSecret[];
        secretHistories: EncryptedSecret[];
        files: EncryptedFileItem[];
        fileHistories: EncryptedFileItem[];
        fileComments: EncryptedComment[];
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

      // Helper: try primary AAD, fall back to secondary (for files that moved
      // between folder/env-root boundaries before the feature settled).
      async function decryptWithFallback(
        ciphertext: string, iv: string, primaryAad: string, fallbackAad: string | null
      ): Promise<{ plain: string; aad: string }> {
        try {
          const plain = await decryptSecret(ciphertext, iv, oldKey, primaryAad);
          return { plain, aad: primaryAad };
        } catch {
          if (!fallbackAad) throw new Error('decrypt failed');
          const plain = await decryptSecret(ciphertext, iv, oldKey, fallbackAad);
          return { plain, aad: fallbackAad };
        }
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

      // Files — try env-scoped AAD first, fallback to folder-scoped
      const newFiles: { id: string; contentEncrypted: string; iv: string }[] = [];
      for (const f of files) {
        const primary = `${f.name}:${f.environmentId}`;
        const fallback = f.folderId ? `${f.name}:${f.folderId}` : null;
        const { plain, aad } = await decryptWithFallback(f.contentEncrypted, f.iv, primary, fallback);
        const r = await encryptSecret(plain, newKey, aad);
        newFiles.push({ id: f.id, contentEncrypted: r.valueEncrypted, iv: r.iv });
        tick('Re-encrypting files…');
      }

      // File history — same AAD pattern
      const newFileHistories: { id: string; contentEncrypted: string; iv: string }[] = [];
      for (const h of fileHistories) {
        const primary = `${h.name}:${h.environmentId}`;
        const fallback = h.folderId ? `${h.name}:${h.folderId}` : null;
        const { plain, aad } = await decryptWithFallback(h.contentEncrypted, h.iv, primary, fallback);
        const r = await encryptSecret(plain, newKey, aad);
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

      // Step 7: atomic commit
      setProgress({ done: total, total, label: 'Saving to server…' });
      const rekeyRes = await fetch('/api/auth/master-password/rekey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifyId: prep.verifyId,
          newSalt,
          secrets: newSecrets,
          secretHistories: newSecretHistories,
          files: newFiles,
          fileHistories: newFileHistories,
          fileComments: newFileComments,
        }),
      });
      const rekeyData = await rekeyRes.json();
      if (!rekeyRes.ok) {
        toast.error(rekeyData.error ?? 'Re-key failed');
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
      <DialogContent className="sm:max-w-[480px]">

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

            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800 leading-relaxed">
              <ShieldAlert className="w-4 h-4 inline mr-1.5 mb-0.5 text-amber-500" />
              All secrets will be re-encrypted in your browser. Your recovery codes will be cleared.
              You <strong>cannot</strong> change the master password again for <strong>10 days</strong>.
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
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <RefreshCw className="w-5 h-5 text-indigo-500 shrink-0 animate-spin" />
                Re-encrypting Your Vault…
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600">
                Please keep this window open. Do not close your browser.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-sm text-center text-slate-500">
                {progress.total > 0
                  ? `${progress.done} / ${progress.total} — ${progress.label}`
                  : progress.label}
              </p>
            </div>
          </>
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
