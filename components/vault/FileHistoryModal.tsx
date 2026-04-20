"use client";

import { Fragment, useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Clock, Eye, History, SplitSquareHorizontal, Loader2 } from 'lucide-react';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FileHistoryItem {
  id: string;
  name: string;
  contentEncrypted: string;
  iv: string;
  revisionNumber: number;
  previousHistoryId: string | null;
  createdAt: string;
}

interface FileHistoryResponse {
  history: FileHistoryItem[];
}

interface FileHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileId: string;
  fileName: string;
  environmentId: string;
  folderId: string | null;
}

interface DiffOp {
  kind: 'equal' | 'delete' | 'insert';
  line: string;
}

interface DiffRow {
  left: string | null;
  right: string | null;
  leftNo: number | null;
  rightNo: number | null;
  type: 'same' | 'remove' | 'add' | 'modify';
}

function buildDiffOps(a: string[], b: string[]): DiffOp[] {
  const n = a.length;
  const m = b.length;

  // Fall back to a linear heuristic for very large documents to avoid UI freezes.
  if (n * m > 120000) {
    const ops: DiffOp[] = [];
    let i = 0;
    let j = 0;

    while (i < n || j < m) {
      if (i < n && j < m && a[i] === b[j]) {
        ops.push({ kind: 'equal', line: a[i] });
        i += 1;
        j += 1;
        continue;
      }

      if (i + 1 < n && j < m && a[i + 1] === b[j]) {
        ops.push({ kind: 'delete', line: a[i] });
        i += 1;
        continue;
      }

      if (j + 1 < m && i < n && a[i] === b[j + 1]) {
        ops.push({ kind: 'insert', line: b[j] });
        j += 1;
        continue;
      }

      if (i < n) {
        ops.push({ kind: 'delete', line: a[i] });
        i += 1;
      }
      if (j < m) {
        ops.push({ kind: 'insert', line: b[j] });
        j += 1;
      }
    }

    return ops;
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const reversedOps: DiffOp[] = [];
  let i = n;
  let j = m;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      reversedOps.push({ kind: 'equal', line: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      reversedOps.push({ kind: 'delete', line: a[i - 1] });
      i -= 1;
    } else {
      reversedOps.push({ kind: 'insert', line: b[j - 1] });
      j -= 1;
    }
  }

  while (i > 0) {
    reversedOps.push({ kind: 'delete', line: a[i - 1] });
    i -= 1;
  }
  while (j > 0) {
    reversedOps.push({ kind: 'insert', line: b[j - 1] });
    j -= 1;
  }

  return reversedOps.reverse();
}

function buildSideBySideDiff(leftText: string, rightText: string): DiffRow[] {
  const leftLines = leftText.split('\n');
  const rightLines = rightText.split('\n');
  const ops = buildDiffOps(leftLines, rightLines);
  const rows: Omit<DiffRow, 'leftNo' | 'rightNo'>[] = [];

  for (let idx = 0; idx < ops.length; idx += 1) {
    const op = ops[idx];

    if (op.kind === 'equal') {
      rows.push({ left: op.line, right: op.line, type: 'same' });
      continue;
    }

    if (op.kind === 'delete') {
      const next = ops[idx + 1];
      if (next?.kind === 'insert') {
        rows.push({ left: op.line, right: next.line, type: 'modify' });
        idx += 1;
      } else {
        rows.push({ left: op.line, right: null, type: 'remove' });
      }
      continue;
    }

    if (op.kind === 'insert') {
      const next = ops[idx + 1];
      if (next?.kind === 'delete') {
        rows.push({ left: next.line, right: op.line, type: 'modify' });
        idx += 1;
        continue;
      }
    }

    rows.push({ left: null, right: op.line, type: 'add' });
  }

  let leftNo = 1;
  let rightNo = 1;

  return rows.map((row) => ({
    ...row,
    leftNo: row.left !== null ? leftNo++ : null,
    rightNo: row.right !== null ? rightNo++ : null,
  }));
}

function summarizeRows(rows: DiffRow[]) {
  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const row of rows) {
    if (row.type === 'add') added += 1;
    else if (row.type === 'remove') removed += 1;
    else if (row.type === 'modify') modified += 1;
  }

  return { added, removed, modified };
}

export function FileHistoryModal({
  open,
  onOpenChange,
  fileId,
  fileName,
  environmentId,
  folderId,
}: FileHistoryModalProps) {
  const [history, setHistory] = useState<FileHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Record<string, string>>({});
  const [decryptingIds, setDecryptingIds] = useState<Record<string, boolean>>({});
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareBaseId, setCompareBaseId] = useState<string | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);

  const derivedKey = useVaultStore((s) => s.derivedKey);

  const historyByRevision = useMemo(
    () => new Map(history.map((item) => [item.revisionNumber, item])),
    [history]
  );

  const historyById = useMemo(
    () => new Map(history.map((item) => [item.id, item])),
    [history]
  );

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/vault-files/${fileId}/history`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setHistory([]);
        toast.error((errBody as { error?: string }).error || 'Failed to fetch file history');
        return;
      }
      const data: FileHistoryResponse = await res.json();
      setHistory(Array.isArray(data.history) ? data.history : []);
    } catch (err) {
      console.error(err);
      toast.error('Could not load file history');
    } finally {
      setIsLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (open) {
      fetchHistory();
    } else {
      setRevealedIds({});
      setDecryptingIds({});
      setSelectedVersionId(null);
      setCompareBaseId(null);
      setCompareTargetId(null);
      setIsCompareModalOpen(false);
    }
  }, [open, fetchHistory]);

  const getPreviousVersion = (item: FileHistoryItem) => historyByRevision.get(item.revisionNumber - 1) || null;
  const getNextVersion = (item: FileHistoryItem) => historyByRevision.get(item.revisionNumber + 1) || null;

  const getAllowedComparisonTargets = useCallback((item: FileHistoryItem | null) => {
    if (!item) return [] as FileHistoryItem[];
    const targets: FileHistoryItem[] = [];
    const prev = getPreviousVersion(item);
    const next = getNextVersion(item);
    if (prev) targets.push(prev);
    if (next) targets.push(next);
    return targets;
  }, [historyByRevision]);

  const ensureDecrypted = useCallback(async (item: FileHistoryItem): Promise<string | null> => {
    if (revealedIds[item.id]) return revealedIds[item.id];

    if (!derivedKey) {
      toast.error('Vault is locked');
      return null;
    }

    setDecryptingIds((prev) => ({ ...prev, [item.id]: true }));

    try {
      let decrypted: string;
      try {
        const aad = `${item.name}:${environmentId}`;
        decrypted = await decryptSecret(item.contentEncrypted, item.iv, derivedKey, aad);
      } catch {
        if (!folderId) throw new Error('Decryption failed');
        const fallbackAad = `${item.name}:${folderId}`;
        decrypted = await decryptSecret(item.contentEncrypted, item.iv, derivedKey, fallbackAad);
      }

      setRevealedIds((prev) => ({ ...prev, [item.id]: decrypted }));
      return decrypted;
    } catch (err) {
      console.error(err);
      toast.error('Decryption failed for this revision');
      return null;
    } finally {
      setDecryptingIds((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }
  }, [derivedKey, environmentId, folderId, revealedIds]);

  const openRevealModal = async (item: FileHistoryItem) => {
    const value = await ensureDecrypted(item);
    if (value === null) return;
    setSelectedVersionId(item.id);
  };

  const startComparison = async (base: FileHistoryItem, target: FileHistoryItem) => {
    const [baseValue, targetValue] = await Promise.all([ensureDecrypted(base), ensureDecrypted(target)]);
    if (baseValue === null || targetValue === null) return;

    setCompareBaseId(base.id);
    setCompareTargetId(target.id);
    setIsCompareModalOpen(true);
  };

  const closeComparisonModal = () => {
    setIsCompareModalOpen(false);
    setCompareBaseId(null);
    setCompareTargetId(null);
  };

  const selectedVersion = selectedVersionId ? historyById.get(selectedVersionId) || null : null;
  const compareBase = compareBaseId ? historyById.get(compareBaseId) || null : null;
  const compareTarget = compareTargetId ? historyById.get(compareTargetId) || null : null;

  const selectedVersionLines = useMemo(() => {
    if (!selectedVersion) return [] as string[];
    const content = revealedIds[selectedVersion.id] ?? '';
    return content.split('\n');
  }, [selectedVersion, revealedIds]);

  const comparisonRows = useMemo(() => {
    if (!compareBase || !compareTarget) return [] as DiffRow[];
    const left = revealedIds[compareBase.id];
    const right = revealedIds[compareTarget.id];
    if (left === undefined || right === undefined) return [] as DiffRow[];
    return buildSideBySideDiff(left, right);
  }, [compareBase, compareTarget, revealedIds]);

  const comparisonSummary = useMemo(() => summarizeRows(comparisonRows), [comparisonRows]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[980px] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              File Revision History
            </DialogTitle>
            <DialogDescription>
              Last 10 revisions for <span className="font-mono font-bold text-slate-900">{fileName}</span>. Open any version and compare adjacent revisions.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3 max-h-[70vh] overflow-y-auto">
            {isLoading ? (
              <div className="py-12 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm italic">
                No revisions found for this file.
              </div>
            ) : (
              history.map((item) => {
                const prev = getPreviousVersion(item);
                const next = getNextVersion(item);

                return (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-white">
                    <div className="p-3 border-b border-slate-100">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs text-slate-500 font-medium font-mono flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 font-bold">
                            v{item.revisionNumber}
                          </span>
                          <Clock className="w-3.5 h-3.5" />
                          {new Date(item.createdAt).toLocaleString()}
                          {item.previousHistoryId && historyById.get(item.previousHistoryId) && (
                            <span>linked to v{historyById.get(item.previousHistoryId)?.revisionNumber}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            onClick={() => openRevealModal(item)}
                            disabled={Boolean(decryptingIds[item.id])}
                          >
                            {decryptingIds[item.id] ? (
                              <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Loading</>
                            ) : (
                              <><Eye className="w-3.5 h-3.5 mr-1.5" /> Reveal</>
                            )}
                          </Button>

                          {prev && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                              onClick={() => startComparison(prev, item)}
                              disabled={Boolean(decryptingIds[item.id] || decryptingIds[prev.id])}
                            >
                              <SplitSquareHorizontal className="w-3.5 h-3.5 mr-1.5" /> Compare prev
                            </Button>
                          )}

                          {next && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100"
                              onClick={() => startComparison(item, next)}
                              disabled={Boolean(decryptingIds[item.id] || decryptingIds[next.id])}
                            >
                              <SplitSquareHorizontal className="w-3.5 h-3.5 mr-1.5" /> Compare next
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedVersion)} onOpenChange={(nextOpen) => {
        if (!nextOpen) setSelectedVersionId(null);
      }}>
        <DialogContent className="!w-[95vw] md:!w-[85vw] lg:!w-[72vw] !max-w-none h-[82vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-indigo-500" />
              Version {selectedVersion ? `v${selectedVersion.revisionNumber}` : ''} Content
            </DialogTitle>
            <DialogDescription>
              Review decrypted content for this revision, then compare with adjacent versions.
            </DialogDescription>
          </DialogHeader>

          {selectedVersion && (
            <div className="space-y-3 flex-1 min-h-0 flex flex-col">
              <div className="flex items-center gap-2 flex-wrap">
                {getPreviousVersion(selectedVersion) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={async () => {
                      const prev = getPreviousVersion(selectedVersion);
                      if (!prev) return;
                      setSelectedVersionId(null);
                      await startComparison(prev, selectedVersion);
                    }}
                  >
                    <SplitSquareHorizontal className="w-3.5 h-3.5 mr-1.5" /> Compare with prev
                  </Button>
                )}
                {getNextVersion(selectedVersion) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={async () => {
                      const next = getNextVersion(selectedVersion);
                      if (!next) return;
                      setSelectedVersionId(null);
                      await startComparison(selectedVersion, next);
                    }}
                  >
                    <SplitSquareHorizontal className="w-3.5 h-3.5 mr-1.5" /> Compare with next
                  </Button>
                )}
              </div>

              <div className="rounded-md border border-slate-200 bg-white flex-1 min-h-0 overflow-hidden flex flex-col">
                <div className="grid grid-cols-[72px_1fr] bg-slate-100 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <div className="px-3 py-1.5 border-r border-slate-200">Line</div>
                  <div className="px-3 py-1.5">Content</div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pb-2">
                  {selectedVersionLines.map((line, index) => (
                    <div key={`version-line-${selectedVersion.id}-${index}`} className="grid grid-cols-[72px_1fr] border-t border-slate-100 text-[12px] font-mono text-slate-800 leading-5">
                      <div className="px-3 py-1 text-right bg-slate-50 border-r border-slate-100 text-slate-500 select-none">
                        {index + 1}
                      </div>
                      <div className="px-3 py-1 whitespace-pre-wrap break-words">
                        {line.length > 0 ? line : ' '}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(isCompareModalOpen && compareBase && compareTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) closeComparisonModal();
        }}
      >
        <DialogContent className="!w-[96vw] md:!w-[88vw] lg:!w-[76vw] !max-w-none h-[84vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SplitSquareHorizontal className="w-5 h-5 text-indigo-500" />
              Side-by-Side Compare
            </DialogTitle>
            <DialogDescription>
              {compareBase && compareTarget ? `Comparing v${compareBase.revisionNumber} and v${compareTarget.revisionNumber}` : 'Compare adjacent revisions.'}
            </DialogDescription>
          </DialogHeader>

          {compareBase && compareTarget && (
            <div className="space-y-3 flex-1 min-h-0 flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-indigo-900">
                  v{compareBase.revisionNumber} ↔ v{compareTarget.revisionNumber}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {getAllowedComparisonTargets(compareBase).map((candidate) => (
                    <Button
                      key={candidate.id}
                      variant={compareTarget.id === candidate.id ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => startComparison(compareBase, candidate)}
                    >
                      Compare with v{candidate.revisionNumber}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">+{comparisonSummary.added} Added</span>
                <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700">-{comparisonSummary.removed} Removed</span>
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">~{comparisonSummary.modified} Modified</span>
              </div>

              <div className="grid grid-cols-2 gap-2 border border-indigo-200 rounded-md overflow-hidden text-[11px] font-mono flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-white">
                <div className="sticky top-0 bg-slate-100 px-2 py-1 border-b border-slate-200 text-slate-700 font-semibold">
                  v{compareBase.revisionNumber}
                </div>
                <div className="sticky top-0 bg-slate-100 px-2 py-1 border-b border-slate-200 text-slate-700 font-semibold">
                  v{compareTarget.revisionNumber}
                </div>
                {comparisonRows.map((row, idx) => (
                  <Fragment key={`comparison-row-${idx}`}>
                    <div className={cn(
                      'px-2 py-1 border-t border-slate-100 whitespace-pre-wrap break-all',
                        row.type === 'remove'
                          ? 'bg-rose-50 text-rose-900'
                          : row.type === 'modify'
                            ? 'bg-amber-50 text-amber-900'
                            : 'bg-white text-slate-700'
                    )}>
                      {row.leftNo !== null ? (
                        <div className="grid grid-cols-[56px_1fr] gap-2">
                            <span className={cn(
                              'text-right select-none border-r pr-2',
                              row.type === 'modify' ? 'text-amber-700 border-amber-200' : 'text-slate-500 border-slate-200'
                            )}>
                            {row.leftNo}
                          </span>
                          <span>{row.left}</span>
                        </div>
                      ) : ''}
                    </div>
                    <div className={cn(
                      'px-2 py-1 border-t border-slate-100 whitespace-pre-wrap break-all',
                        row.type === 'add'
                          ? 'bg-emerald-50 text-emerald-900'
                          : row.type === 'modify'
                            ? 'bg-amber-50 text-amber-900'
                            : 'bg-white text-slate-700'
                    )}>
                      {row.rightNo !== null ? (
                        <div className="grid grid-cols-[56px_1fr] gap-2">
                            <span className={cn(
                              'text-right select-none border-r pr-2',
                              row.type === 'modify' ? 'text-amber-700 border-amber-200' : 'text-slate-500 border-slate-200'
                            )}>
                            {row.rightNo}
                          </span>
                          <span>{row.right}</span>
                        </div>
                      ) : ''}
                    </div>
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
