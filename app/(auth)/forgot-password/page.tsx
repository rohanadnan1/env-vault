"use client";

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Could not send reset email');
      }

      setIsSubmitted(true);
      toast.success('If that account exists, a reset link has been sent.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send reset email');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">Forgot your password?</h1>
        <p className="text-slate-500 mt-2 text-sm">
          Enter your account email and we&apos;ll send you a one-time reset link.
        </p>
      </div>

      {!isSubmitted ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="m@example.com"
              required
              disabled={isLoading}
            />
          </div>
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? 'Sending link…' : 'Send reset link'}
          </Button>
        </form>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Check your inbox for the password reset link. The link expires in 30 minutes and works only once.
        </div>
      )}

      <div className="mt-6 text-center text-sm">
        <Link href="/login" className="text-indigo-600 hover:underline font-medium">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
