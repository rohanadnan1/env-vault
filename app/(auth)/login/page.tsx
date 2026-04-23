"use client";

import { useState, useEffect } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { DeviceChallengeModal } from '@/components/auth/DeviceChallengeModal';

// Stable device ID persisted in a cookie for 30 days
function getOrCreateDeviceId(): string {
  const name = 'ev_did';
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  if (match) return decodeURIComponent(match[1]);
  const id = crypto.randomUUID();
  document.cookie = `${name}=${encodeURIComponent(id)};max-age=2592000;path=/;SameSite=Strict`;
  return id;
}

interface ChallengeState {
  challengeId: string;
  hasTotp: boolean;
  hasRecoveryCodes: boolean;
  deviceLabel: string;
  ip: string | null;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [challenge, setChallenge] = useState<ChallengeState | null>(null);

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  async function doSignIn() {
    const res = await signIn('credentials', { redirect: false, email, password });
    if (res?.error) {
      toast.error('Sign-in failed — please try again');
    } else {
      toast.success('Signed in successfully');
      router.push('/dashboard');
      router.refresh();
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deviceId) return;
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/pre-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, deviceId, userAgent: navigator.userAgent }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Invalid email or password');
        return;
      }

      if (data.status === 'challenge') {
        setChallenge({
          challengeId: data.challengeId,
          hasTotp: data.hasTotp,
          hasRecoveryCodes: data.hasRecoveryCodes,
          deviceLabel: data.deviceLabel,
          ip: data.ip,
        });
        return;
      }

      // Device trusted — proceed with NextAuth session
      await doSignIn();
    } catch {
      toast.error('Something went wrong — please try again');
    } finally {
      setIsLoading(false);
    }
  }

  async function onChallengeVerified() {
    setChallenge(null);
    setIsLoading(true);
    try {
      await doSignIn();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Sign in to your Vault</h1>
          <p className="text-slate-500 mt-2 text-sm">Enter your credentials to access your secrets</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="m@example.com"
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <Button className="w-full" type="submit" disabled={isLoading || !deviceId}>
            {isLoading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm">
          <span className="text-slate-500">Don&apos;t have an account? </span>
          <Link href="/register" className="text-indigo-600 hover:underline font-medium">
            Create one
          </Link>
        </div>
      </div>

      {challenge && (
        <DeviceChallengeModal
          open
          challengeId={challenge.challengeId}
          deviceId={deviceId}
          hasTotp={challenge.hasTotp}
          hasRecoveryCodes={challenge.hasRecoveryCodes}
          deviceLabel={challenge.deviceLabel}
          ip={challenge.ip}
          onVerified={onChallengeVerified}
          onCancel={() => { setChallenge(null); setIsLoading(false); }}
        />
      )}
    </>
  );
}
