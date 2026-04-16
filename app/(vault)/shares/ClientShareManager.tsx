"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Copy as CopyIcon, Check as CheckIcon, Trash2 as TrashIcon, ShieldAlert as AlertIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function ClientShareManager({ 
  id, 
  accessToken, 
  isRevoked 
}: { 
  id: string; 
  accessToken: string;
  isRevoked: boolean;
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const router = useRouter();

  const handleCopy = () => {
    const url = `${window.location.origin}/share/${accessToken}`;
    navigator.clipboard.writeText(url);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast.success('Link copied to clipboard');
  };

  const handleRevoke = async () => {
    if (!confirm('Are you sure you want to revoke this share link? It will become immediately inaccessible.')) {
      return;
    }

    setIsRevoking(true);
    try {
      const res = await fetch(`/api/share/manage/${id}`, { method: 'PATCH' });
      if (!res.ok) throw new Error('Revocation failed');
      toast.success('Share link revoked');
      router.refresh();
    } catch (err) {
      toast.error('Could not revoke link');
      setIsRevoking(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this share record entirely? This will also delete access logs.')) {
      return;
    }

    try {
      const res = await fetch(`/api/share/manage/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Deletion failed');
      toast.success('Share record deleted');
      router.refresh();
    } catch (err) {
      toast.error('Could not delete record');
    }
  };

  if (isRevoked) {
    return (
      <Button 
        variant="ghost" 
        size="sm" 
        className="w-full text-rose-600 hover:text-rose-700 hover:bg-rose-50"
        onClick={handleDelete}
      >
        <TrashIcon className="w-4 h-4 mr-2" /> Delete Record
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" className="flex-1" onClick={handleCopy}>
        {isCopied ? <CheckIcon className="w-4 h-4 mr-2" /> : <CopyIcon className="w-4 h-4 mr-2" />}
        {isCopied ? 'Copied' : 'Copy Link'}
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
        onClick={handleRevoke}
        disabled={isRevoking}
      >
        <AlertIcon className="w-4 h-4 mr-2" /> Revoke
      </Button>
    </>
  );
}
