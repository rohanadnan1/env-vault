"use client";

import { useState, useEffect } from 'react';
import { useVaultStore } from '@/lib/store/vaultStore';
import { deriveVaultKey } from '@/lib/crypto/vault';
import { decryptSecret } from '@/lib/crypto/decrypt';
import {
  isBiometricSupported,
  isBiometricEnrolled,
  enrollBiometrics,
  unlockWithBiometrics,
} from '@/lib/crypto/biometric';
import {
  decryptMasterWithCode,
  decryptMasterWith2FA,
} from '@/lib/crypto/recovery';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Fingerprint,
  Monitor,
  Loader2,
  ShieldCheck,
  KeyRound,
  Smartphone,
  ChevronLeft,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type UnlockMode = 'password' | 'recovery' | 'totp';

export function VaultUnlock() {
  const [mode, setMode] = useState<UnlockMode>('password');
  const [password, setPassword] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [enrollBio, setEnrollBio] = useState(false);
  const [error, setError] = useState(false);
  const [has2FAVaultUnlock, setHas2FAVaultUnlock] = useState(false);

  const unlock = useVaultStore((s) => s.unlock);
  const {
    isBiometricSupported: supported,
    isBiometricEnrolled: enrolled,
    setBiometricSupport,
    setBiometricEnrolled,
  } = useVaultStore();

  useEffect(() => {
    isBiometricSupported().then((isSupported) => {
      setBiometricSupport(isSupported);
      if (isSupported && !isBiometricEnrolled()) setEnrollBio(true);
    });
    setBiometricEnrolled(isBiometricEnrolled());

    fetch('/api/auth/totp/vault-setup')
      .then((r) => r.json())
      .then((d) => setHas2FAVaultUnlock(!!d.enabled))
      .catch(() => {});
  }, [setBiometricSupport, setBiometricEnrolled]);

  const verifyDerivedKey = async (
    key: CryptoKey,
    verificationSample?: {
      keyName: string;
      valueEncrypted: string;
      iv: string;
      environmentId: string;
    } | null
  ) => {
    if (!verificationSample) return true;
    const aad = `${verificationSample.keyName}:${verificationSample.environmentId}`;
    await decryptSecret(verificationSample.valueEncrypted, verificationSample.iv, key, aad);
    return true;
  };

  const doUnlock = async (masterPw: string, enroll: boolean) => {
    const res = await fetch('/api/vault/salt');
    if (!res.ok) throw new Error('Failed to fetch salt');
    const { salt, verificationSample } = await res.json();

    return new Promise<void>((resolve, reject) => {
      setTimeout(async () => {
        try {
          const key = await deriveVaultKey(masterPw, salt);
          await verifyDerivedKey(key, verificationSample);

          if (enroll) {
            try {
              await enrollBiometrics(masterPw);
              setBiometricEnrolled(true);
              toast.success('Biometric unlock enabled');
            } catch {
              toast.error('Failed to enable biometric unlock');
            }
          }

          unlock(key);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 10);
    });
  };

  const handleBiometricUnlock = async () => {
    setIsScanning(true);
    setError(false);
    try {
      const decryptedPw = await unlockWithBiometrics();
      const res = await fetch('/api/vault/salt');
      if (!res.ok) throw new Error('Failed to fetch salt');
      const { salt, verificationSample } = await res.json();
      const key = await deriveVaultKey(decryptedPw, salt);
      await verifyDerivedKey(key, verificationSample);
      unlock(key);
      toast.success('Vault unlocked with Touch ID');
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        toast.error('Biometric unlock failed. Please use your password.');
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);
    try {
      await doUnlock(password, enrollBio);
    } catch {
      setError(true);
      toast.error('Incorrect master password.');
      setIsLoading(false);
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/recovery-codes/use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: recoveryCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(true);
        toast.error(data.error ?? 'Invalid recovery code');
        setIsLoading(false);
        return;
      }
      const masterPw = await decryptMasterWithCode(
        recoveryCode.trim(),
        data.encryptedMaster,
        data.masterIv,
        data.codeSalt
      );
      await doUnlock(masterPw, false);
      toast.success('Vault unlocked with recovery code');
    } catch {
      setError(true);
      toast.error('Recovery code failed. Check the code and try again.');
      setIsLoading(false);
    }
  };

  const handleTOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/totp/vault-unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totpCode: totpCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(true);
        toast.error(data.error ?? 'Invalid 2FA code');
        setIsLoading(false);
        return;
      }
      const masterPw = await decryptMasterWith2FA(
        data.unlockToken,
        data.encryptedMaster,
        data.masterIv
      );
      await doUnlock(masterPw, false);
      toast.success('Vault unlocked with 2FA');
    } catch {
      setError(true);
      toast.error('2FA unlock failed. Try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px]">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-slate-100 ring-1 ring-slate-900/5">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100 shadow-sm">
            {mode === 'recovery' ? (
              <KeyRound className="w-8 h-8 text-indigo-600" />
            ) : mode === 'totp' ? (
              <Smartphone className="w-8 h-8 text-indigo-600" />
            ) : (
              <ShieldCheck className="w-8 h-8 text-indigo-600" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Unlock Vault</h2>
          <p className="text-slate-500 text-sm mt-1">
            {mode === 'recovery'
              ? 'Enter one of your recovery codes'
              : mode === 'totp'
              ? 'Enter your authenticator app code'
              : 'Unlock your environment variables'}
          </p>
        </div>

        {/* Biometric unlock — only on password mode */}
        {mode === 'password' && enrolled && supported && (
          <div className="mb-6">
            <Button
              type="button"
              variant="outline"
              className={cn(
                'w-full h-14 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-200 transition-all font-bold gap-3 group',
                isScanning && 'animate-pulse'
              )}
              onClick={handleBiometricUnlock}
              disabled={isScanning || isLoading}
            >
              {isScanning ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Fingerprint className="w-6 h-6 group-hover:scale-110 transition-transform" />
              )}
              {isScanning ? 'Scanning...' : 'Unlock with Touch ID'}
            </Button>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-slate-400 font-medium">Or use password</span>
              </div>
            </div>
          </div>
        )}

        {/* Back button for alternative modes */}
        {mode !== 'password' && (
          <button
            onClick={() => { setMode('password'); setError(false); setRecoveryCode(''); setTotpCode(''); }}
            className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to password
          </button>
        )}

        {/* Password mode */}
        {mode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="master-password" className="text-slate-700 font-medium flex items-center gap-2">
                <Monitor className="w-3.5 h-3.5 text-slate-400" />
                Master Password
              </Label>
              <Input
                id="master-password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading || isScanning}
                className="h-12 rounded-xl border-slate-200 focus:ring-indigo-500 bg-slate-50/50"
                autoFocus={!enrolled}
              />
            </div>

            {supported && !enrolled && (
              <label className="flex items-center gap-3 p-4 bg-indigo-50/50 rounded-xl border-2 border-indigo-100 cursor-pointer hover:bg-indigo-50 transition-all ring-1 ring-indigo-500/5">
                <input
                  type="checkbox"
                  checked={enrollBio}
                  onChange={(e) => setEnrollBio(e.target.checked)}
                  className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-indigo-600" />
                    Link Touch ID
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Auto-unlock on this device from now on</span>
                </div>
              </label>
            )}

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                <p className="text-rose-600 text-xs font-bold text-center">Incorrect password. Please try again.</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-md font-bold shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={isLoading || isScanning || !password}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Unlocking...
                </span>
              ) : (
                'Unlock Vault'
              )}
            </Button>

            {/* Alternative unlock methods */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setMode('recovery'); setError(false); }}
                className="text-xs text-slate-400 hover:text-indigo-600 transition-colors font-medium flex items-center justify-center gap-1"
              >
                <KeyRound className="w-3.5 h-3.5" />
                Use a recovery code
              </button>
              {has2FAVaultUnlock && (
                <button
                  type="button"
                  onClick={() => { setMode('totp'); setError(false); }}
                  className="text-xs text-slate-400 hover:text-indigo-600 transition-colors font-medium flex items-center justify-center gap-1"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Unlock with 2FA
                </button>
              )}
            </div>
          </form>
        )}

        {/* Recovery code mode */}
        {mode === 'recovery' && (
          <form onSubmit={handleRecoverySubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="recovery-code" className="text-slate-700 font-medium">
                Recovery Code
              </Label>
              <Input
                id="recovery-code"
                type="text"
                placeholder="xxxxxxxx-xxxxxxxx"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                disabled={isLoading}
                className="h-12 rounded-xl border-slate-200 font-mono tracking-widest text-center bg-slate-50/50"
                autoFocus
                spellCheck={false}
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400 text-center">
                Each code can only be used once
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                <p className="text-rose-600 text-xs font-bold text-center">Invalid or already used recovery code.</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg"
              disabled={isLoading || !recoveryCode.trim()}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                'Unlock with Recovery Code'
              )}
            </Button>
          </form>
        )}

        {/* 2FA mode */}
        {mode === 'totp' && (
          <form onSubmit={handleTOTPSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="totp-code" className="text-slate-700 font-medium">
                Authenticator Code
              </Label>
              <Input
                id="totp-code"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                disabled={isLoading}
                className="h-12 rounded-xl border-slate-200 font-mono tracking-[0.5em] text-center text-xl bg-slate-50/50"
                autoFocus
              />
              <p className="text-[11px] text-slate-400 text-center">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                <p className="text-rose-600 text-xs font-bold text-center">Invalid 2FA code or 2FA unlock not set up.</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-12 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg"
              disabled={isLoading || totpCode.length !== 6}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </span>
              ) : (
                'Unlock with 2FA'
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
