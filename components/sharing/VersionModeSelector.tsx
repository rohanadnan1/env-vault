'use client';

import { FileClock, Tag, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type VersionMode = 'LATEST' | 'SPECIFIC' | 'ALL';

interface VersionModeSelectorProps {
  value: VersionMode;
  onChange: (mode: VersionMode) => void;
  onSpecificVersionChange?: (versionId: string) => void;
  visible: boolean;
}

interface Option {
  mode: VersionMode;
  Icon: typeof FileClock;
  title: string;
  description: string;
}

const OPTIONS: Option[] = [
  {
    mode: 'LATEST',
    Icon: FileClock,
    title: 'Latest only',
    description: 'Share only the most recent version. Recipients will see the current state.',
  },
  {
    mode: 'SPECIFIC',
    Icon: Tag,
    title: 'Specific version',
    description: 'Share a pinned version of this resource. Freeze at a known-good state.',
  },
  {
    mode: 'ALL',
    Icon: Layers,
    title: 'All versions',
    description: 'Full version history. Recipients can explore every past revision.',
  },
];

export function VersionModeSelector({
  value,
  onChange,
  onSpecificVersionChange,
  visible,
}: VersionModeSelectorProps) {
  if (!visible) return null;

  return (
    <div className="space-y-4">
      <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        Version mode
      </Label>
      <div className="grid gap-3">
        {OPTIONS.map(({ mode, Icon, title, description }) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={cn(
              'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
              value === mode
                ? 'border-indigo-600 bg-indigo-50/50'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg',
                value === mode ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'
              )}
            >
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  'text-sm font-medium',
                  value === mode ? 'text-indigo-700' : 'text-slate-700'
                )}
              >
                {title}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            </div>
          </button>
        ))}
      </div>

      {value === 'SPECIFIC' && (
        <div className="space-y-1.5">
          <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Version ID
          </Label>
          <div className="relative">
            <Tag className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Enter version ID"
              onChange={(e) => onSpecificVersionChange?.(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
