"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ChevronRight, MoreHorizontal, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ClientEnvironmentCardProps {
  env: {
    id: string;
    name: string;
    _count: { secrets: number; folders: number };
  };
  projectId: string;
}

export function ClientEnvironmentCard({ env, projectId }: ClientEnvironmentCardProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const dotColor =
    env.name.toLowerCase() === 'production'
      ? 'bg-rose-500'
      : env.name.toLowerCase() === 'staging'
      ? 'bg-amber-500'
      : 'bg-emerald-500';

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/environments/${env.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(`Environment "${env.name}" deleted`);
      setIsDeleteOpen(false);
      router.refresh();
    } catch {
      toast.error('Could not delete environment');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Wrapper — position relative so the kebab sits on top of the Link */}
      <div className="relative group">
        <Link href={`/projects/${projectId}/${env.id}`} className="block">
          <Card className="hover:border-indigo-400 transition-all hover:bg-slate-50/50 cursor-pointer border-slate-200 h-full">
            <CardContent className="p-5">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
                  <span className="font-bold text-slate-900 capitalize">{env.name}</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Secrets</p>
                  <p className="text-lg font-bold text-slate-700">{env._count.secrets}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Folders</p>
                  <p className="text-lg font-bold text-slate-700">{env._count.folders}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Kebab menu — floats above the Link card */}
        <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  id={`env-menu-${env.id}`}
                  className="p-1.5 rounded-md bg-white shadow-sm border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 transition-colors outline-none"
                  onClick={(e) => e.preventDefault()}
                  aria-label={`Options for ${env.name}`}
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                className="text-rose-600 focus:text-rose-600 focus:bg-rose-50 cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  setConfirmName('');
                  setIsDeleteOpen(true);
                }}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" />
                Delete Environment
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog
        open={isDeleteOpen}
        onOpenChange={(v) => {
          if (!isDeleting) {
            setIsDeleteOpen(v);
            if (!v) setConfirmName('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              Delete Environment?
            </DialogTitle>
            <DialogDescription className="pt-1">
              This will permanently delete the{' '}
              <span className="font-semibold text-slate-800 capitalize">{env.name}</span> environment
              and all its secrets, folders, and files. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label className="text-xs text-slate-500">
              Type{' '}
              <span className="font-mono font-bold text-slate-700">{env.name}</span> to confirm
            </Label>
            <Input
              id={`confirm-delete-env-${env.id}`}
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              placeholder={env.name}
              disabled={isDeleting}
              className="border-rose-100 focus:border-rose-400 focus:ring-rose-400/20"
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => { setIsDeleteOpen(false); setConfirmName(''); }}
              disabled={isDeleting}
              className="flex-1 border border-slate-200"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting || confirmName !== env.name}
              className="flex-1 font-bold shadow-lg shadow-rose-200"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete Environment'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
