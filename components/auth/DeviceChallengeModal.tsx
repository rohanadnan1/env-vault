"use client";

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, Smartphone, KeyRound, Loader2, MonitorSmartphone } from 'lucide-react';
import { toast } from 'sonner';

interface DeviceChallengeModalProps {
  open: boolean;
  challengeId: string;
  deviceId: string;
  hasTotp: boolean;
  hasRecoveryCodes: boolean;
  deviceLabel: string;
  ip: string | null;
  onVerified: () => void;
  onCancel: () => void;
}

export function DeviceChallengeModal({
  open,
  challengeId,
  deviceId,
  hasTotp,
  hasRecoveryCodes,
  deviceLabel,
  ip,
  onVerified,
  onCancel,
}: DeviceChallengeModalProps) {
  const [tab, setTab] = useState<string>(hasTotp ? 'totp' : 'recovery');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  async function handleVerify() {
    const codeType = tab as 'totp' | 'recovery';
    const code = codeType === 'totp' ? totpCode : recoveryCode;

    if (!code.trim()) {
      toast.error('Please enter a code');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/device-challenge/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId,
          code: code.trim(),
          codeType,
          trustDevice,
          deviceId,
          userAgent: navigator.userAgent,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Verification failed');
        return;
      }

      onVerified();
    } catch {
      toast.error('Something went wrong — please try again');
    } finally {
      setIsLoading(false);
    }
  }

  function handleTotpInput(val: string) {
    // Only digits, max 6
    setTotpCode(val.replace(/\D/g, '').slice(0, 6));
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isLoading) onCancel(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 font-bold text-lg">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            New Sign-in Detected
          </DialogTitle>
          <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
            We noticed a sign-in from an unrecognised device or location.
            Please verify your identity to continue.
          </DialogDescription>
        </DialogHeader>

        {/* Context card */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50 px-3.5 py-3 text-sm">
          <MonitorSmartphone className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
          <div className="text-amber-800 space-y-0.5">
            <p className="font-semibold">{deviceLabel}</p>
            {ip && <p className="text-xs text-amber-600 font-mono">{ip}</p>}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full">
            {hasTotp && (
              <TabsTrigger value="totp" className="flex-1 gap-1.5">
                <Smartphone className="w-3.5 h-3.5" /> Authenticator App
              </TabsTrigger>
            )}
            {hasRecoveryCodes && (
              <TabsTrigger value="recovery" className="flex-1 gap-1.5">
                <KeyRound className="w-3.5 h-3.5" /> Recovery Code
              </TabsTrigger>
            )}
          </TabsList>

          {hasTotp && (
            <TabsContent value="totp" className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="totp-code">6-digit code from your authenticator app</Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={totpCode}
                  onChange={(e) => handleTotpInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && totpCode.length === 6 && handleVerify()}
                  className="font-mono text-center text-lg tracking-[0.4em] h-11"
                  disabled={isLoading}
                  autoFocus
                  maxLength={6}
                />
              </div>
            </TabsContent>
          )}

          {hasRecoveryCodes && (
            <TabsContent value="recovery" className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="recovery-code">Recovery code</Label>
                <Input
                  id="recovery-code"
                  placeholder="xxxxxxxxxxxxxxxx"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                  className="font-mono"
                  disabled={isLoading}
                  autoFocus={!hasTotp}
                />
                <p className="text-[11px] text-slate-400">
                  16-character hex code from your saved recovery codes. Using a code marks it as spent.
                </p>
              </div>
            </TabsContent>
          )}
        </Tabs>

        {/* Trust device toggle */}
        <label className="flex items-center gap-2.5 cursor-pointer select-none group">
          <div
            role="checkbox"
            aria-checked={trustDevice}
            tabIndex={0}
            onClick={() => setTrustDevice((v) => !v)}
            onKeyDown={(e) => e.key === ' ' && setTrustDevice((v) => !v)}
            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
              trustDevice ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'
            }`}
          >
            {trustDevice && (
              <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span className="text-sm text-slate-600">
            Trust this device for <span className="font-semibold text-slate-800">30 days</span>
          </span>
        </label>

        <div className="flex gap-2 pt-1">
          <Button
            variant="ghost"
            className="border border-slate-200"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={handleVerify}
            disabled={isLoading || (tab === 'totp' && totpCode.length !== 6)}
          >
            {isLoading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verifying…</>
              : 'Verify & Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
