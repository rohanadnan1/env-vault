"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface RenameFolderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string;
  initialName: string;
}

export function RenameFolderModal({ 
  open, 
  onOpenChange,
  folderId,
  initialName
}: RenameFolderModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(initialName);

  // Sync name when modal opens with new data
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);

  async function onSubmit(e: React.FormEvent) {
    if (!name.trim()) return;
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim()
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to rename folder');
      }

      toast.success('Folder renamed successfully');
      onOpenChange(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename Folder</DialogTitle>
          <DialogDescription>
            Change the display name of this folder.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">New Name</Label>
            <Input
              id="folder-name"
              placeholder="e.g. Production Configs"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="flex justify-end pt-4 gap-3">
            <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim() || name.trim() === initialName}>
              {isLoading ? "Renaming..." : "Rename Folder"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
