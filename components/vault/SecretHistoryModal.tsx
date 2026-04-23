"use client";

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, Clock, History, Copy, Check, Trash2, Link2, Info } from 'lucide-react';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';

interface HistoryItem {
  id: string;
  valueEncrypted: string;
  iv: string;
  revisionNumber: number;
  previousHistoryId: string | null;
  createdAt: string;
}

interface HistoryResponse {
  history: HistoryItem[];
  graph?: {
    nodes: Array<{ id: string; revisionNumber: number; createdAt: string }>;
    edges: Array<{ from: string; to: string }>;
  };
}

interface SecretHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretId: string;
  keyName: string;
  environmentId: string;
}

const GROUP_COLORS = ['#8b5cf6', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#ec4899'];
const getGroupColor = (i: number) => GROUP_COLORS[i % GROUP_COLORS.length];

// px from left edge of SVG where connector dots sit (right-aligned inside the 46px zone)
const DOT_X = 38;

export function SecretHistoryModal({
  open, onOpenChange, secretId, keyName, environmentId,
}: SecretHistoryModalProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [decryptedValues, setDecryptedValues] = useState<Record<string, string>>({});
  // keptId → list of deleted revision numbers
  const [deletionNotes, setDeletionNotes] = useState<Record<string, number[]>>({});
  const [deletePrompt, setDeletePrompt] = useState<{
    groupIdx: number; toDelete: HistoryItem[]; toKeep: HistoryItem;
  } | null>(null);

  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const [cardPositions, setCardPositions] = useState<Record<string, { top: number; height: number }>>({});

  const derivedKey = useVaultStore((s) => s.derivedKey);

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/secrets/${secretId}/history`);
      if (!res.ok) throw new Error();
      const data: HistoryResponse | HistoryItem[] = await res.json();
      setHistory(Array.isArray(data) ? data : data.history);
    } catch {
      toast.error('Could not load history');
    } finally {
      setIsLoading(false);
    }
  }, [secretId]);

  useEffect(() => {
    if (open) {
      fetchHistory();
    } else {
      setRevealedIds({});
      setDecryptedValues({});
      setDeletePrompt(null);
      setCardPositions({});
      // keep deletionNotes across open/close so the user sees them if they reopen
    }
  }, [open, fetchHistory]);

  // Silently decrypt all values so we can detect duplicates
  useEffect(() => {
    if (!open || !derivedKey || history.length === 0) return;
    const aad = `${keyName}:${environmentId}`;
    Promise.allSettled(
      history.map(async (item) => {
        try {
          const val = await decryptSecret(item.valueEncrypted, item.iv, derivedKey, aad);
          return { id: item.id, val };
        } catch { return null; }
      })
    ).then((results) => {
      const vals: Record<string, string> = {};
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value) vals[r.value.id] = r.value.val;
      });
      setDecryptedValues(vals);
    });
  }, [open, history, derivedKey, keyName, environmentId]);

  // Groups of items sharing a value (newest-first ordering preserved)
  const duplicateGroups = useMemo<HistoryItem[][]>(() => {
    if (Object.keys(decryptedValues).length < history.length) return [];
    const byValue = new Map<string, HistoryItem[]>();
    history.forEach((item) => {
      const val = decryptedValues[item.id];
      if (val === undefined) return;
      if (!byValue.has(val)) byValue.set(val, []);
      byValue.get(val)!.push(item);
    });
    return Array.from(byValue.values()).filter((g) => g.length > 1);
  }, [decryptedValues, history]);

  const idToGroupIdx = useMemo(() => {
    const map = new Map<string, number>();
    duplicateGroups.forEach((g, i) => g.forEach((item) => map.set(item.id, i)));
    return map;
  }, [duplicateGroups]);

  // Re-measure card positions whenever layout may have changed
  useLayoutEffect(() => {
    if (!containerRef.current || history.length === 0) return;
    const positions: Record<string, { top: number; height: number }> = {};
    history.forEach(({ id }) => {
      const el = cardRefs.current[id];
      if (el) positions[id] = { top: el.offsetTop, height: el.offsetHeight };
    });
    setCardPositions(positions);
  }, [history, decryptedValues]);

  // Build SVG: one arc per consecutive pair within each group
  const svgContent = useMemo(() => {
    if (duplicateGroups.length === 0 || Object.keys(cardPositions).length === 0) return null;
    const containerEl = containerRef.current;
    if (!containerEl) return null;

    const totalH = containerEl.scrollHeight;

    return (
      <svg
        className="absolute left-0 top-0 pointer-events-none"
        width={46}
        height={totalH}
        style={{ overflow: 'visible' }}
      >
        {duplicateGroups.map((group, groupIdx) => {
          const color = getGroupColor(groupIdx);

          // Sort by DOM top position (matching display order top→bottom)
          const pts = group
            .map((item) => {
              const pos = cardPositions[item.id];
              return pos ? { item, cy: pos.top + pos.height / 2 } : null;
            })
            .filter(Boolean)
            .sort((a, b) => a!.cy - b!.cy) as { item: HistoryItem; cy: number }[];

          if (pts.length < 2) return null;

          // Draw one arc per consecutive pair
          const arcs = pts.slice(0, -1).map((a, i) => {
            const b = pts[i + 1];
            const gap = b.cy - a.cy;
            // bow proportional to gap, minimum 16px, max 32px
            const bow = Math.max(Math.min(gap * 0.45, 32), 16);
            const cx = DOT_X - bow;
            const midY = (a.cy + b.cy) / 2;
            const d = `M ${DOT_X} ${a.cy} Q ${cx} ${midY} ${DOT_X} ${b.cy}`;
            return { d, key: `${a.item.id}-${b.item.id}` };
          });

          const handleClick = () => {
            const sorted = [...group].sort((a, b) => b.revisionNumber - a.revisionNumber);
            setDeletePrompt({ groupIdx, toKeep: sorted[0], toDelete: sorted.slice(1) });
          };

          return (
            <g key={groupIdx}>
              {arcs.map(({ d, key }) => (
                <g key={key} style={{ cursor: 'pointer' }} onClick={handleClick}>
                  {/* wide invisible hit area */}
                  <path d={d} stroke="transparent" strokeWidth={14} fill="none" style={{ pointerEvents: 'stroke' }} />
                  {/* visible dashed arc */}
                  <path
                    d={d}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 3"
                    fill="none"
                    strokeLinecap="round"
                    style={{ pointerEvents: 'none' }}
                  />
                </g>
              ))}
              {/* Dots at every group member */}
              {pts.map(({ item, cy }) => (
                <circle
                  key={item.id}
                  cx={DOT_X}
                  cy={cy}
                  r={4.5}
                  fill={color}
                  stroke="white"
                  strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }}
                />
              ))}
            </g>
          );
        })}
      </svg>
    );
  }, [duplicateGroups, cardPositions]);

  async function handleReveal(item: HistoryItem) {
    if (revealedIds[item.id]) {
      const next = { ...revealedIds };
      delete next[item.id];
      setRevealedIds(next);
      return;
    }
    if (!derivedKey) { toast.error('Vault is locked'); return; }
    try {
      const val = decryptedValues[item.id] ??
        await decryptSecret(item.valueEncrypted, item.iv, derivedKey, `${keyName}:${environmentId}`);
      setRevealedIds({ ...revealedIds, [item.id]: val });
    } catch {
      toast.error('Decryption failed');
    }
  }

  async function handleCopy(item: HistoryItem) {
    if (!derivedKey) { toast.error('Vault is locked'); return; }
    try {
      const val = revealedIds[item.id] ?? decryptedValues[item.id] ??
        await decryptSecret(item.valueEncrypted, item.iv, derivedKey, `${keyName}:${environmentId}`);
      await navigator.clipboard.writeText(val);
      setCopiedId(item.id);
      toast.success(`Copied v${item.revisionNumber}`);
      setTimeout(() => setCopiedId((p) => (p === item.id ? null : p)), 1200);
    } catch {
      toast.error('Copy failed');
    }
  }

  async function handleDeleteDuplicates() {
    if (!deletePrompt) return;

    const { toDelete, toKeep, groupIdx: _gi } = deletePrompt;
    const deletedIds = toDelete.map((i) => i.id);
    const deletedRevs = toDelete.map((i) => i.revisionNumber).sort((a, b) => a - b);

    // Snapshot for rollback
    const prevHistory = history;
    const prevDecrypted = decryptedValues;

    // Optimistic: remove deleted items from local state immediately, close dialog
    setHistory((prev) => prev.filter((h) => !deletedIds.includes(h.id)));
    setDecryptedValues((prev) => {
      const next = { ...prev };
      deletedIds.forEach((id) => delete next[id]);
      return next;
    });
    setDeletionNotes((prev) => ({
      ...prev,
      [toKeep.id]: [...(prev[toKeep.id] ?? []), ...deletedRevs],
    }));
    setDeletePrompt(null);

    // Fire API in background
    try {
      const res = await fetch(`/api/secrets/${secretId}/history`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historyIds: deletedIds }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        `Deleted ${toDelete.length} duplicate version${toDelete.length > 1 ? 's' : ''}`
      );
    } catch {
      // Rollback on failure
      setHistory(prevHistory);
      setDecryptedValues(prevDecrypted);
      setDeletionNotes((prev) => {
        const next = { ...prev };
        const remaining = (next[toKeep.id] ?? []).filter((r) => !deletedRevs.includes(r));
        if (remaining.length === 0) delete next[toKeep.id];
        else next[toKeep.id] = remaining;
        return next;
      });
      toast.error('Could not delete versions — changes reverted');
    }
  }

  const revisionById = useMemo(() => new Map(history.map((h) => [h.id, h.revisionNumber])), [history]);
  const hasDuplicates = duplicateGroups.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              Secret History
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-1">
              Version history for{' '}
              <span className="font-mono font-bold text-slate-900">{keyName}</span>.
              {hasDuplicates && (
                <span className="inline-flex items-center gap-1 text-violet-600 font-medium text-xs ml-1">
                  <Link2 className="w-3.5 h-3.5" />
                  {duplicateGroups.length} duplicate{duplicateGroups.length > 1 ? 's' : ''} detected — click a connector line to clean up.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div
            ref={containerRef}
            className="py-4 flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative"
            style={{ paddingLeft: hasDuplicates ? 52 : 4, paddingRight: 4 }}
          >
            {svgContent}

            {isLoading ? (
              <div className="py-12 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm italic">No previous versions found.</div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => {
                  const groupIdx = idToGroupIdx.get(item.id);
                  const color = groupIdx !== undefined ? getGroupColor(groupIdx) : undefined;
                  const deletedRevs = deletionNotes[item.id];

                  return (
                    <div
                      key={item.id}
                      ref={(el) => { cardRefs.current[item.id] = el; }}
                      className="p-3 border rounded-lg bg-slate-50/50 hover:bg-slate-50 transition-colors"
                      style={{
                        borderColor: color ? `${color}44` : undefined,
                        borderLeftColor: color ?? undefined,
                        borderLeftWidth: color ? 3 : undefined,
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 text-xs text-slate-400 font-medium font-mono flex-wrap">
                          <span
                            className="px-1.5 py-0.5 rounded font-bold border"
                            style={
                              color
                                ? { background: `${color}18`, color, borderColor: `${color}44` }
                                : { background: '#eef2ff', color: '#4f46e5', borderColor: '#e0e7ff' }
                            }
                          >
                            v{item.revisionNumber}
                          </span>
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(item.createdAt).toLocaleString()}
                          {item.previousHistoryId && revisionById.has(item.previousHistoryId) && (
                            <span className="text-slate-400">← v{revisionById.get(item.previousHistoryId)}</span>
                          )}
                          {color && (
                            <span
                              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                              style={{ background: `${color}18`, color }}
                            >
                              same value
                            </span>
                          )}
                          {/* Info icon shown after duplicates of this version were deleted */}
                          {deletedRevs && deletedRevs.length > 0 && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger className="inline-flex items-center cursor-help">
                                  <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
                                </TooltipTrigger>
                                <TooltipContent side="right" className="max-w-[220px] text-center leading-relaxed">
                                  {deletedRevs.length === 1
                                    ? `v${deletedRevs[0]} was deleted — it had the same value as this version.`
                                    : `${deletedRevs.map((r) => `v${r}`).join(' and ')} were deleted — they had the same value as this version.`}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            onClick={() => handleReveal(item)}
                          >
                            {revealedIds[item.id]
                              ? <><EyeOff className="w-3.5 h-3.5 mr-1.5" />Hide</>
                              : <><Eye className="w-3.5 h-3.5 mr-1.5" />Reveal</>}
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 px-2 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100"
                            onClick={() => handleCopy(item)}
                          >
                            {copiedId === item.id
                              ? <><Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />Copied</>
                              : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</>}
                          </Button>
                        </div>
                      </div>
                      {revealedIds[item.id] ? (
                        <div className="p-2 bg-white rounded border border-indigo-100 font-mono text-xs text-indigo-700 break-all select-all animate-in fade-in slide-in-from-top-1 duration-200">
                          {revealedIds[item.id]}
                        </div>
                      ) : (
                        <div className="p-2 bg-slate-100/50 rounded border border-slate-100 font-mono text-xs text-slate-300">
                          ••••••••••••••••••••••••••••••••
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Duplicate cleanup confirmation */}
      <Dialog open={deletePrompt !== null} onOpenChange={(v) => { if (!v) setDeletePrompt(null); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle
              className="flex items-center gap-2 font-bold"
              style={{ color: deletePrompt ? getGroupColor(deletePrompt.groupIdx) : undefined }}
            >
              <Link2 className="w-5 h-5" /> Duplicate Values Detected
            </DialogTitle>
            {deletePrompt && (
              <DialogDescription className="pt-2 text-slate-600 leading-relaxed">
                {deletePrompt.toDelete.length === 1 ? (
                  <>
                    <span className="font-mono font-bold text-slate-900">v{deletePrompt.toDelete[0].revisionNumber}</span>
                    {' '}and{' '}
                    <span className="font-mono font-bold text-slate-900">v{deletePrompt.toKeep.revisionNumber}</span>
                    {' '}have the same value. Delete the older version to keep your history clean.
                  </>
                ) : (
                  <>
                    <span className="font-mono font-bold text-slate-900">
                      {[...deletePrompt.toDelete, deletePrompt.toKeep]
                        .sort((a, b) => a.revisionNumber - b.revisionNumber)
                        .map((i) => `v${i.revisionNumber}`)
                        .join(', ')}
                    </span>
                    {' '}all share the same value. Keep only the latest (
                    <span className="font-mono font-bold text-slate-900">v{deletePrompt.toKeep.revisionNumber}</span>
                    ) and delete the {deletePrompt.toDelete.length} older duplicates.
                  </>
                )}
              </DialogDescription>
            )}
          </DialogHeader>

          {deletePrompt && (
            <div className="py-1">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs space-y-2">
                <div>
                  <p className="font-semibold text-red-600 mb-1">Will be deleted:</p>
                  {deletePrompt.toDelete
                    .sort((a, b) => a.revisionNumber - b.revisionNumber)
                    .map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-slate-500">
                        <span className="font-mono font-bold text-slate-400">v{item.revisionNumber}</span>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                    ))}
                </div>
                <div>
                  <p className="font-semibold text-emerald-600 mb-1">Will be kept:</p>
                  <div className="flex items-center gap-2 text-slate-500">
                    <span className="font-mono font-bold text-emerald-600">v{deletePrompt.toKeep.revisionNumber}</span>
                    <span>{new Date(deletePrompt.toKeep.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeletePrompt(null)}>
              Keep All
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDeleteDuplicates}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Older Version{deletePrompt && deletePrompt.toDelete.length > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
