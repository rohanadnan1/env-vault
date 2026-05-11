"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createEncryptedSpaceKeyForCurrentUser } from '@/lib/crypto/private-space-client';
import { toast } from 'sonner';

type Props = {
  userId: string;
  disabled?: boolean;
  onCreated?: (space: {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    _count?: {
      members: number;
      kingFiles: number;
      kingSecrets: number;
      invitations: number;
    };
  }) => void;
};

const RECENT_PRIVATE_SPACES_STORAGE_KEY = 'envvault.recent-private-spaces';

export function CreatePrivateSpaceModal({ userId, disabled, onCreated }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      const setup = await createEncryptedSpaceKeyForCurrentUser(userId);

      await fetch('/api/account/vault-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultPublicKey: setup.record.publicKey,
          vaultPublicKeyAlgorithm: setup.record.algorithm,
        }),
      });

      const res = await fetch('/api/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          encryptedSpaceKey: setup.encryptedSpaceKey,
          encryptedSpaceKeyAlgorithm: setup.encryptedSpaceKeyAlgorithm,
        }),
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Could not create private space');

      const createdSpace = {
        id: payload.id,
        name: payload.name ?? trimmed,
        createdAt: payload.createdAt ?? new Date().toISOString(),
        updatedAt: payload.updatedAt ?? new Date().toISOString(),
        _count: {
          members: 1,
          kingFiles: 0,
          kingSecrets: 0,
          invitations: 0,
        },
      };

      try {
        const raw = window.localStorage.getItem(RECENT_PRIVATE_SPACES_STORAGE_KEY);
        const current = raw ? JSON.parse(raw) as typeof createdSpace[] : [];
        const next = [createdSpace, ...current.filter((space) => space.id !== createdSpace.id)];
        window.localStorage.setItem(RECENT_PRIVATE_SPACES_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures
      }

      onCreated?.(createdSpace);
      toast.success('Private space created');
      setOpen(false);
      setName('');
      router.push(`/spaces/${payload.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create private space');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} className="bg-indigo-600 hover:bg-indigo-700" disabled={disabled}>
        {disabled ? 'Setting up keys...' : 'New Private Space'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Private Space</DialogTitle>
            <DialogDescription>
              Create a collaborative space with personal forks and shared king resources.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">Space Name</label>
              <p className="text-xs text-slate-500">This works like creating a project, but for encrypted collaborative forks.</p>
            </div>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Frontend Platform"
              maxLength={80}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
