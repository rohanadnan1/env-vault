"use client";

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ShieldAlert, Smartphone, KeyRound, Loader2, MonitorX, MonitorSmartphone, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';

type Step = 'verify' | 'confirm-device' | 'done';
type CodeType = 'totp' | 'recovery';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasTotp: boolean;
  hasRecoveryCodes: boolean;
}

export function SignOutAllDevicesModal({ open, onOpenChange, hasTotp, hasRecoveryCodes }: Props) {
  const [step, setStep] = useState<Step>('verify');
  const [codeType, setCodeType] = useState<CodeType>(hasTotp ? 'totp' : 'recovery');
  const [code, setCode] = useState('');
  const [verifyId, setVerifyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  function handleClose() {
    if (isLoading) return;
    onOpenChange(false);
    setTimeout(() => { setStep('verify'); setCode(''); setVerifyId(null); }, 300);
  }

  // Step 1 — verify identity, get a short-lived verifyId
  async function handleVerify() {
    if (!code.trim()) { toast.error('Please enter a code'); return; }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/sign-out-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim(), codeType }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Verification failed'); return; }
      setVerifyId(data.verifyId);
      setStep('confirm-device');
    } catch {
      toast.error('Something went wrong — please try again');
    } finally {
      setIsLoading(false);
    }
  }

  // Step 2a — keep current device: server re-issues JWT with new sessionVersion
  async function handleKeepCurrentDevice() {
    if (!verifyId) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/sign-out-all/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifyId, keepCurrentDevice: true }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? 'Failed to complete sign-out'); return; }

      if (data.relogin) {
        // Edge case: server couldn't re-issue the JWT — sign out and re-login
        toast.info('Please sign in again to continue');
        await signOut({ redirect: false });
        window.location.href = '/login';
        return;
      }

      // Server already replaced the session cookie — no update() needed
      setStep('done');
    } catch {
      toast.error('Something went wrong — please try again');
    } finally {
      setIsLoading(false);
    }
  }

  // Step 2b — sign out everywhere including current device
  async function handleSignOutEverywhere() {
    if (!verifyId) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/sign-out-all/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verifyId, keepCurrentDevice: false }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to complete sign-out');
        return;
      }
      await signOut({ redirect: false });
      window.location.href = '/login';
    } catch {
      toast.error('Something went wrong — please try again');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[460px]">

        {/* ── Step 1: Verify identity ─────────────────────────────── */}
        {step === 'verify' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <MonitorX className="w-5 h-5 text-red-500 shrink-0" />
                Sign Out of All Devices
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
                This will immediately invalidate all active sessions.
                Verify your identity before continuing.
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
                  onClick={() => { setCodeType('totp'); setCode(''); }}
                >
                  <Smartphone className="w-3.5 h-3.5" /> Authenticator App
                </button>
                <button
                  className={cn(
                    'flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors border-l border-slate-200',
                    codeType === 'recovery' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  )}
                  onClick={() => { setCodeType('recovery'); setCode(''); }}
                >
                  <KeyRound className="w-3.5 h-3.5" /> Recovery Code
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              {codeType === 'totp' ? (
                <>
                  <Label htmlFor="soa-code">6-digit code from your authenticator app</Label>
                  <Input
                    id="soa-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && handleVerify()}
                    className="font-mono text-center text-lg tracking-[0.4em] h-11"
                    disabled={isLoading}
                    autoFocus
                    maxLength={6}
                  />
                </>
              ) : (
                <>
                  <Label htmlFor="soa-recovery">Recovery code</Label>
                  <Input
                    id="soa-recovery"
                    placeholder="xxxxxxxxxxxxxxxx"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    className="font-mono"
                    disabled={isLoading}
                    autoFocus={!hasTotp}
                  />
                  <p className="text-[11px] text-slate-400">
                    16-character hex code. Using it marks it as spent.
                  </p>
                </>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="ghost" className="border border-slate-200" onClick={handleClose} disabled={isLoading}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={handleVerify}
                disabled={isLoading || (codeType === 'totp' && code.length !== 6)}
              >
                {isLoading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying…</>
                  : 'Verify Identity'}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: Ask about current device ───────────────────── */}
        {step === 'confirm-device' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0" />
                Sign Out This Device Too?
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
                All other devices will be signed out. Do you also want to sign out of
                the device you&apos;re currently using?
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2.5 py-1">
              <button
                className="w-full flex items-start gap-3.5 rounded-xl border-2 border-slate-200 hover:border-red-300 hover:bg-red-50 p-4 text-left transition-all group disabled:opacity-60"
                onClick={handleSignOutEverywhere}
                disabled={isLoading}
              >
                {isLoading
                  ? <Loader2 className="w-5 h-5 mt-0.5 text-red-400 shrink-0 animate-spin" />
                  : <MonitorX className="w-5 h-5 mt-0.5 text-red-500 shrink-0" />}
                <div>
                  <p className="font-bold text-slate-900 text-sm group-hover:text-red-700">
                    Yes, sign me out everywhere
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    You&apos;ll be taken to the login page immediately.
                  </p>
                </div>
              </button>

              <button
                className="w-full flex items-start gap-3.5 rounded-xl border-2 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 p-4 text-left transition-all group disabled:opacity-60"
                onClick={handleKeepCurrentDevice}
                disabled={isLoading}
              >
                {isLoading
                  ? <Loader2 className="w-5 h-5 mt-0.5 text-indigo-400 shrink-0 animate-spin" />
                  : <MonitorSmartphone className="w-5 h-5 mt-0.5 text-indigo-500 shrink-0" />}
                <div>
                  <p className="font-bold text-slate-900 text-sm group-hover:text-indigo-700">
                    No, keep me logged in here
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Stay signed in on this device only.
                  </p>
                </div>
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Done ────────────────────────────────────────── */}
        {step === 'done' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-emerald-600 font-bold text-lg">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                All Other Devices Signed Out
              </DialogTitle>
              <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
                Every other active session has been invalidated. You remain signed in on this device.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white" onClick={handleClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}
