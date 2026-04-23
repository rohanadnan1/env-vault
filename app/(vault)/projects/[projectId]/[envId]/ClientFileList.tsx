"use client";

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, MoreHorizontal, Trash2, Edit3, Download, GripVertical,
  FileCode2, FileJson, FileImage, ShieldAlert, BookText, Code2, Database,
  AlertTriangle, Loader2, Pin, PinOff, MessageSquare, Package, ChevronDown,
  ChevronRight, Plus, Wand2, PackageOpen, X, Pencil,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileEditor } from '@/components/vault/FileEditor';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  fileMatchesBundle,
  detectBundleCandidates,
  type BundleCandidate,
} from '@/lib/bundles';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VaultFile {
  id: string;
  name: string;
  contentEncrypted: string;
  iv: string;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  pinnedAt: string | null;
  _count: { comments: number };
}

type BundleType = 'EXTENSION' | 'NAME' | 'CUSTOM';

interface FileBundle {
  id: string;
  name: string;
  bundleType: BundleType;
  matchRule: string | null;
  members: { fileId: string; addedAt: string }[];
}

// ─── File type icons ──────────────────────────────────────────────────────────
const getFileTypeConfig = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js': case 'jsx': case 'ts': case 'tsx':
      return { icon: FileCode2, textColor: 'text-yellow-600', bgColor: 'bg-yellow-100 group-hover:bg-yellow-200', label: 'JavaScript / TS' };
    case 'py':
      return { icon: FileCode2, textColor: 'text-blue-600', bgColor: 'bg-blue-100 group-hover:bg-blue-200', label: 'Python' };
    case 'json':
      return { icon: FileJson, textColor: 'text-emerald-600', bgColor: 'bg-emerald-100 group-hover:bg-emerald-200', label: 'JSON Data' };
    case 'md': case 'mdx':
      return { icon: BookText, textColor: 'text-slate-600', bgColor: 'bg-slate-100 group-hover:bg-slate-200', label: 'Markdown Document' };
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg':
      return { icon: FileImage, textColor: 'text-pink-600', bgColor: 'bg-pink-100 group-hover:bg-pink-200', label: 'Image Asset' };
    case 'env':
      return { icon: ShieldAlert, textColor: 'text-red-600', bgColor: 'bg-red-100 group-hover:bg-red-200', label: 'Environment Variables' };
    case 'css': case 'scss': case 'less':
      return { icon: Code2, textColor: 'text-cyan-600', bgColor: 'bg-cyan-100 group-hover:bg-cyan-200', label: 'Cascading Styles' };
    case 'sql': case 'db':
      return { icon: Database, textColor: 'text-indigo-600', bgColor: 'bg-indigo-100 group-hover:bg-indigo-200', label: 'Database / SQL' };
    default:
      return { icon: FileText, textColor: 'text-slate-500', bgColor: 'bg-slate-100 group-hover:bg-slate-200', label: 'Plain Text' };
  }
};

// ─── Recency badges ───────────────────────────────────────────────────────────
type RecencyBadge = { label: string; className: string } | null;

const JUST_CREATED_MS     = 3  * 60 * 1000;
const RECENTLY_CREATED_MS = 60 * 60 * 1000;
const EDIT_THRESHOLD_MS   = 30 * 1000;
const JUST_EDITED_MS      = 10 * 60 * 1000;
const EDITED_RECENTLY_MS  = 2  * 60 * 60 * 1000;
const EDITED_EARLIER_MS   = 48 * 60 * 60 * 1000;

function computeRecencyBadges(files: VaultFile[], now: number): Map<string, RecencyBadge> {
  const map = new Map<string, RecencyBadge>();
  for (const file of files) {
    const created  = new Date(file.createdAt).getTime();
    const updated  = new Date(file.updatedAt).getTime();
    const editDiff = updated - created;
    const age      = now - updated;
    if (editDiff >= EDIT_THRESHOLD_MS) {
      if (age < JUST_EDITED_MS)        map.set(file.id, { label: 'Just Edited',     className: 'bg-rose-100 text-rose-700 border border-rose-300' });
      else if (age < EDITED_RECENTLY_MS) map.set(file.id, { label: 'Edited Recently', className: 'bg-rose-50  text-rose-500 border border-rose-200' });
      else if (age < EDITED_EARLIER_MS)  map.set(file.id, { label: 'Edited Earlier',  className: 'bg-pink-50  text-pink-400 border border-pink-100' });
    } else {
      const creationAge = now - created;
      if (creationAge < JUST_CREATED_MS)       map.set(file.id, { label: 'Just Created',     className: 'bg-emerald-100 text-emerald-700 border border-emerald-300' });
      else if (creationAge < RECENTLY_CREATED_MS) map.set(file.id, { label: 'Recently Created', className: 'bg-emerald-50  text-emerald-600 border border-emerald-200' });
    }
  }
  return map;
}

// ─── Bundle type label ────────────────────────────────────────────────────────
function bundleTypeLabel(bundleType: BundleType, matchRule: string | null): string {
  if (bundleType === 'EXTENSION' && matchRule) return `${matchRule} files only`;
  if (bundleType === 'NAME' && matchRule) return `"${matchRule}*" named files only`;
  return 'Any files (custom)';
}

// ─── Component ────────────────────────────────────────────────────────────────
export function ClientFileList({
  files,
  folderId,
  environmentId,
}: {
  files: VaultFile[];
  folderId: string | null;
  environmentId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  // ── Files state ───────────────────────────────────────────────────────────
  const [localFiles, setLocalFiles] = useState<VaultFile[]>(files);
  const prevFileIdsRef = useRef<Set<string>>(new Set(files.map(f => f.id)));
  const [pendingBundleCheck, setPendingBundleCheck] = useState<VaultFile[]>([]);

  useEffect(() => {
    const prevIds = prevFileIdsRef.current;
    const newFiles = files.filter(f => !prevIds.has(f.id));
    prevFileIdsRef.current = new Set(files.map(f => f.id));
    setLocalFiles(files);
    if (newFiles.length > 0) setPendingBundleCheck(newFiles);
  }, [files]);

  // ── Recency map ───────────────────────────────────────────────────────────
  const [recencyMap, setRecencyMap] = useState<Map<string, RecencyBadge>>(
    () => computeRecencyBadges(files, Date.now())
  );
  useEffect(() => {
    setRecencyMap(computeRecencyBadges(localFiles, Date.now()));
    const id = setInterval(() => setRecencyMap(computeRecencyBadges(localFiles, Date.now())), 30_000);
    return () => clearInterval(id);
  }, [localFiles]);

  // ── Bundles state ─────────────────────────────────────────────────────────
  const [localBundles, setLocalBundles] = useState<FileBundle[]>([]);
  const [bundlesLoading, setBundlesLoading] = useState(true);
  const [collapsedBundles, setCollapsedBundles] = useState<Set<string>>(new Set());
  const [bundleDropTarget, setBundleDropTarget] = useState<string | null>(null);

  const fetchBundles = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ environmentId });
      if (folderId) qs.set('folderId', folderId);
      else qs.set('folderId', 'null');
      const res = await fetch(`/api/vault-bundles?${qs}`);
      if (res.ok) setLocalBundles(await res.json());
    } catch { /* ignore */ } finally {
      setBundlesLoading(false);
    }
  }, [environmentId, folderId]);

  useEffect(() => { fetchBundles(); }, [fetchBundles]);

  // ── New-file → bundle auto-prompt ─────────────────────────────────────────
  const [newFileBundlePrompt, setNewFileBundlePrompt] = useState<{ file: VaultFile; bundle: FileBundle } | null>(null);

  useEffect(() => {
    if (pendingBundleCheck.length === 0 || localBundles.length === 0) return;
    for (const file of pendingBundleCheck) {
      for (const bundle of localBundles) {
        if (
          bundle.bundleType !== 'CUSTOM' &&
          fileMatchesBundle(file.name, bundle.bundleType as 'EXTENSION' | 'NAME', bundle.matchRule) &&
          !bundle.members.some(m => m.fileId === file.id)
        ) {
          setNewFileBundlePrompt({ file, bundle });
          setPendingBundleCheck([]);
          return;
        }
      }
    }
    setPendingBundleCheck([]);
  }, [pendingBundleCheck, localBundles]);

  // ── Editor / Delete dialog state ──────────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<VaultFile | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);

  const handleEdit = (file: VaultFile) => { setSelectedFile(file); setIsEditorOpen(true); };

  // ── Bundle mismatch dialog ────────────────────────────────────────────────
  const [mismatchDialog, setMismatchDialog] = useState<{ file: VaultFile; bundle: FileBundle } | null>(null);
  const [mismatchConverting, setMismatchConverting] = useState(false);
  const [mismatchRenaming, setMismatchRenaming] = useState(false);
  const [mismatchRenameValue, setMismatchRenameValue] = useState('');

  // ── Bundle rename dialog ──────────────────────────────────────────────────
  const [renamingBundle, setRenamingBundle] = useState<FileBundle | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // ── Bundle delete confirm ─────────────────────────────────────────────────
  const [deletingBundle, setDeletingBundle] = useState<FileBundle | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Pin / Unpin
  // ─────────────────────────────────────────────────────────────────────────
  const handlePin = useCallback(async (file: VaultFile) => {
    const wasPin = file.pinnedAt !== null;
    if (!wasPin) {
      const pinnedCount = localFiles.filter(f => f.pinnedAt !== null).length;
      if (pinnedCount >= 3) { toast.error('Only 3 files can be pinned at a time.'); return; }
    }
    const newPinnedAt = wasPin ? null : new Date().toISOString();
    setLocalFiles(prev => prev.map(f => f.id === file.id ? { ...f, pinnedAt: newPinnedAt } : f));
    try {
      const res = await fetch(`/api/vault-files/${file.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinnedAt: newPinnedAt }),
      });
      if (!res.ok) throw new Error();
      toast.success(wasPin ? 'File unpinned' : 'File pinned');
    } catch {
      setLocalFiles(prev => prev.map(f => f.id === file.id ? { ...f, pinnedAt: file.pinnedAt } : f));
      toast.error('Could not update pin status');
      return;
    }
    startTransition(() => router.refresh());
  }, [localFiles, router, startTransition]);

  // ─────────────────────────────────────────────────────────────────────────
  // Delete file
  // ─────────────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    if (!fileToDelete) return;
    const snapshot = fileToDelete;
    setIsDeleteOpen(false);
    setFileToDelete(null);
    setLocalFiles(prev => prev.filter(f => f.id !== snapshot.id));
    // Remove from bundle membership locally too
    setLocalBundles(prev => prev.map(b => ({
      ...b,
      members: b.members.filter(m => m.fileId !== snapshot.id),
    })));
    try {
      const res = await fetch(`/api/vault-files/${snapshot.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('File deleted');
    } catch {
      setLocalFiles(prev => [...prev, snapshot]);
      toast.error('Could not delete file');
      return;
    }
    startTransition(() => router.refresh());
  }, [fileToDelete, router, startTransition]);

  // ─────────────────────────────────────────────────────────────────────────
  // Download
  // ─────────────────────────────────────────────────────────────────────────
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleDownload = async (file: VaultFile) => {
    if (!derivedKey) { toast.error('Vault is locked'); return; }
    setDownloadingFileId(file.id);
    touchActivity();
    try {
      let decrypted: string;
      try {
        decrypted = await decryptSecret(file.contentEncrypted, file.iv, derivedKey, `${file.name}:${environmentId}`);
      } catch {
        if (!folderId) throw new Error();
        decrypted = await decryptSecret(file.contentEncrypted, file.iv, derivedKey, `${file.name}:${folderId}`);
      }
      triggerDownload(new Blob([decrypted], { type: file.mimeType || 'text/plain' }), file.name);
      toast.success(`Downloaded ${file.name}`);
    } catch {
      toast.error('Failed to download file');
    } finally {
      setDownloadingFileId(null);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Drag start (files)
  // ─────────────────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, file: VaultFile) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/envvault', JSON.stringify({ type: 'file', id: file.id, sourceId: folderId }));
    e.dataTransfer.setData('application/envvault-filename', file.name);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Drag-over / drop on a bundle
  // ─────────────────────────────────────────────────────────────────────────
  const handleDragOverBundle = (e: React.DragEvent, bundleId: string) => {
    if (!e.dataTransfer.types.includes('application/envvault')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setBundleDropTarget(bundleId);
  };

  const handleDragLeaveBundle = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setBundleDropTarget(null);
    }
  };

  const handleDropOnBundle = async (e: React.DragEvent, bundle: FileBundle) => {
    e.preventDefault();
    setBundleDropTarget(null);
    const raw = e.dataTransfer.getData('application/envvault');
    if (!raw) return;
    let payload: { type: string; id: string };
    try { payload = JSON.parse(raw); } catch { return; }
    if (payload.type !== 'file') return;

    const file = localFiles.find(f => f.id === payload.id);
    if (!file) return;

    // Already a member — nothing to do
    if (bundle.members.some(m => m.fileId === file.id)) {
      toast.info(`${file.name} is already in this bundle`);
      return;
    }

    // Validate match rule
    if (bundle.bundleType !== 'CUSTOM' && !fileMatchesBundle(file.name, bundle.bundleType as 'EXTENSION' | 'NAME', bundle.matchRule)) {
      setMismatchDialog({ file, bundle });
      return;
    }

    await addFileToBundle(file.id, bundle.id);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Bundle CRUD
  // ─────────────────────────────────────────────────────────────────────────
  const addFileToBundle = async (fileId: string, bundleId: string) => {
    // Optimistic: remove from other bundles, add to this one
    setLocalBundles(prev => prev.map(b => {
      if (b.id === bundleId) {
        return { ...b, members: [...b.members.filter(m => m.fileId !== fileId), { fileId, addedAt: new Date().toISOString() }] };
      }
      return { ...b, members: b.members.filter(m => m.fileId !== fileId) };
    }));
    try {
      const res = await fetch(`/api/vault-bundles/${bundleId}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      if (!res.ok) throw new Error();
      toast.success('File added to bundle');
    } catch {
      await fetchBundles(); // re-sync on error
      toast.error('Could not add file to bundle');
    }
  };

  const removeFileFromBundle = async (fileId: string, bundleId: string) => {
    setLocalBundles(prev => prev.map(b =>
      b.id === bundleId ? { ...b, members: b.members.filter(m => m.fileId !== fileId) } : b
    ));
    try {
      const res = await fetch(`/api/vault-bundles/${bundleId}/members`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      });
      if (!res.ok) throw new Error();
      toast.success('File removed from bundle');
    } catch {
      await fetchBundles();
      toast.error('Could not remove file from bundle');
    }
  };

  const createBundle = async (candidate: BundleCandidate) => {
    try {
      const res = await fetch('/api/vault-bundles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: candidate.name,
          bundleType: candidate.bundleType,
          matchRule: candidate.matchRule,
          environmentId,
          folderId: folderId ?? null,
          fileIds: candidate.fileIds,
        }),
      });
      if (!res.ok) throw new Error();
      const bundle: FileBundle = await res.json();
      setLocalBundles(prev => [...prev, bundle]);
      toast.success(`${candidate.name} created`);
    } catch {
      toast.error('Could not create bundle');
    }
  };

  const createCustomBundle = async () => {
    const name = 'Custom Bundle';
    try {
      const res = await fetch('/api/vault-bundles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          bundleType: 'CUSTOM',
          matchRule: null,
          environmentId,
          folderId: folderId ?? null,
          fileIds: [],
        }),
      });
      if (!res.ok) throw new Error();
      const bundle: FileBundle = await res.json();
      setLocalBundles(prev => [...prev, bundle]);
      toast.success('Custom bundle created — drag files into it');
    } catch {
      toast.error('Could not create bundle');
    }
  };

  const convertToCustom = async (bundleId: string, fileToAdd?: VaultFile, newName?: string) => {
    setMismatchConverting(true);
    try {
      const body: Record<string, unknown> = { bundleType: 'CUSTOM', matchRule: null };
      if (newName && newName.trim()) body.name = newName.trim();
      const res = await fetch(`/api/vault-bundles/${bundleId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const updated: FileBundle = await res.json();
      setLocalBundles(prev => prev.map(b => b.id === bundleId ? updated : b));
      toast.success('Bundle converted to custom');
      if (fileToAdd) await addFileToBundle(fileToAdd.id, bundleId);
    } catch {
      toast.error('Could not convert bundle');
    } finally {
      setMismatchConverting(false);
      setMismatchRenaming(false);
      setMismatchRenameValue('');
      setMismatchDialog(null);
    }
  };

  const handleRenameBundle = async () => {
    if (!renamingBundle || !renameValue.trim()) return;
    const id = renamingBundle.id;
    const name = renameValue.trim();
    setRenamingBundle(null);
    setLocalBundles(prev => prev.map(b => b.id === id ? { ...b, name } : b));
    try {
      const res = await fetch(`/api/vault-bundles/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
      toast.success('Bundle renamed');
    } catch {
      await fetchBundles();
      toast.error('Could not rename bundle');
    }
  };

  const handleDeleteBundle = async () => {
    if (!deletingBundle) return;
    const id = deletingBundle.id;
    setDeletingBundle(null);
    setLocalBundles(prev => prev.filter(b => b.id !== id));
    try {
      const res = await fetch(`/api/vault-bundles/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Bundle deleted');
    } catch {
      await fetchBundles();
      toast.error('Could not delete bundle');
    }
  };

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!localFiles || localFiles.length === 0) return null;

  // ── Sort pinned ───────────────────────────────────────────────────────────
  const pinnedFiles   = [...localFiles].filter(f => f.pinnedAt !== null).sort((a, b) =>
    new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime()
  );
  const allUnpinned   = localFiles.filter(f => f.pinnedAt === null);

  // Compute which files are in a bundle
  const bundledFileIds = new Set(localBundles.flatMap(b => b.members.map(m => m.fileId)));
  const unbundledFiles = allUnpinned.filter(f => !bundledFileIds.has(f.id));

  // Bundle candidates for the dropdown (only for unbundled files)
  const existingMatchRules = localBundles
    .map(b => b.matchRule)
    .filter(Boolean) as string[];
  const candidates = detectBundleCandidates(
    unbundledFiles.map(f => ({ id: f.id, name: f.name })),
    existingMatchRules
  );

  // ── Row renderer ──────────────────────────────────────────────────────────
  const renderRow = (file: VaultFile, opts: { isPinned?: boolean; inBundle?: FileBundle } = {}) => {
    const { isPinned = false, inBundle } = opts;
    const config = getFileTypeConfig(file.name);
    const Icon = config.icon;
    const badge = recencyMap.get(file.id);
    const commentCount = file._count.comments;

    return (
      <div
        key={file.id}
        draggable
        onDragStart={(e) => handleDragStart(e, file)}
        className={cn(
          'flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer group transition-colors',
          isPinned && 'bg-indigo-50/30 hover:bg-indigo-50/50',
          inBundle && 'pl-6'
        )}
        onClick={() => handleEdit(file)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <GripVertical className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 cursor-grab shrink-0 -ml-2" />
          <div className={`p-2 rounded-lg transition-colors shrink-0 ${config.bgColor} ${config.textColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isPinned && <Pin className="w-3 h-3 text-indigo-500 shrink-0" />}
              <span className="text-sm font-bold text-slate-900 truncate">{file.name}</span>
              {badge && (
                <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide whitespace-nowrap shrink-0', badge.className)}>
                  {badge.label}
                </span>
              )}
              {commentCount > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200 whitespace-nowrap shrink-0"
                  title={`${commentCount} comment${commentCount !== 1 ? 's' : ''}`}
                >
                  <MessageSquare className="w-2.5 h-2.5" />
                  {commentCount}
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-medium tracking-wider">
              {config.label} &bull; {new Date(file.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                className="p-2 hover:bg-slate-200/50 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 transition-all outline-none"
                onClick={(e) => e.stopPropagation()}
                aria-label={`Options for ${file.name}`}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleEdit(file); }}>
              <Edit3 className="w-3.5 h-3.5 mr-2" /> Edit Content
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => { e.stopPropagation(); handleDownload(file); }}
              disabled={downloadingFileId === file.id}
            >
              {downloadingFileId === file.id
                ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Downloading...</>
                : <><Download className="w-3.5 h-3.5 mr-2" /> Download File</>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handlePin(file); }}>
              {isPinned
                ? <><PinOff className="w-3.5 h-3.5 mr-2" /> Unpin File</>
                : <><Pin className="w-3.5 h-3.5 mr-2" /> Pin File</>}
            </DropdownMenuItem>
            {inBundle && (
              <DropdownMenuItem
                onClick={(e) => { e.stopPropagation(); removeFileFromBundle(file.id, inBundle.id); }}
              >
                <PackageOpen className="w-3.5 h-3.5 mr-2" /> Remove from Bundle
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-rose-600 focus:text-rose-600"
              onClick={(e) => { e.stopPropagation(); setFileToDelete(file); setIsDeleteOpen(true); }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  // ── Bundle section renderer ───────────────────────────────────────────────
  const renderBundle = (bundle: FileBundle) => {
    const isCollapsed = collapsedBundles.has(bundle.id);
    const isDrop = bundleDropTarget === bundle.id;
    const filesInBundle = bundle.members
      .map(m => localFiles.find(f => f.id === m.fileId))
      .filter((f): f is VaultFile => f !== undefined);

    return (
      <div
        key={bundle.id}
        className={cn(
          'border-b border-slate-50 transition-colors',
          isDrop && 'bg-violet-50/60 ring-2 ring-inset ring-violet-300'
        )}
        onDragOver={(e) => handleDragOverBundle(e, bundle.id)}
        onDragLeave={handleDragLeaveBundle}
        onDrop={(e) => handleDropOnBundle(e, bundle)}
      >
        {/* Bundle header */}
        <div
          className={cn(
            'flex items-center justify-between px-4 py-2.5 cursor-pointer select-none group/bh transition-colors',
            isDrop ? 'bg-violet-50' : 'bg-violet-50/40 hover:bg-violet-50/70'
          )}
          onClick={() => setCollapsedBundles(prev => {
            const next = new Set(prev);
            next.has(bundle.id) ? next.delete(bundle.id) : next.add(bundle.id);
            return next;
          })}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isCollapsed
              ? <ChevronRight className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              : <ChevronDown className="w-3.5 h-3.5 text-violet-400 shrink-0" />}
            <Package className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-violet-600 truncate">
              {bundle.name}
            </span>
            <span className="text-[9px] text-violet-400 font-medium shrink-0">
              {filesInBundle.length} file{filesInBundle.length !== 1 ? 's' : ''}
            </span>
            {isDrop && (
              <span className="text-[9px] text-violet-500 font-bold shrink-0 animate-pulse">
                Drop to add →
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[9px] text-violet-400 font-medium hidden sm:block">
              {bundleTypeLabel(bundle.bundleType, bundle.matchRule)}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="p-1.5 hover:bg-violet-200/50 rounded-full text-violet-400 opacity-0 group-hover/bh:opacity-100 transition-all outline-none"
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Options for ${bundle.name}`}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenamingBundle(bundle); setRenameValue(bundle.name); }}>
                  <Pencil className="w-3.5 h-3.5 mr-2" /> Rename Bundle
                </DropdownMenuItem>
                {bundle.bundleType !== 'CUSTOM' && (
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); convertToCustom(bundle.id); }}>
                    <Wand2 className="w-3.5 h-3.5 mr-2" /> Convert to Custom Bundle
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-600 focus:text-rose-600"
                  onClick={(e) => { e.stopPropagation(); setDeletingBundle(bundle); }}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Bundle
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Bundle files */}
        {!isCollapsed && (
          filesInBundle.length === 0 ? (
            <div className="px-6 py-4 text-center text-[11px] text-slate-400 italic border-b border-slate-50 bg-slate-50/30">
              Drop files here to add them to this bundle
            </div>
          ) : (
            <div className="divide-y divide-slate-50/80">
              {filesInBundle.map(f => renderRow(f, { inBundle: bundle, isPinned: f.pinnedAt !== null }))}
            </div>
          )
        )}
      </div>
    );
  };

  return (
    <>
      <div className="divide-y divide-slate-50">

        {/* Files section header with Bundle creation button */}
        <div className="px-4 py-2 bg-slate-50/60 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Files</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-violet-600 bg-violet-50 hover:bg-violet-100 border border-violet-200 transition-colors outline-none"
                  title="Create a bundle to group related files"
                >
                  <Package className="w-3 h-3" />
                  Bundle
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-72">
              {candidates.length > 0 ? (
                <>
                  <div className="px-2 py-1.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Auto-detected</p>
                  </div>
                  {candidates.map((c) => (
                    <DropdownMenuItem
                      key={c.matchRule}
                      onClick={() => createBundle(c)}
                      className="flex-col items-start gap-0.5"
                    >
                      <div className="flex items-center gap-2 w-full">
                        <Package className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                        <span className="font-semibold text-slate-800">{c.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 pl-5.5 ml-5">
                        {c.fileNames.slice(0, 3).join(', ')}{c.fileNames.length > 3 ? ` +${c.fileNames.length - 3} more` : ''}
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              ) : (
                <div className="px-3 py-2 text-[10px] text-slate-400 italic">
                  No auto-bundles detected for current files
                </div>
              )}
              <DropdownMenuItem onClick={createCustomBundle}>
                <Plus className="w-3.5 h-3.5 mr-2 text-slate-500" />
                <div>
                  <div className="font-semibold text-slate-800">Create Custom Bundle</div>
                  <div className="text-[10px] text-slate-400">Add any files you want</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Pinned section */}
        {pinnedFiles.length > 0 && (
          <>
            <div className="px-4 py-2 bg-indigo-50/40 border-b border-indigo-100/60">
              <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                <Pin className="w-3 h-3" /> Pinned
              </span>
            </div>
            {pinnedFiles.map(f => renderRow(f, { isPinned: true }))}
          </>
        )}

        {/* Bundle sections */}
        {!bundlesLoading && localBundles.map(renderBundle)}

        {/* All Files (unbundled) */}
        {unbundledFiles.length > 0 && localBundles.length > 0 && (
          <div className="px-4 py-2 bg-slate-50/60 border-b border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Unbundled Files</span>
          </div>
        )}
        {unbundledFiles.map(f => renderRow(f, {}))}
      </div>

      {/* FileEditor (edit mode) */}
      {selectedFile && (
        <FileEditor
          open={isEditorOpen}
          onOpenChange={setIsEditorOpen}
          folderId={folderId}
          environmentId={environmentId}
          existingFileNames={localFiles.filter(f => f.id !== selectedFile.id).map(f => f.name)}
          initialData={{ ...selectedFile, commentCount: selectedFile._count.comments }}
          onCommentCountChange={(count) => {
            setLocalFiles(prev => prev.map(f =>
              f.id === selectedFile.id ? { ...f, _count: { ...f._count, comments: count } } : f
            ));
          }}
          onSuccess={() => { startTransition(() => router.refresh()); fetchBundles(); }}
        />
      )}

      {/* Delete file dialog */}
      <Dialog
        open={isDeleteOpen}
        onOpenChange={(v) => { if (!v) { setIsDeleteOpen(false); setFileToDelete(null); } }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 font-bold">
              <AlertTriangle className="w-5 h-5" /> Delete File?
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600 font-medium">
              Are you sure you want to delete{' '}
              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">
                {fileToDelete?.name}
              </span>?
            </DialogDescription>
            <p className="text-xs text-slate-400 pt-2 italic leading-relaxed">This action cannot be undone.</p>
          </DialogHeader>
          <DialogFooter className="pt-6 sm:justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => { setIsDeleteOpen(false); setFileToDelete(null); }}
              className="rounded-xl flex-1 border border-slate-200"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!fileToDelete}
              className="rounded-xl flex-1 font-bold shadow-lg shadow-rose-200"
            >
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bundle mismatch dialog */}
      <Dialog
        open={mismatchDialog !== null}
        onOpenChange={(v) => {
          if (!v && !mismatchConverting) {
            setMismatchDialog(null);
            setMismatchRenaming(false);
            setMismatchRenameValue('');
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 font-bold">
              <AlertTriangle className="w-5 h-5" /> File Doesn&apos;t Belong Here
            </DialogTitle>
            {mismatchDialog && (
              <DialogDescription className="pt-2 text-slate-600 leading-relaxed">
                <strong className="text-slate-900">{mismatchDialog.bundle.name}</strong> is a{' '}
                <span className="font-mono bg-slate-100 px-1 rounded text-slate-800">
                  {mismatchDialog.bundle.bundleType === 'EXTENSION'
                    ? `*${mismatchDialog.bundle.matchRule}`
                    : `${mismatchDialog.bundle.matchRule}*.*`}
                </span>{' '}
                bundle, but you&apos;re dropping{' '}
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">
                  {mismatchDialog.file.name}
                </span>{' '}
                which doesn&apos;t match that rule.
              </DialogDescription>
            )}
          </DialogHeader>
          <div className="pt-2 pb-1">
            {!mismatchRenaming ? (
              <>
                <p className="text-sm font-semibold text-slate-700 mb-3">What would you like to do?</p>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    className="justify-start h-auto py-3 px-4 border-violet-200 text-violet-700 hover:bg-violet-50"
                    disabled={mismatchConverting}
                    onClick={() => {
                      if (!mismatchDialog) return;
                      setMismatchRenameValue(mismatchDialog.bundle.name);
                      setMismatchRenaming(true);
                    }}
                  >
                    <Wand2 className="w-4 h-4 mr-2 shrink-0" />
                    <div className="text-left">
                      <div className="font-bold text-sm">Convert to Custom Bundle</div>
                      <div className="text-xs text-slate-500 font-normal">Remove the type restriction and add any file</div>
                    </div>
                  </Button>
                  <Button
                    variant="ghost"
                    className="justify-start border border-slate-200"
                    onClick={() => setMismatchDialog(null)}
                    disabled={mismatchConverting}
                  >
                    <X className="w-4 h-4 mr-2" /> Keep Bundle As Is
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-slate-700 mb-2">Rename the bundle (optional)</p>
                <Input
                  autoFocus
                  value={mismatchRenameValue}
                  onChange={(e) => setMismatchRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && mismatchDialog) {
                      convertToCustom(mismatchDialog.bundle.id, mismatchDialog.file, mismatchRenameValue);
                    }
                    if (e.key === 'Escape') {
                      setMismatchRenaming(false);
                      setMismatchRenameValue('');
                    }
                  }}
                  placeholder="Bundle name"
                  className="mb-3"
                  disabled={mismatchConverting}
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                    disabled={mismatchConverting || !mismatchRenameValue.trim()}
                    onClick={() => mismatchDialog && convertToCustom(mismatchDialog.bundle.id, mismatchDialog.file, mismatchRenameValue)}
                  >
                    {mismatchConverting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    Convert &amp; Add File
                  </Button>
                  <Button
                    variant="ghost"
                    className="border border-slate-200"
                    disabled={mismatchConverting}
                    onClick={() => { setMismatchRenaming(false); setMismatchRenameValue(''); }}
                  >
                    Back
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* New file → bundle prompt */}
      <Dialog
        open={newFileBundlePrompt !== null}
        onOpenChange={(v) => { if (!v) setNewFileBundlePrompt(null); }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-700 font-bold">
              <Package className="w-5 h-5" /> Add to Bundle?
            </DialogTitle>
            {newFileBundlePrompt && (
              <DialogDescription className="pt-2 text-slate-600 leading-relaxed">
                Your new file{' '}
                <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">
                  {newFileBundlePrompt.file.name}
                </span>{' '}
                matches the{' '}
                <strong className="text-slate-900">{newFileBundlePrompt.bundle.name}</strong>.
                Would you like to add it to the bundle automatically?
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter className="pt-4 sm:justify-between gap-3">
            <Button
              variant="ghost"
              onClick={() => setNewFileBundlePrompt(null)}
              className="rounded-xl flex-1 border border-slate-200"
            >
              Keep Separate
            </Button>
            <Button
              className="rounded-xl flex-1 font-bold bg-violet-600 hover:bg-violet-700 text-white"
              onClick={async () => {
                if (!newFileBundlePrompt) return;
                await addFileToBundle(newFileBundlePrompt.file.id, newFileBundlePrompt.bundle.id);
                setNewFileBundlePrompt(null);
              }}
            >
              <Package className="w-4 h-4 mr-2" /> Add to Bundle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename bundle dialog */}
      <Dialog
        open={renamingBundle !== null}
        onOpenChange={(v) => { if (!v) setRenamingBundle(null); }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-bold">
              <Pencil className="w-4 h-4" /> Rename Bundle
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameBundle(); }}
              placeholder="Bundle name"
              className="h-10"
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setRenamingBundle(null)} className="border border-slate-200">Cancel</Button>
            <Button
              onClick={handleRenameBundle}
              disabled={!renameValue.trim()}
              className="bg-violet-600 hover:bg-violet-700 text-white font-bold"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete bundle confirm */}
      <Dialog
        open={deletingBundle !== null}
        onOpenChange={(v) => { if (!v) setDeletingBundle(null); }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 font-bold">
              <Trash2 className="w-5 h-5" /> Delete Bundle?
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600">
              Delete{' '}
              <strong className="text-slate-900">{deletingBundle?.name}</strong>?
              Files inside will not be deleted — they'll just move to unbundled.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-4 gap-3 sm:justify-between">
            <Button variant="ghost" onClick={() => setDeletingBundle(null)} className="flex-1 border border-slate-200">Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteBundle} className="flex-1 font-bold">
              Delete Bundle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isPending && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-full px-3 py-1.5 shadow-sm z-50 pointer-events-none">
          <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
          <span className="text-[10px] font-medium text-slate-400">Syncing...</span>
        </div>
      )}
    </>
  );
}
