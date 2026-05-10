'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface TTLValue {
  ttlDays: number | null;
  expiresAt: string | null;
}

interface TTLSelectorProps {
  value: TTLValue;
  onChange: (value: TTLValue) => void;
}

const PRESETS = [7, 14, 30, 60, 90] as const;
const PRESET_LABELS: Record<number, string> = {
  7: '7 days',
  14: '14 days',
  30: '30 days',
  60: '60 days',
  90: '90 days',
};

function computeExpiry(ttlDays: number | null): string | null {
  if (ttlDays === null) return null;
  const date = new Date();
  date.setDate(date.getDate() + ttlDays);
  return date.toISOString();
}

export function TTLSelector({ value, onChange }: TTLSelectorProps) {
  const [selectedPreset, setSelectedPreset] = useState<number | 'CUSTOM' | 'NONE'>(() => {
    if (value.ttlDays === null) return 'NONE';
    if (PRESETS.includes(value.ttlDays as (typeof PRESETS)[number])) return value.ttlDays;
    return 'CUSTOM';
  });
  const [customDays, setCustomDays] = useState<string>(
    selectedPreset === 'CUSTOM' && value.ttlDays ? String(value.ttlDays) : ''
  );

  useEffect(() => {
    if (value.ttlDays === null) {
      setSelectedPreset('NONE');
    } else if (PRESETS.includes(value.ttlDays as (typeof PRESETS)[number])) {
      setSelectedPreset(value.ttlDays);
    } else {
      setSelectedPreset('CUSTOM');
      setCustomDays(String(value.ttlDays));
    }
  }, [value.ttlDays]);

  const emit = useCallback(
    (days: number | null) => {
      onChange({ ttlDays: days, expiresAt: computeExpiry(days) });
    },
    [onChange]
  );

  const handlePreset = (preset: number) => {
    setSelectedPreset(preset);
    emit(preset);
  };

  const handleCustom = () => {
    setSelectedPreset('CUSTOM');
    const parsed = parseInt(customDays, 10);
    emit(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
  };

  const handleNoExpiry = () => {
    setSelectedPreset('NONE');
    emit(null);
  };

  const handleCustomInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setCustomDays(raw);
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      emit(parsed);
    }
  };

  const expiryPreview =
    value.expiresAt
      ? new Date(value.expiresAt).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => handlePreset(days)}
            className={cn(
              'inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors',
              selectedPreset === days
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            {PRESET_LABELS[days]}
          </button>
        ))}
        <button
          type="button"
          onClick={handleCustom}
          className={cn(
            'inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors',
            selectedPreset === 'CUSTOM'
              ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
          )}
        >
          Custom
        </button>
        <button
          type="button"
          onClick={handleNoExpiry}
          className={cn(
            'inline-flex h-7 items-center rounded-full border px-3 text-xs font-medium transition-colors',
            selectedPreset === 'NONE'
              ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
          )}
        >
          No expiry
        </button>
      </div>

      {selectedPreset === 'CUSTOM' && (
        <div className="space-y-1.5">
          <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Number of days
          </Label>
          <div className="relative w-32">
            <Clock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Days"
              value={customDays}
              onChange={handleCustomInput}
            />
          </div>
        </div>
      )}

      {expiryPreview && selectedPreset !== 'NONE' && (
        <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
          <Calendar className="mt-0.5 size-4 shrink-0 text-indigo-600" />
          <p className="text-xs text-indigo-700">
            Expires on{' '}
            <span className="font-semibold">{expiryPreview}</span>
          </p>
        </div>
      )}
    </div>
  );
}
