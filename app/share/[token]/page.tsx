"use client";

import { useState, useEffect, use } from 'react';
import { 
  Lock, 
  Unlock, 
  ShieldAlert, 
  Eye, 
  Copy, 
  Check, 
  Clock,
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { toast } from 'sonner';
import { deriveKeyFromPassphrase, decryptShareBundle } from '@/lib/crypto/share';
import Link from 'next/link';

interface ShareData {
  sharedBy: string;
  scopeType: string;
  bundleEncrypted: string;
  bundleIv: string;
  shareSalt: string;
  createdAt: string;
  note?: string;
  error?: string;
}

export default function ShareRecipientPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [passphrase, setPassphrase] = useState('');
  const [data, setData] = useState<ShareData | null>(null);
  const [secrets, setSecrets] = useState<{ keyName: string; plaintext: string }[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    fetchShareData();
  }, [token]);

  async function fetchShareData() {
    try {
      const res = await fetch(`/api/share/${token}`);
      const json = await res.json();
      if (!res.ok) {
        setData({ error: json.error } as any);
      } else {
        setData(json);
      }
    } catch (err) {
      setData({ error: 'Failed to connect to server' } as any);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !passphrase) return;

    setIsDecrypting(true);
    try {
      // 1. Derive Share Key
      const shareKey = await deriveKeyFromPassphrase(passphrase, data.shareSalt);
      
      // 2. Decrypt Bundle
      const decryptedStr = await decryptShareBundle(data.bundleEncrypted, data.bundleIv, shareKey, token);
      
      const parsed = JSON.parse(decryptedStr);
      setSecrets(parsed);
      toast.success('Bundle decrypted successfully');
    } catch (err) {
      toast.error('Invalid passphrase or corrupted bundle');
    } finally {
      setIsDecrypting(false);
    }
  }

  const copyToClipboard = (text: string, keyName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
    toast.success(`${keyName} copied`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (data?.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <Card className="max-w-md w-full border-none shadow-xl text-center p-8">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-10 h-10 text-rose-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-900 mb-2">Access Denied</CardTitle>
          <CardDescription className="text-slate-500 mb-8">{data.error}</CardDescription>
          <Link href="/">
            <Button className="w-full bg-slate-900">Go to EnVault</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="mb-8 flex flex-col items-center">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-xl shadow-lg">E</div>
          <span className="text-2xl font-black tracking-tighter text-slate-900">ENVAULT</span>
        </div>
        <p className="text-slate-400 text-sm font-medium tracking-wide flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> SECURE SECRETS SHARING
        </p>
      </div>

      {!secrets ? (
        <Card className="max-w-[450px] w-full border-none shadow-2xl overflow-hidden rounded-3xl">
          <div className="h-2 w-full bg-indigo-600" />
          <CardHeader className="pt-8 text-center pb-2">
            <CardTitle className="text-2xl font-bold text-slate-900">Protected Bundle</CardTitle>
            <CardDescription>
              {data?.sharedBy} shared a secure bundle with you.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 px-8">
            {data?.note && (
              <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100 italic text-sm text-slate-600">
                "{data.note}"
              </div>
            )}
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="passphrase">Enter Passphrase</Label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="passphrase"
                    type="password"
                    placeholder="Provided by sender..."
                    className="pl-10 h-12 bg-slate-50/50 border-slate-200 focus:bg-white transition-all rounded-xl"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    required
                  />
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 text-base font-bold bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 group rounded-xl"
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "Decrypting..."
                ) : (
                  <>
                    <Unlock className="w-5 h-5 mr-2 transition-transform group-hover:scale-110" />
                    Unlock Secrets
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="bg-slate-50/50 border-t border-slate-100 flex justify-center py-4">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Link created {new Date(data!.createdAt).toLocaleDateString()}
            </p>
          </CardFooter>
        </Card>
      ) : (
        <div className="max-w-[800px] w-full animate-in fade-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center mb-6 px-2">
            <div>
              <h2 className="text-3xl font-bold text-slate-900">Decrypted Secrets</h2>
              <p className="text-slate-500 mt-1">These secrets are available only while this tab is open.</p>
            </div>
            <Button variant="ghost" onClick={() => setSecrets(null)} className="text-slate-400 hover:text-indigo-600">
              <ArrowLeft className="w-4 h-4 mr-2" /> Lock Again
            </Button>
          </div>

          <div className="grid gap-4">
            {secrets.map((secret) => (
              <Card key={secret.keyName} className="border-none shadow-md overflow-hidden hover:shadow-lg transition-shadow rounded-2xl">
                <div className="flex items-stretch h-14 sm:h-auto">
                  <div className="bg-slate-50 w-32 sm:w-48 flex items-center px-4 border-r border-slate-100 shrink-0">
                    <span className="font-mono font-bold text-slate-900 truncate text-sm">{secret.keyName}</span>
                  </div>
                  <div className="flex-1 flex items-center justify-between px-4 truncate bg-white">
                    <span className="font-mono text-sm text-indigo-600 truncate select-all">{secret.plaintext}</span>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => copyToClipboard(secret.plaintext, secret.keyName)}
                      className="ml-2 h-8 w-8 text-slate-400 hover:text-indigo-600 shrink-0"
                    >
                      {copiedKey === secret.keyName ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          
          <div className="mt-12 p-6 bg-amber-50 rounded-2xl border border-amber-100 flex gap-4">
            <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-amber-900">Security Notice</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                This is a secure EnVault share. For your security, this link may be single-use or set to expire soon. 
                Record these secrets in a safe location as they will be inaccessible once the link is revoked.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Label({ children, className, ...props }: any) {
  return <label className={`text-sm font-semibold text-slate-700 ${className}`} {...props}>{children}</label>;
}
