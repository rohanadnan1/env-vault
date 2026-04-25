"use client";

import { useEffect, useRef, useState } from 'react';
import { Shield, Sparkles, Rocket, Lightbulb, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { type FactCategory, type VaultFact, VAULT_FACTS, shuffleFacts } from '@/lib/vault-facts';

const TYPING_SPEED_MS = 18;
const READ_DURATION_MS = 2600;
const FADE_DURATION_MS = 400;

interface CategoryMeta {
  label: string;
  Icon: React.ElementType;
  gradient: string;
  badge: string;
}

const CATEGORY_META: Record<FactCategory, CategoryMeta> = {
  security: {
    label: 'Security',
    Icon: Shield,
    gradient: 'from-indigo-700 via-indigo-800 to-slate-900',
    badge: 'bg-indigo-500/30 text-indigo-200 border-indigo-400/30',
  },
  features: {
    label: 'Features',
    Icon: Sparkles,
    gradient: 'from-violet-700 via-purple-800 to-slate-900',
    badge: 'bg-violet-500/30 text-violet-200 border-violet-400/30',
  },
  'coming-soon': {
    label: 'Coming Soon',
    Icon: Rocket,
    gradient: 'from-emerald-700 via-teal-800 to-slate-900',
    badge: 'bg-emerald-500/30 text-emerald-200 border-emerald-400/30',
  },
  'did-you-know': {
    label: 'Did You Know?',
    Icon: Lightbulb,
    gradient: 'from-amber-600 via-orange-700 to-slate-900',
    badge: 'bg-amber-500/30 text-amber-200 border-amber-400/30',
  },
  mission: {
    label: 'Our Mission',
    Icon: Target,
    gradient: 'from-rose-700 via-pink-800 to-slate-900',
    badge: 'bg-rose-500/30 text-rose-200 border-rose-400/30',
  },
};

interface Props {
  sessionId?: string;
  progress?: { done: number; total: number; label: string };
  className?: string;
}

type Phase = 'typing' | 'reading' | 'fading';

export function LoadingInfoPanel({ sessionId, progress, className }: Props) {
  const [facts, setFacts] = useState<VaultFact[]>([]);
  const [factIdx, setFactIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [phase, setPhase] = useState<Phase>('typing');
  const [opacity, setOpacity] = useState(1);

  // Reshuffle when a new session starts
  useEffect(() => {
    const shuffled = shuffleFacts(VAULT_FACTS);
    setFacts(shuffled);
    setFactIdx(0);
    setCharIdx(0);
    setDisplayedText('');
    setPhase('typing');
    setOpacity(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const currentFact = facts[factIdx] ?? VAULT_FACTS[0];
  const meta = CATEGORY_META[currentFact.category];

  // Typing phase
  useEffect(() => {
    if (phase !== 'typing' || facts.length === 0) return;
    if (charIdx >= currentFact.text.length) {
      setPhase('reading');
      return;
    }
    const t = setTimeout(() => {
      setDisplayedText(currentFact.text.slice(0, charIdx + 1));
      setCharIdx((c) => c + 1);
    }, TYPING_SPEED_MS);
    return () => clearTimeout(t);
  }, [phase, charIdx, currentFact, facts.length]);

  // Reading → fading
  useEffect(() => {
    if (phase !== 'reading') return;
    const t = setTimeout(() => setPhase('fading'), READ_DURATION_MS);
    return () => clearTimeout(t);
  }, [phase]);

  // Fading → next fact
  useEffect(() => {
    if (phase !== 'fading') return;
    setOpacity(0);
    const t = setTimeout(() => {
      const nextIdx = (factIdx + 1) % (facts.length || 1);
      setFactIdx(nextIdx);
      setCharIdx(0);
      setDisplayedText('');
      setOpacity(1);
      setPhase('typing');
    }, FADE_DURATION_MS);
    return () => clearTimeout(t);
  }, [phase, factIdx, facts.length]);

  const progressPct = progress && progress.total > 0
    ? Math.max(4, Math.round((progress.done / progress.total) * 100))
    : null;

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl overflow-hidden bg-gradient-to-br',
        meta.gradient,
        className
      )}
    >
      {/* Subtle noise overlay */}
      <div className="absolute inset-0 opacity-[0.04] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJub2lzZSI+PGZlVHVyYnVsZW5jZSB0eXBlPSJmcmFjdGFsTm9pc2UiIGJhc2VGcmVxdWVuY3k9IjAuNjUiIG51bU9jdGF2ZXMiPSIzIiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjMwMCIgaGVpZ2h0PSIzMDAiIGZpbHRlcj0idXJsKCNub2lzZSkiIG9wYWNpdHk9IjEiLz48L3N2Zz4=')]" />

      <div
        className="relative flex flex-col flex-1 p-5 gap-4"
        style={{ opacity, transition: `opacity ${FADE_DURATION_MS}ms ease-in-out` }}
      >
        {/* Category badge */}
        <div className="flex items-center gap-2">
          <span className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border tracking-wide uppercase',
            meta.badge
          )}>
            <meta.Icon className="w-3 h-3" />
            {meta.label}
          </span>
        </div>

        {/* Typing text */}
        <div className="flex-1">
          <p className="text-white/90 text-sm leading-relaxed font-medium min-h-[5rem]">
            {displayedText}
            {phase === 'typing' && (
              <span className="inline-block w-0.5 h-4 bg-white/70 ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>

        {/* Footer: fact counter */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <span className="text-white/40 text-[10px] font-medium">
            {facts.length > 0 ? `${(factIdx % facts.length) + 1} of ${facts.length}` : ''}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(5, facts.length) }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  'w-1 h-1 rounded-full transition-all duration-500',
                  i === factIdx % Math.min(5, facts.length)
                    ? 'bg-white/70 scale-125'
                    : 'bg-white/20'
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Progress bar pinned at the bottom */}
      {progressPct !== null && (
        <div className="relative px-5 pb-4 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] text-white/50">
            <span className="truncate">{progress?.label}</span>
            <span className="ml-2 shrink-0 tabular-nums">{progress?.done}/{progress?.total}</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-1.5 rounded-full bg-white/60 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
