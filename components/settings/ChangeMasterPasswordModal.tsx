"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  KeyRound, Smartphone, ShieldAlert, Loader2, CheckCircle2, Copy, Check,
  Eye, EyeOff, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { deriveVaultKey } from '@/lib/crypto/vault';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { useVaultStore } from '@/lib/store/vaultStore';

type CodeType = 'totp' | 'recovery';
type Step = 'verify' | 'passwords' | 'rekeying' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasTotp: boolean;
  hasRecoveryCodes: boolean;
}

interface EncryptedItem { id: string; valueEncrypted: string; iv: string }
interface EncryptedFile { id: string; contentEncrypted: string; iv: string }

export function ChangeMasterPasswordModal({ open, onOpenChange, hasTotp, hasRecoveryCodes }: Props) {
  const [step, setStep] = useState<Step>('verify');
  const [codeType, setCodeType] = useState<CodeType>(hasTotp ? 'totp' : 'recovery');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [finalPassword, setFinalPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(15);

  const unlockVault = useVaultStore((s) => s.unlock);

  function reset() {
    setStep('verify');
    setVerifyCode('');
    setVerifyId(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setProgress({ done: 0, total: 0, label: '' });
    setFinalPassword('');
    setCopied(false);
    setCountdown(15);
  }

  function handleClose() {
    if (isLoading) return;
    onOpenChange(false);
    setTimeout(reset, 300);
  }

  // Countdown timer on done step
  useEffect(() => {
    if (step !== 'done') return;
    if (countdown <= 0) { handleClose(); return; }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, countdown]);

  // ── Step 1: Verify identity ────────────────────────────────────────────────
  async function handleVerify() {
    if (!verifyCode.trim()) { toast.error('Please enter a code'); return; }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/master-password/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verifyCode.trim(), codeType }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Verification failed'); return; }
      setVerifyId(data.verifyId);
      setStep('passwords');
    } catch {
      toast.error('Something went wrong — please try again');
    } finally {
      setIsLoading(false);
    }
  }

  // ── Step 2: Validate passwords, then re-key ────────────────────────────────
  const handleRekey = useCallback(async () => {
    if (!verifyId) return;
    if (!currentPassword) { toast.error('Enter your current master password'); return; }
    if (!newPassword) { toast.error('Enter a new master password'); return; }
    if (newPassword === currentPassword) { toast.error('New password must differ from the current one'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 8) { toast.error('New password must be at least 8 characters'); return; }

    setIsLoading(true);
    setStep('rekeying');

    try {
      // Fetch all encrypted data
      setProgress({ done: 0, total: 0, label: 'Fetching encrypted data…' });
      const fetchRes = await fetch('/api/auth/master-password/all-encrypted');
      if (!fetchRes.ok) { toast.error('Failed to fetch vault data'); setStep('passwords'); return; }
      const { currentSalt, secrets, secretHistories, files, fileHistories } = await fetchRes.json() as {
        currentSalt: string;
        secrets: EncryptedItem[];
        secretHistories: EncryptedItem[];
        files: EncryptedFile[];
        fileHistories: EncryptedFile[];
      };

      if (!currentSalt) { toast.error('Vault not initialised — unlock your vault first'); setStep('passwords'); return; }

      // Derive old key
      setProgress({ done: 0, total: 0, label: 'Deriving old key…' });
      let oldKey: CryptoKey;
      try {
        oldKey = await deriveVaultKey(currentPassword, currentSalt);
      } catch {
        toast.error('Failed to derive old key');
        setStep('passwords');
        return;
      }

      // Verify current password is correct by test-decrypting first secret/file
      const testSecret = secrets[0] ?? secretHistories[0];
      const testFile = files[0] ?? fileHistories[0];
      if (testSecret) {
        try {
          await decryptSecret(testSecret.valueEncrypted, testSecret.iv, oldKey);
        } catch {
          toast.error('Current master password is incorrect');
          setStep('passwords');
          return;
        }
      } else if (testFile) {
        try {
          await decryptSecret(testFile.contentEncrypted, testFile.iv, oldKey);
        } catch {
          toast.error('Current master password is incorrect');
          setStep('passwords');
          return;
        }
      }

      // Generate new salt + derive new key
      setProgress({ done: 0, total: 0, label: 'Generating new key…' });
      const newSaltBytes = crypto.getRandomValues(new Uint8Array(32));
      const newSalt = btoa(String.fromCharCode(...newSaltBytes));
      const newKey = await deriveVaultKey(newPassword, newSalt);

      const total = secrets.length + secretHistories.length + files.length + fileHistories.length;
      let done = 0;

      function tick(label: string) {
        done++;
        setProgress({ done, total, label });
      }

      // Re-encrypt secrets
      setProgress({ done, total, label: 'Re-encrypting secrets…' });
      const newSecrets: EncryptedItem[] = [];
      for (const s of secrets) {
        const plain = await decryptSecret(s.valueEncrypted, s.iv, oldKey);
        const { valueEncrypted, iv } = await encryptSecret(plain, newKey);
        newSecrets.push({ id: s.id, valueEncrypted, iv });
        tick('Re-encrypting secrets…');
      }

      // Re-encrypt secret history
      const newSecretHistories: EncryptedItem[] = [];
      for (const h of secretHistories) {
        const plain = await decryptSecret(h.valueEncrypted, h.iv, oldKey);
        const { valueEncrypted, iv } = await encryptSecret(plain, newKey);
        newSecretHistories.push({ id: h.id, valueEncrypted, iv });
        tick('Re-encrypting secret history…');
      }

      // Re-encrypt files
      const newFiles: EncryptedFile[] = [];
      for (const f of files) {
        const plain = await decryptSecret(f.contentEncrypted, f.iv, oldKey);
        const { valueEncrypted: contentEncrypted, iv } = await encryptSecret(plain, newKey);
        newFiles.push({ id: f.id, contentEncrypted, iv });
        tick('Re-encrypting files…');
      }

      // Re-encrypt file history
      const newFileHistories: EncryptedFile[] = [];
      for (const h of fileHistories) {
        const plain = await decryptSecret(h.contentEncrypted, h.iv, oldKey);
        const { valueEncrypted: contentEncrypted, iv } = await encryptSecret(plain, newKey);
        newFileHistories.push({ id: h.id, contentEncrypted, iv });
        tick('Re-encrypting file history…');
      }

      // Send to server
      setProgress({ done: total, total, label: 'Saving to server…' });
      const rekeyRes = await fetch('/api/auth/master-password/rekey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verifyId,
          newSalt,
          secrets: newSecrets,
          secretHistories: newSecretHistories,
          files: newFiles,
          fileHistories: newFileHistories,
        }),
      });
      const rekeyData = await rekeyRes.json();
      if (!rekeyRes.ok) { toast.error(rekeyData.error ?? 'Re-key failed'); setStep('passwords'); return; }

      // Update in-memory vault key so the user stays unlocked
      unlockVault(newKey);

      setFinalPassword(newPassword);
      setCountdown(15);
      setStep('done');
    } catch (err) {
      console.error('rekey error', err);
      toast.error('Re-keying failed — please try again');
      setStep('passwords');
    } finally {
      setIsLoading(false);
    }
  }, [verifyId, currentPassword, newPassword, confirmPassword, unlockVault]);

  async function copyPassword() {
    await navigator.clipboard.writeText(finalPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">

        {/* ── Step 1: Verify identity ──────────────────────────────────── */}
        {step === 'verify' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <KeyRound className="w-5 h-5 text-indigo-500 shrink-0" />
                Change Master Password
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
                This will re-encrypt all your secrets in your browser.
                Verify your identity first.
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
                    onKeyDown={(e) => e.key === 'Enter' && verifyCode.length === 6 && handleVerify()}
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
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    className="font-mono"
                    disabled={isLoading}
                    autoFocus={!hasTotp}
                  />
                  <p className="text-[11px] text-slate-400">16-character hex code. Using it marks it as spent.</p>
                </>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" className="border border-slate-200" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleVerify}
                disabled={isLoading || (codeType === 'totp' && verifyCode.length !== 6)}
              >
                {isLoading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying…</>
                  : 'Verify Identity'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: Enter passwords ──────────────────────────────────── */}
        {step === 'passwords' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <RefreshCw className="w-5 h-5 text-indigo-500 shrink-0" />
                Set New Master Password
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
                Enter your current password to decrypt your vault, then set a new one.
                All secrets and files will be re-encrypted in your browser.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Current Master Password</Label>
                <div className="relative">
                  <Input
                    type={showCurrent ? 'text' : 'password'}
                    placeholder="Your current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="pr-10"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowCurrent((v) => !v)}
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>New Master Password</Label>
                <div className="relative">
                  <Input
                    type={showNew ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowNew((v) => !v)}
                  >
                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Confirm New Master Password</Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRekey()}
                    className={cn('pr-10', confirmPassword && confirmPassword !== newPassword && 'border-red-400')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {confirmPassword && confirmPassword !== newPassword && (
                  <p className="text-xs text-red-500">Passwords do not match</p>
                )}
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800 leading-relaxed">
                <ShieldAlert className="w-4 h-4 inline mr-1.5 mb-0.5 text-amber-500" />
                After changing, your recovery codes and 2FA vault unlock will be <strong>cleared</strong> and must be regenerated.
                You cannot change the master password again for <strong>10 days</strong>.
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" className="border border-slate-200" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleRekey}
                disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
              >
                Re-encrypt &amp; Save
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 3: Re-keying progress ───────────────────────────────── */}
        {step === 'rekeying' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <RefreshCw className="w-5 h-5 text-indigo-500 shrink-0 animate-spin" />
                Re-encrypting Your Vault…
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600">
                Please keep this window open. This may take a moment.
              </DialogDescription>
            </DialogHeader>

            <div className="py-4 space-y-4">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: progress.total > 0 ? `${Math.round((progress.done / progress.total) * 100)}%` : '10%' }}
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

        {/* ── Step 4: Done — 15-second password reveal ─────────────────── */}
        {step === 'done' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 font-bold text-lg">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                Master Password Changed
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
                Your vault has been re-encrypted successfully.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-1">
              {/* New password display */}
              <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50 p-4 space-y-2">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">Your New Master Password</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-slate-900 text-sm break-all select-all bg-white rounded-lg px-3 py-2 border border-indigo-100">
                    {finalPassword}
                  </code>
                  <button
                    onClick={copyPassword}
                    className="shrink-0 p-2 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 transition-colors text-indigo-600"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Warning message */}
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-sm text-amber-800 leading-relaxed">
                <ShieldAlert className="w-4 h-4 inline mr-1.5 mb-0.5 text-amber-500" />
                <strong>Save this password now.</strong> You cannot change your master password again for{' '}
                <strong>10 days</strong>. Your recovery codes and 2FA vault unlock have been cleared — please regenerate them.
              </div>

              {/* Countdown */}
              <p className="text-center text-sm text-slate-400">
                This dialog closes automatically in{' '}
                <span className={cn('font-bold tabular-nums', countdown <= 5 ? 'text-red-500' : 'text-slate-600')}>
                  {countdown}s
                </span>
              </p>
            </div>

            <DialogFooter>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleClose}>
                I&apos;ve saved my password — Done
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
