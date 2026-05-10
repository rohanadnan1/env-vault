'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Bell, Share2, FileCheck, MessageSquare, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: 'NEW_SHARE' | 'REVIEW_REQUESTED' | 'REVIEW_UPDATED' | 'NEW_COMMENT';
  message: string;
  actionUrl: string;
  createdAt: string;
}

const TYPE_ICON: Record<string, typeof Bell> = {
  NEW_SHARE: Share2,
  REVIEW_REQUESTED: FileCheck,
  REVIEW_UPDATED: CheckCircle2,
  NEW_COMMENT: MessageSquare,
};

const TYPE_COLOR: Record<string, string> = {
  NEW_SHARE: 'bg-indigo-50 border-indigo-200 text-indigo-700',
  REVIEW_REQUESTED: 'bg-amber-50 border-amber-200 text-amber-700',
  REVIEW_UPDATED: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  NEW_COMMENT: 'bg-blue-50 border-blue-200 text-blue-700',
};

const POLL_INTERVAL = 30_000;
const ERROR_BACKOFF = 120_000;
const LS_DISMISSED_KEY = 'notifications_dismissed_ids';

function getDismissedFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissedToStorage(ids: Set<string>) {
  try {
    localStorage.setItem(LS_DISMISSED_KEY, JSON.stringify([...ids]));
  } catch { /* ignore */ }
}

export function NotificationBanner() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>();
    return getDismissedFromStorage();
  });
  const errorCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const fetchNotifications = useCallback(async () => {
    if (errorCount.current >= 5) return;
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`/api/notifications?since=${encodeURIComponent(since)}`);
      if (!res.ok) {
        errorCount.current++;
        return;
      }
      errorCount.current = 0;
      const data = await res.json();
      if (data.notifications && Array.isArray(data.notifications)) {
        const stored = getDismissedFromStorage();
        setNotifications(prev => {
          const existingIds = new Set(prev.map(n => n.id));
          const newOnes = data.notifications.filter(
            (n: Notification) => !existingIds.has(n.id) && !stored.has(n.id)
          );
          const merged = [...newOnes, ...prev].filter(n => !stored.has(n.id));
          return merged.slice(0, 10);
        });
        setDismissed(stored);
      }
    } catch {
      errorCount.current++;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    const delay = errorCount.current > 0 ? ERROR_BACKOFF : POLL_INTERVAL;
    pollTimer.current = setInterval(() => {
      fetchNotifications();
      if (pollTimer.current && errorCount.current > 0) {
        clearInterval(pollTimer.current);
        pollTimer.current = setInterval(fetchNotifications, ERROR_BACKOFF);
      }
    }, delay);
  }, [fetchNotifications]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(getDismissedFromStorage());
    }
    fetchNotifications();
    startPolling();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        errorCount.current = 0;
        fetchNotifications();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [fetchNotifications, startPolling]);

  const handleDismiss = (id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      saveDismissedToStorage(next);
      return next;
    });
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleAction = (n: Notification) => {
    handleDismiss(n.id);
    router.push(n.actionUrl);
  };

  const markAllSeen = () => {
    const ids = new Set(notifications.map(n => n.id));
    const merged = new Set([...dismissed, ...ids]);
    setDismissed(merged);
    saveDismissedToStorage(merged);
    setNotifications([]);
  };

  const visible = notifications.filter(n => !dismissed.has(n.id));

  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 px-6 pt-3">
      {visible.length > 1 && (
        <button
          type="button"
          className="text-[10px] font-medium text-slate-400 hover:text-slate-600 ml-auto block"
          onClick={markAllSeen}
        >
          Dismiss all
        </button>
      )}
      {visible.map(n => {
        const Icon = TYPE_ICON[n.type] || Bell;
        const colorClass = TYPE_COLOR[n.type] || '';
        return (
          <div
            key={n.id}
            className={cn(
              'rounded-xl border px-4 py-2.5 flex items-center gap-3 shadow-sm transition-all cursor-pointer hover:shadow-md',
              colorClass
            )}
            onClick={() => handleAction(n)}
            role="alert"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/60">
              <Icon className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{n.message}</p>
            </div>
            <button
              type="button"
              className="shrink-0 p-1 rounded-md hover:bg-black/5 transition-colors"
              onClick={(e) => { e.stopPropagation(); handleDismiss(n.id); }}
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
