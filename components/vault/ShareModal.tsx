"use client";

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { 
  Share2, 
  Link as LinkIcon, 
  Copy, 
  Check, 
  ShieldCheck, 
  Lock, 
  Calendar,
  UserPlus
} from 'lucide-react';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { deriveKeyFromPassphrase, encryptShareBundle } from '@/lib/crypto/share';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';

interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scopeType: 'PROJECT' | 'ENV' | 'FOLDER';
  scopeId: string;
  scopeName: string;
  /** Required when scopeType === 'FOLDER': the parent environment ID */
  envId?: string;
}

export function ShareModal({
  open,
  onOpenChange,
  scopeType,
  scopeId,
  scopeName,
  envId
}: ShareModalProps) {
  const [step, setStep] = useState<'options' | 'result'>('options');
  const [passphrase, setPassphrase] = useState('');
  const [expiry, setExpiry] = useState('24h');
  const [singleUse, setSingleUse] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  const handleCreateShare = async () => {
    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }
    if (passphrase.length < 8) {
      toast.error('Passphrase must be at least 8 characters');
      return;
    }

    setIsProcessing(true);
    touchActivity();

    try {
      // 1. Fetch secrets in scope
      let secrets: any[] = [];

      if (scopeType === 'ENV') {
        const res = await fetch(`/api/secrets?envId=${scopeId}`);
        if (!res.ok) throw new Error('Failed to fetch secrets');
        secrets = await res.json();
      } else if (scopeType === 'FOLDER') {
        if (!envId) throw new Error('envId is required for FOLDER scope');
        const res = await fetch(`/api/secrets?envId=${envId}&folderId=${scopeId}`);
        if (!res.ok) throw new Error('Failed to fetch secrets');
        secrets = await res.json();
      } else if (scopeType === 'PROJECT') {
        // Fetch all projects to locate this one, then collect secrets per environment
        const projectsRes = await fetch('/api/projects');
        if (!projectsRes.ok) throw new Error('Failed to fetch project data');
        const projects = await projectsRes.json();
        const project = projects.find((p: any) => p.id === scopeId);
        if (!project) throw new Error('Project not found');
        for (const env of project.environments ?? []) {
          const envRes = await fetch(`/api/secrets?envId=${env.id}`);
          if (envRes.ok) {
            const envSecrets = await envRes.json();
            secrets.push(...envSecrets);
          }
        }
      }

      if (secrets.length === 0) {
        toast.error('No secrets found in this scope to share');
        setIsProcessing(false);
        return;
      }

      // 2. Decrypt with MasterKey -> Plaintext Bundle
      const plaintextSecrets = [];
      for (const s of secrets) {
        const aad = `${s.keyName}:${s.environmentId}`;
        const plaintext = await decryptSecret(s.valueEncrypted, s.iv, derivedKey, aad);
        plaintextSecrets.push({ keyName: s.keyName, plaintext });
      }
      const bundleStr = JSON.stringify(plaintextSecrets);

      // 3. Setup Share Key
      const shareSalt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      const shareKey = await deriveKeyFromPassphrase(passphrase, shareSalt);

      // 4. Generate random token first for AAD
      const tempToken = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/[^a-zA-Z0-9]/g, '');

      // 5. Re-encrypt with ShareKey
      const { bundleEncrypted, bundleIv } = await encryptShareBundle(bundleStr, shareKey, tempToken);

      // 6. POST to API
      const shareRes = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scopeType,
          scopeId,
          bundleEncrypted,
          bundleIv,
          shareSalt,
          singleUse,
          recipientEmail: recipient || null,
          expiresAt: calculateExpiry(expiry),
        }),
      });

      if (!shareRes.ok) throw new Error('API failed');
      const shareData = await shareRes.json();

      setShareUrl(shareData.url);
      setStep('result');
      toast.success('Share link generated!');
    } catch (err) {
      console.error(err);
      toast.error('Could not create share link');
    } finally {
      setIsProcessing(false);
    }
  };

  const calculateExpiry = (val: string) => {
    const now = new Date();
    if (val === '1h') return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    if (val === '24h') return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    if (val === '7d') return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    return null;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast.success('Link copied');
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!isProcessing) {
        onOpenChange(val);
        if (!val) {
          setStep('options');
          setPassphrase('');
          setRecipient('');
        }
      }
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-indigo-600" />
            Share {scopeType.toLowerCase()}: {scopeName}
          </DialogTitle>
          <DialogDescription>
            Create a secure, time-bound link to share these secrets.
          </DialogDescription>
        </DialogHeader>

        {step === 'options' ? (
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="passphrase">Protection Passphrase</Label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  id="passphrase"
                  type="password"
                  placeholder="Set a one-time passphrase..."
                  className="pl-9"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-slate-400">Recipient will need this to decrypt the bundle.</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Link Expiry</Label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select 
                    className="w-full flex h-10 rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={expiry}
                    onChange={(e) => setExpiry(e.target.value)}
                  >
                    <option value="1h">1 Hour</option>
                    <option value="24h">24 Hours</option>
                    <option value="7d">7 Days</option>
                    <option value="never">Never (Manual Revoke)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-end pb-2">
                <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-lg border border-slate-100 w-full justify-between">
                  <Label htmlFor="single-use" className="text-xs cursor-pointer">Single Use</Label>
                  <Switch id="single-use" checked={singleUse} onCheckedChange={setSingleUse} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recipient">Recipient Email (Optional)</Label>
              <div className="relative">
                <UserPlus className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  id="recipient"
                  placeholder="hello@example.com"
                  className="pl-9"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                />
              </div>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg flex gap-3">
              <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                Secrets are re-encrypted using the passphrase. The server never sees the raw keys or your master password.
              </p>
            </div>
          </div>
        ) : (
          <div className="py-8 space-y-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 mb-2">
              <Check className="w-8 h-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Link Generated</h3>
              <p className="text-sm text-slate-500 mt-1">Copy the link below and share it with your recipient.</p>
            </div>
            
            <div className="w-full flex items-center gap-2 p-1.5 bg-slate-900 rounded-xl border border-slate-800">
              <div className="flex-1 px-3 overflow-hidden">
                <p className="text-xs font-mono text-emerald-400 truncate">{shareUrl}</p>
              </div>
              <Button size="sm" onClick={copyToClipboard} className="bg-indigo-600 hover:bg-indigo-700 h-9">
                {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span className="ml-2">Copy</span>
              </Button>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-3 text-left">
              <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Remember:</strong> You must also provide the recipient with the <strong>passphrase</strong> separately. 
                We do not include it in the link for security reasons.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="pt-2">
          {step === 'options' ? (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isProcessing}>Cancel</Button>
              <Button onClick={handleCreateShare} disabled={isProcessing || passphrase.length < 8}>
                {isProcessing ? "Encrypting Bundle..." : "Generate Secure Link"}
              </Button>
            </>
          ) : (
            <Button className="w-full" onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
