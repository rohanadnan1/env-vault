"use client";

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';

interface SecretEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environmentId: string;
  folderId: string | null;
  onSuccess: () => void;
  initialData?: {
    id: string;
    keyName: string;
    plaintext?: string; // only present if we were able to decrypt it for editing
  };
}

export function SecretEditor({
  open,
  onOpenChange,
  environmentId,
  folderId,
  onSuccess,
  initialData
}: SecretEditorProps) {
  const [keyName, setKeyName] = useState('');
  const [value, setValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  useEffect(() => {
    if (open) {
      setKeyName(initialData?.keyName || '');
      setValue(initialData?.plaintext || '');
    }
  }, [open, initialData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!derivedKey) {
      toast.error('Vault is locked. Re-enter master password.');
      return;
    }

    setIsLoading(true);
    touchActivity();

    try {
      // 1. Encrypt in browser
      const aad = `${keyName}:${environmentId}`;
      const { valueEncrypted, iv } = await encryptSecret(value, derivedKey, aad);

      // 2. POST/PATCH to API
      const url = initialData?.id ? `/api/secrets/${initialData.id}` : '/api/secrets';
      const method = initialData?.id ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyName,
          valueEncrypted,
          iv,
          environmentId,
          folderId,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save secret');
      }

      toast.success(initialData?.id ? 'Secret updated' : 'Secret created');
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{initialData?.id ? 'Edit Secret' : 'Add New Secret'}</DialogTitle>
          <DialogDescription>
            Secrets are encrypted in your browser before being stored.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="keyName">Key Name</Label>
            <Input
              id="keyName"
              placeholder="e.g. DATABASE_URL"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, ''))}
              required
              disabled={isLoading || !!initialData?.id}
              className="font-mono"
            />
            <p className="text-[10px] text-slate-400 font-medium">UPPERCASE, digits, and underscores only</p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="value">Value</Label>
            <Textarea
              id="value"
              placeholder="Paste secret content here..."
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
              disabled={isLoading}
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <DialogFooter className="pt-4">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !keyName || !value}>
              {isLoading ? "Encrypting & Saving..." : initialData?.id ? "Update Secret" : "Save Secret"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
