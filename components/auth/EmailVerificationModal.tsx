"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MailCheck, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface EmailVerificationModalProps {
  open: boolean;
  userId: string;
  email: string;
  name?: string | null;
  onVerified: () => Promise<void> | void;
  onCancel: () => void;
}

export function EmailVerificationModal({
  open,
  userId,
  email,
  name,
  onVerified,
  onCancel,
}: EmailVerificationModalProps) {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(30);

  useEffect(() => {
    if (!open) return;
    setCode('');
    setResendCooldown(30);
  }, [open, userId]);

  useEffect(() => {
    if (!open || resendCooldown <= 0) return;
    const timer = window.setTimeout(() => setResendCooldown((v) => v - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [open, resendCooldown]);

  const maskedEmail = useMemo(() => {
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
  }, [email]);

  async function handleVerify() {
    const normalized = code.replace(/\D/g, '').slice(0, 6);
    if (normalized.length !== 6) {
      toast.error('Enter the 6-digit code from your email');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch('/api/auth/email-verification/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: normalized }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Verification failed');
        return;
      }

      toast.success('Email verified');
      await onVerified();
    } catch {
      toast.error('Could not verify your email right now');
    } finally {
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    setIsResending(true);
    try {
      const res = await fetch('/api/auth/email-verification/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Could not resend verification code');
        return;
      }

      setResendCooldown(30);
      toast.success('Verification code sent');
    } catch {
      toast.error('Could not resend verification code');
    } finally {
      setIsResending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !isVerifying && !isResending) onCancel(); }}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-indigo-700 font-bold text-lg">
            <MailCheck className="w-5 h-5 shrink-0" />
            Verify Your Email
          </DialogTitle>
          <DialogDescription className="pt-1 text-slate-600 leading-relaxed">
            We sent a 6-digit verification code to <span className="font-semibold text-slate-800">{maskedEmail}</span>.
            Enter it below to continue into EnVault.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3.5 py-3 text-sm">
          <MailCheck className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
          <div className="text-indigo-900 space-y-0.5">
            <p className="font-semibold">{name?.trim() || 'Account verification'}</p>
            <p className="text-xs text-indigo-700">
              The code expires in 10 minutes and is required before sign-in is allowed.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="verification-code">6-digit code</Label>
          <Input
            id="verification-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && handleVerify()}
            className="font-mono text-center text-lg tracking-[0.45em] h-11"
            disabled={isVerifying || isResending}
            autoFocus
            maxLength={6}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span>Didn&apos;t get the email?</span>
          <Button
            type="button"
            variant="ghost"
            className="h-auto px-0 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            onClick={handleResend}
            disabled={isResending || resendCooldown > 0}
          >
            {isResending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                Resending…
              </>
            ) : resendCooldown > 0 ? (
              `Resend in ${resendCooldown}s`
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Resend code
              </>
            )}
          </Button>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            variant="ghost"
            className="border border-slate-200"
            onClick={onCancel}
            disabled={isVerifying || isResending}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={handleVerify}
            disabled={isVerifying || isResending || code.length !== 6}
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Verifying…
              </>
            ) : (
              'Verify & Continue'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
