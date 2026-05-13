"use client";

import { useEffect, useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import Link from 'next/link';
import { EmailVerificationModal } from '@/components/auth/EmailVerificationModal';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirm: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [pendingVerification, setPendingVerification] = useState<{
    userId: string;
    email: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    const prefilledEmail = searchParams.get('email');
    if (!prefilledEmail) return;
    setFormData((current) => current.email === prefilledEmail ? current : { ...current, email: prefilledEmail });
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (formData.password !== formData.confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (formData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to register');
      }

      const payload = await res.json();
      setPendingVerification({
        userId: payload.userId,
        email: payload.email,
        name: payload.name || formData.name,
      });
      toast.success('Verification code sent to your email');
    } catch (err) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('Failed to register');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div>
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Create your EnVault</h1>
          <p className="text-slate-500 mt-2 text-sm">Sign up to start securing your secrets</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input 
              id="name" 
              type="text" 
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required 
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              type="email" 
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="m@example.com" 
              required 
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput 
              id="password" 
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              required 
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm Password</Label>
            <PasswordInput 
              id="confirm" 
              value={formData.confirm}
              onChange={(e) => setFormData({...formData, confirm: e.target.value})}
              required 
              disabled={isLoading}
            />
          </div>
          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading ? "Creating account..." : "Sign Up"}
          </Button>
        </form>
        
        <div className="mt-6 text-center text-sm">
          <span className="text-slate-500">Already have an account? </span>
          <Link href="/login" className="text-indigo-600 hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </div>

      {pendingVerification && (
        <EmailVerificationModal
          open
          userId={pendingVerification.userId}
          email={pendingVerification.email}
          name={pendingVerification.name}
          onVerified={async () => {
            const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
            const res = await signIn('credentials', {
              redirect: false,
              email: formData.email,
              password: formData.password,
            });
            if (res?.error) {
              toast.success('Email verified. Please sign in.');
              router.push('/login');
              return;
            }
            router.push(callbackUrl);
            router.refresh();
          }}
          onCancel={() => setPendingVerification(null)}
        />
      )}
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" /></div>}>
      <RegisterForm />
    </Suspense>
  );
}
