'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LogOut, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function LeaveButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const handleLeave = async () => {
    setLeaving(true);
    try {
      const res = await fetch(`/api/sharing/manage/${invitationId}/leave`, { method: 'POST' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed');
      }
      toast.success('Access removed');
      setShow(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove access');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="text-[10px] text-rose-500 hover:text-rose-700 hover:underline shrink-0 ml-2"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShow(true); }}
      >
        Leave
      </button>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 font-bold">
              <LogOut className="w-4 h-4" />
              Leave This Resource
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              You will lose access to this resource. The sender will need to share it again for you to regain access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 gap-3 sm:justify-between">
            <Button variant="ghost" onClick={() => setShow(false)} className="flex-1 border border-slate-200 rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeave} disabled={leaving} className="flex-1 rounded-xl font-bold">
              {leaving ? 'Leaving...' : 'Yes, Leave'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LeaveProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const handleLeave = async () => {
    setLeaving(true);
    try {
      const res = await fetch('/api/sharing/leave-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed');
      }
      const data = await res.json();
      toast.success(`Left project. ${data.removed || 0} access${data.removed !== 1 ? 'es' : ''} removed.`);
      setShow(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove access');
    } finally {
      setLeaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="text-[10px] font-medium text-rose-500 hover:text-rose-700 hover:underline shrink-0"
        onClick={() => setShow(true)}
      >
        <LogOut className="w-3 h-3 inline mr-1" />
        Leave Project
      </button>

      <Dialog open={show} onOpenChange={setShow}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 font-bold">
              <LogOut className="w-4 h-4" />
              Leave {projectName}
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              You will lose access to ALL shared resources in this project. The sender will need to share everything again for you to regain access.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 gap-3 sm:justify-between">
            <Button variant="ghost" onClick={() => setShow(false)} className="flex-1 border border-slate-200 rounded-xl">
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeave} disabled={leaving} className="flex-1 rounded-xl font-bold">
              {leaving ? 'Leaving...' : 'Yes, Leave Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
