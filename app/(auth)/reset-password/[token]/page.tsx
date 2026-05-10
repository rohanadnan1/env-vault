"use client";

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  useEffect(() => {
    async function validateLink() {
      try {
        const res = await fetch(`/api/auth/password-reset/${token}`);
        const data = await res.json();

        if (!res.ok) {
          setLinkError(data.error || 'This reset link is invalid.');
          return;
        }

        setAccountEmail(data.email || null);
      } catch {
        setLinkError('Failed to validate reset link.');
      } finally {
        setIsLoading(false);
      }
    }

    void validateLink();
  }, [token]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/auth/password-reset/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Could not reset password');
      }

      toast.success('Password updated. Sign in with your new password.');
      router.push('/login');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reset password');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="text-center text-sm text-slate-500">
        Validating reset link…
      </div>
    );
  }

  if (linkError) {
    return (
      <div className="space-y-5">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900">Reset link unavailable</h1>
          <p className="text-slate-500 mt-2 text-sm">{linkError}</p>
        </div>
        <div className="text-center text-sm">
          <Link href="/forgot-password" className="text-indigo-600 hover:underline font-medium">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
        <p className="text-slate-500 mt-2 text-sm">
          {accountEmail ? `Resetting password for ${accountEmail}` : 'Choose a new password for your account.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
            disabled={isSubmitting}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            minLength={8}
            required
            disabled={isSubmitting}
          />
        </div>
        <Button className="w-full" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Updating password…' : 'Update password'}
        </Button>
      </form>

      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="text-indigo-600 hover:underline font-medium">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
