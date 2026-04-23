"use client";

import { useState } from 'react';
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
import { cn } from '@/lib/utils';

interface CreateEnvironmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

const ENV_SUGGESTIONS = ['development', 'production', 'staging', 'testing', 'preview'];

const SUGGESTION_COLORS: Record<string, string> = {
  development: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300',
  production:  'bg-rose-50    text-rose-700    border-rose-200    hover:bg-rose-100    hover:border-rose-300',
  staging:     'bg-amber-50   text-amber-700   border-amber-200   hover:bg-amber-100   hover:border-amber-300',
  testing:     'bg-blue-50    text-blue-700    border-blue-200    hover:bg-blue-100    hover:border-blue-300',
  preview:     'bg-violet-50  text-violet-700  border-violet-200  hover:bg-violet-100  hover:border-violet-300',
};

export function CreateEnvironmentModal({ 
  open, 
  onOpenChange,
  projectId 
}: CreateEnvironmentModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.toLowerCase(),
          projectId
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        toast.error(data.error || 'An environment with this name already exists.');
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create environment');
      }

      toast.success('Environment created successfully');
      setName('');
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      if (err instanceof Error) {
        toast.error(err.message);
      } else {
        toast.error('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isLoading) { onOpenChange(v); if (!v) setName(''); } }}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Environment</DialogTitle>
          <DialogDescription>
            Environments allow you to separate secrets (e.g., Development, Staging, Production).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="env-name">Environment Name</Label>
            <Input
              id="env-name"
              placeholder="e.g. staging"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              required
              disabled={isLoading}
              autoFocus
            />
            <p className="text-[10px] text-slate-400 font-medium">Use lowercase names like 'production' or 'development'</p>

            {/* Suggestion chips */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ENV_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={isLoading}
                  onClick={() => setName(suggestion)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer',
                    name === suggestion
                      ? 'ring-2 ring-offset-1 ring-current scale-105'
                      : '',
                    SUGGESTION_COLORS[suggestion]
                  )}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2 gap-3">
            <Button variant="ghost" type="button" onClick={() => { onOpenChange(false); setName(''); }} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name}>
              {isLoading ? "Creating..." : "Create Environment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
