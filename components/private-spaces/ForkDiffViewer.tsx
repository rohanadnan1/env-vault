"use client";

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, GitMerge, Copy, AlertTriangle } from 'lucide-react';
import { computeSmartMerge } from '@/lib/diff';
import { cn } from '@/lib/utils';

type Props = {
  workspaceText: string;
  kingText: string;
  fileName: string;
  onApply: (mergedText: string) => void;
  onCancel: () => void;
  onOverwrite: () => void;
  onCloneFirst: () => void;
  isApplying?: boolean;
  isCloning?: boolean;
};

const LINE_COLORS: Record<string, string> = {
  keep: 'bg-white text-slate-600',
  'king-add': 'bg-emerald-50/80 text-emerald-800 border-l-2 border-emerald-400',
  'king-remove': 'bg-rose-50/80 text-rose-700 border-l-2 border-rose-400 line-through',
  conflict: 'bg-amber-50/80 text-amber-800 border-l-2 border-amber-400',
};

const LINE_LABELS: Record<string, string> = {
  keep: '',
  'king-add': '+',
  'king-remove': '−',
  conflict: '!',
};

const LINE_LABEL_COLORS: Record<string, string> = {
  keep: 'text-slate-300',
  'king-add': 'text-emerald-600',
  'king-remove': 'text-rose-500',
  conflict: 'text-amber-600',
};

export function ForkDiffViewer({ workspaceText, kingText, fileName, onApply, onCancel, onOverwrite, onCloneFirst, isApplying, isCloning }: Props) {
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const merge = useMemo(() => computeSmartMerge(workspaceText, kingText), [workspaceText, kingText]);
  const changeCount = merge.lines.filter(l => l.type !== 'keep').length;
  const addCount = merge.lines.filter(l => l.type === 'king-add').length;
  const removeCount = merge.lines.filter(l => l.type === 'king-remove').length;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-slate-600">{fileName}</span>
          <span className="text-[10px] text-slate-400">{changeCount} change{changeCount !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-4 mt-2 text-[10px]">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-400 shrink-0" /> +{addCount} additions
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-rose-200 border border-rose-400 shrink-0" /> −{removeCount} removals
          </span>
        </div>
      </div>

      <div className="max-h-[300px] overflow-auto rounded-xl border border-slate-200 bg-white">
        <div className="font-mono text-[11px] leading-5">
          {merge.lines.length === 0 ? (
            <p className="p-4 text-slate-400 italic text-xs">Files are identical</p>
          ) : (
            merge.lines.map((line, i) => (
              <div key={i} className={cn('flex', LINE_COLORS[line.type] || '')}>
                <span className={cn('w-6 shrink-0 text-right pr-1.5 select-none text-[9px] leading-5 font-bold', LINE_LABEL_COLORS[line.type] || '')}>
                  {LINE_LABELS[line.type] || ''}
                </span>
                <span className="flex-1 whitespace-pre-wrap break-all pr-2">{line.content || ' '}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-700">
        <p className="font-medium">Smart Merge applies:</p>
        <ul className="list-disc pl-4 mt-1 space-y-0.5 text-indigo-600">
          <li>All King file <span className="text-emerald-700 font-medium">additions</span> into your workspace</li>
          <li>All King file <span className="text-rose-700 font-medium">deletions</span> from your workspace</li>
          <li>Keeps lines you added that don&apos;t exist in the King file</li>
        </ul>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-xs"
          onClick={() => onApply(merge.mergedText)}
          disabled={isApplying}>
          {isApplying ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <GitMerge className="w-3.5 h-3.5 mr-1.5" />}
          Apply Smart Merge
        </Button>
        <Button variant="outline" size="sm" className="text-xs"
          onClick={onCloneFirst}
          disabled={isCloning}>
          {isCloning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Copy className="w-3 h-3 mr-1" />}
          Clone First
        </Button>
        <Button variant="ghost" size="sm" className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 ml-auto"
          onClick={() => setShowOverwriteConfirm(true)}>
          <AlertTriangle className="w-3 h-3 mr-1" />
          Overwrite All
        </Button>
      </div>

      {showOverwriteConfirm && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 flex items-center justify-between">
          <p className="text-xs text-rose-700">This will replace everything with the King version. Your changes will be lost.</p>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setShowOverwriteConfirm(false)}>No</Button>
            <Button variant="destructive" size="sm" className="text-xs h-7" onClick={onOverwrite}>Yes, Overwrite</Button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" className="text-xs" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
