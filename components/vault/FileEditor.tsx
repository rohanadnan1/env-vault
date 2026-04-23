"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { encryptSecret } from '@/lib/crypto/encrypt';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';
import { FileText, Save, Maximize2, Minimize2, FileCode2, FileJson, FileImage, ShieldAlert, BookText, Code2, Database, X, Copy, History, MessageSquare, Loader2, Trash2, Send, AlertTriangle, Lock, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FileHistoryModal } from '@/components/vault/FileHistoryModal';
import { Textarea } from '@/components/ui/textarea';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Editor from 'react-simple-code-editor';
import Prism from 'prismjs';

// Prism components expect a global Prism object to exist during module evaluation.
if (typeof window !== 'undefined') {
  (window as any).Prism = Prism;
} else if (typeof global !== 'undefined') {
  (global as any).Prism = Prism;
}

import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-yaml';
import 'prismjs/themes/prism.css';





interface FileEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string | null;
  environmentId?: string;
  onSuccess: () => void;
  /** Names of files already in this folder — used for client-side conflict detection */
  existingFileNames?: string[];
  /** Called whenever the comment count changes so the parent list can update instantly */
  onCommentCountChange?: (count: number) => void;
  initialData?: {
    id: string;
    name: string;
    contentEncrypted: string;
    iv: string;
    mimeType: string;
    commentCount?: number;
  };
}

interface FileCommentData {
  id: string;
  content: string;    // plaintext OR AES-GCM ciphertext (base64) when isEncrypted
  iv?: string | null; // AES-GCM IV when isEncrypted
  isEncrypted: boolean;
  createdAt: string;
}

// ── Name-conflict helpers ────────────────────────────────────────────────────
function splitNameAndExt(filename: string): [string, string] {
  // Dotfiles like .env or .gitignore have no extension
  if (filename.startsWith('.') && !filename.slice(1).includes('.')) return [filename, ''];
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) return [filename, ''];
  return [filename.slice(0, lastDot), filename.slice(lastDot)];
}

function getNextAvailableName(name: string, existingNames: string[]): string {
  const existing = new Set(existingNames.map(n => n.toLowerCase()));
  if (!existing.has(name.toLowerCase())) return name;
  const [base, ext] = splitNameAndExt(name);
  let counter = 1;
  while (existing.has(`${base}${counter}${ext}`.toLowerCase())) counter++;
  return `${base}${counter}${ext}`;
}

interface ConflictDialogState {
  originalName: string;    // What the user typed
  suggestedName: string;   // Computed next-available name
  isChangingName: boolean; // Whether the rename input is visible
  customName: string;      // Value in the rename input
}

export function FileEditor({
  open,
  onOpenChange,
  folderId,
  environmentId,
  onSuccess,
  existingFileNames,
  onCommentCountChange,
  initialData
}: FileEditorProps) {


  const getMimeType = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js': case 'jsx': return 'application/javascript';
      case 'ts': case 'tsx': return 'application/typescript';
      case 'py': return 'text/x-python';
      case 'html': return 'text/html';
      case 'css': return 'text/css';
      case 'json': return 'application/json';
      case 'md': return 'text/markdown';
      case 'txt': return 'text/plain';
      case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'pdf': return 'application/pdf';
      default: return 'text/plain';
    }
  };

  const getPrismLanguage = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js': case 'jsx': return 'javascript';
      case 'ts': case 'tsx': return 'typescript';
      case 'py': return 'python';
      case 'json': return 'json';
      case 'md': case 'mdx': return 'markdown';
      case 'css': return 'css';
      case 'sql': return 'sql';
      case 'sh': case 'bash': return 'bash';
      case 'cpp': case 'cc': case 'c': return 'cpp';
      case 'go': return 'go';
      case 'rs': return 'rust';
      case 'java': return 'java';
      case 'swift': return 'swift';
      case 'yaml': case 'yml': return 'yaml';
      default: return 'clike';
    }
  };

  const getFileTypeConfig = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch(ext) {
      case 'js': case 'jsx': case 'ts': case 'tsx': 
        return { icon: FileCode2, textColor: 'text-yellow-600', bgColor: 'bg-yellow-100', label: 'JavaScript / TS Element' };
      case 'py': 
        return { icon: FileCode2, textColor: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Python Script' };
      case 'json': 
        return { icon: FileJson, textColor: 'text-emerald-600', bgColor: 'bg-emerald-100', label: 'JSON Data' };
      case 'md': case 'mdx': 
        return { icon: BookText, textColor: 'text-slate-600', bgColor: 'bg-slate-100', label: 'Markdown Document' };
      case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': 
        return { icon: FileImage, textColor: 'text-pink-600', bgColor: 'bg-pink-100', label: 'Image Asset' };
      case 'env': 
        return { icon: ShieldAlert, textColor: 'text-red-600', bgColor: 'bg-red-100', label: 'Environment Variables' };
      case 'css': case 'scss': case 'less': 
        return { icon: Code2, textColor: 'text-cyan-600', bgColor: 'bg-cyan-100', label: 'Cascading Styles' };
      case 'sql': case 'db': 
        return { icon: Database, textColor: 'text-indigo-600', bgColor: 'bg-indigo-100', label: 'Database / SQL' };
      default: 
        return { icon: FileText, textColor: 'text-slate-500', bgColor: 'bg-slate-100', label: 'Plain Text' };
    }
  };
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Comments
  const [isCommentsOpen, setIsCommentsOpen]     = useState(false);
  const [comments, setComments]                 = useState<FileCommentData[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentInput, setCommentInput]         = useState('');
  const [isAddingComment, setIsAddingComment]   = useState(false);
  const [localCommentCount, setLocalCommentCount] = useState(initialData?.commentCount ?? 0);
  const [allSecret, setAllSecret]               = useState(false); // send all as secret
  const [decryptedMap, setDecryptedMap]         = useState<Map<string, string>>(new Map());

  // Notify parent list immediately when comment count changes
  useEffect(() => {
    onCommentCountChange?.(localCommentCount);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localCommentCount]);

  // Conflict dialog state
  const [conflictDialog, setConflictDialog] = useState<ConflictDialogState | null>(null);

  useEffect(() => {
    setLocalCommentCount(initialData?.commentCount ?? 0);
  }, [initialData?.commentCount]);

  useEffect(() => {
    if (!open) { setIsCommentsOpen(false); setComments([]); setCommentInput(''); }
  }, [open]);

  const fetchComments = useCallback(async () => {
    if (!initialData?.id) return;
    setIsLoadingComments(true);
    try {
      const res = await fetch(`/api/vault-files/${initialData.id}/comments`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setComments(data);
      setLocalCommentCount(data.length);
    } catch {
      toast.error('Could not load comments');
    } finally {
      setIsLoadingComments(false);
    }
  }, [initialData?.id]);

  useEffect(() => {
    if (isCommentsOpen) fetchComments();
  }, [isCommentsOpen, fetchComments]);

  const handleAddComment = async (forceSecret?: boolean) => {
    if (!commentInput.trim() || !initialData?.id) return;
    const isSecret = forceSecret !== undefined ? forceSecret : allSecret;
    setIsAddingComment(true);
    try {
      let content  = commentInput.trim();
      let iv: string | undefined;
      let isEncrypted = false;

      if (isSecret && derivedKey) {
        const enc = await encryptSecret(content, derivedKey, `comment:${initialData.id}`);
        content     = enc.valueEncrypted;
        iv          = enc.iv;
        isEncrypted = true;
      }

      const res = await fetch(`/api/vault-files/${initialData.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, iv, isEncrypted }),
      });
      if (!res.ok) throw new Error();
      const newComment = await res.json();
      setComments(prev => [...prev, newComment]);

      // Immediately add the plaintext to decryptedMap so it renders without a round-trip
      if (isEncrypted) {
        setDecryptedMap(prev => new Map(prev).set(newComment.id, commentInput.trim()));
      }

      setLocalCommentCount(c => c + 1);
      setCommentInput('');
    } catch {
      toast.error('Could not add comment');
    } finally {
      setIsAddingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!initialData?.id) return;
    try {
      const res = await fetch(`/api/vault-files/${initialData.id}/comments/${commentId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setComments(prev => prev.filter(c => c.id !== commentId));
      setLocalCommentCount(c => Math.max(0, c - 1));
    } catch {
      toast.error('Could not delete comment');
    }
  };
  
  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  // Auto-decrypt encrypted comments whenever the list or the vault key changes
  useEffect(() => {
    if (!derivedKey || comments.length === 0) return;
    (async () => {
      const m = new Map<string, string>();
      for (const c of comments) {
        if (c.isEncrypted && c.iv) {
          try {
            const plain = await decryptSecret(c.content, c.iv, derivedKey, `comment:${initialData?.id}`);
            m.set(c.id, plain);
          } catch {
            m.set(c.id, '🔒 Secret (cannot decrypt)');
          }
        }
      }
      setDecryptedMap(m);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, derivedKey]);

  const handleDecrypt = useCallback(async (encrypted: string, iv: string, fileName: string) => {
    if (!derivedKey) return;
    setIsDecrypting(true);
    try {
      try {
        const aad1 = `${fileName}:${environmentId}`;
        const decrypted = await decryptSecret(encrypted, iv, derivedKey, aad1);
        setContent(decrypted);
      } catch {
        // Fallback for files saved prior to the `environmentId` export AAD synchronization fix
        try {
          const aad2 = `${fileName}:${folderId}`;
          const decrypted = await decryptSecret(encrypted, iv, derivedKey, aad2);
          setContent(decrypted);
        } catch {
          setContent('# DECRYPTION FAILED\n# The master key does not match this file or its state has drifted uniquely. You may safely overwrite this content.');
          toast.error('Decryption failed for this file context.');
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to decrypt file content');
    } finally {
      setIsDecrypting(false);
    }
  }, [derivedKey, environmentId, folderId]);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setName(initialData.name);
        handleDecrypt(initialData.contentEncrypted, initialData.iv, initialData.name);
      } else {
        setName('');
        setContent('');
      }
    }
  }, [open, initialData, handleDecrypt]);

  const handleSave = async (overrideName?: string) => {
    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    const nameToSave = overrideName ?? name;

    // ── Client-side duplicate check (new files only) ──────────────────────
    if (!initialData?.id && existingFileNames && existingFileNames.length > 0) {
      const conflict = existingFileNames.some(
        n => n.toLowerCase() === nameToSave.toLowerCase()
      );
      if (conflict) {
        const suggested = getNextAvailableName(nameToSave, existingFileNames);
        setConflictDialog({
          originalName: nameToSave,
          suggestedName: suggested,
          isChangingName: false,
          customName: suggested,
        });
        return;
      }
    }

    setIsLoading(true);
    touchActivity();

    try {
      const parentScopeId = environmentId || folderId;
      if (!parentScopeId) throw new Error('Missing parent scope');
      const aad = `${nameToSave}:${parentScopeId}`;
      const { valueEncrypted, iv } = await encryptSecret(content, derivedKey, aad);

      const url = initialData?.id ? `/api/vault-files/${initialData.id}` : '/api/vault-files';
      const method = initialData?.id ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameToSave,
          contentEncrypted: valueEncrypted,
          iv,
          folderId,
          environmentId,
          mimeType: getMimeType(nameToSave),
        }),
      });

      if (!res.ok) throw new Error('Failed to save file');

      toast.success(initialData?.id ? 'File updated' : 'File created');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error('Save failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Called when user clicks "Continue" in the conflict dialog
  const handleConflictContinue = () => {
    if (!conflictDialog) return;
    const nameToUse = conflictDialog.suggestedName;
    setConflictDialog(null);
    handleSave(nameToUse);
  };

  // Called when user submits their custom name in the conflict dialog
  const handleConflictCustomSave = () => {
    if (!conflictDialog) return;
    const custom = conflictDialog.customName.trim();
    if (!custom) return;

    // Check if the custom name also conflicts
    const allExisting = existingFileNames ?? [];
    const stillConflicts = allExisting.some(n => n.toLowerCase() === custom.toLowerCase());
    if (stillConflicts) {
      // Recurse: show dialog again with the new conflict info
      const suggested = getNextAvailableName(custom, allExisting);
      setConflictDialog({
        originalName: custom,
        suggestedName: suggested,
        isChangingName: false,
        customName: suggested,
      });
      return;
    }

    // Name is available
    setConflictDialog(null);
    handleSave(custom);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
    toast.success('Content copied to clipboard');
  };

  const uiConfig = getFileTypeConfig(name);
  const EditorIcon = uiConfig.icon;
  const editorLineCount = useMemo(() => Math.max(1, content.split('\n').length), [content]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        showCloseButton={false}
        resizable={false}
        className={cn(
          "transition-all duration-500 ease-in-out flex flex-col p-0 gap-0 overflow-hidden border-none focus:outline-none shadow-2xl",
          isFullscreen 
            ? "!top-0 !left-0 !h-dvh !w-screen !max-w-none !translate-x-0 !translate-y-0 rounded-none ring-0 !m-0"
            : "!w-[min(96vw,72rem)] !max-w-[min(96vw,72rem)] h-[85vh] rounded-2xl ring-1 ring-slate-200"
        )}
      >
        <DialogTitle className="sr-only">
          {initialData?.id ? 'Edit File' : 'Create New File'}
        </DialogTitle>
        {/* Editor Toolbar */}
        <div className="min-h-16 border-b border-slate-100 flex items-center justify-between px-3 sm:px-6 py-2 bg-slate-50/80 backdrop-blur-sm shrink-0 gap-2 flex-wrap">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0 w-full sm:w-auto">
            <div className={cn(
              "p-2.5 rounded-xl border border-slate-200/60 shadow-sm transition-all duration-300",
              uiConfig.bgColor
            )}>
              <EditorIcon className={cn("w-5 h-5", uiConfig.textColor)} />
            </div>
            <div className="flex flex-col gap-0.5 min-w-0">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="new-file.js"
                className="bg-transparent border-none shadow-none font-bold text-slate-900 focus-visible:ring-0 p-0 text-base sm:text-lg w-full sm:w-72 max-w-full placeholder:text-slate-300 transition-all"
                disabled={isLoading}
              />
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
                  {uiConfig.label}
                </span>
                {initialData?.id && (
                  <>
                    <span className="text-slate-300 text-[10px]">&bull;</span>
                    <span className="text-[10px] font-medium text-slate-400">ID: {initialData.id.slice(0, 8)}...</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 lg:gap-3 shrink-0 w-full sm:w-auto justify-end">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={copyToClipboard}
              disabled={!content}
              className="h-9 w-9 text-slate-500 hover:text-indigo-600 border-slate-200"
              title="Copy Content"
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="h-9 w-9 text-slate-500 hover:text-indigo-600 border-slate-200"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            {initialData?.id && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsHistoryOpen(true)}
                  className="h-9 w-9 text-slate-500 hover:text-indigo-600 border-slate-200"
                  title="File revision history"
                >
                  <History className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsCommentsOpen(v => !v)}
                  className={cn(
                    'h-9 w-9 border-slate-200 relative',
                    isCommentsOpen
                      ? 'text-indigo-600 bg-indigo-50 border-indigo-300'
                      : 'text-slate-500 hover:text-indigo-600'
                  )}
                  title="Comments"
                >
                  <MessageSquare className="w-4 h-4" />
                  {localCommentCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {localCommentCount > 9 ? '9+' : localCommentCount}
                    </span>
                  )}
                </Button>
              </>
            )}
            <div className="w-px h-5 bg-slate-200 mx-1 hidden sm:block" />
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => onOpenChange(false)} 
              disabled={isLoading}
              className="h-9 px-3 sm:px-4 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-xs"
            >
              Cancel
            </Button>
            <Button 
              onClick={() => handleSave()} 
              disabled={isLoading || !name || isDecrypting} 
              className="h-9 px-3 sm:px-4 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 font-semibold text-xs transition-all active:scale-95"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {initialData?.id ? "Update File" : "Create File"}
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => onOpenChange(false)}
              className="h-8 w-8 text-slate-400 hover:text-slate-600 -mr-2"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Editor Body + Comments Panel */}
        <div className="flex-1 relative bg-white overflow-hidden flex flex-row">
          {/* ── Main editor column ───────────────────────────────────────── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {isDecrypting ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10">
                <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin mb-4" />
                <p className="text-sm font-medium text-slate-500">Decrypting file content...</p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto bg-slate-50/10">
                <div className="min-h-full">
                  <div className="sticky top-0 z-10 grid grid-cols-[64px_1fr] bg-slate-100 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                    <div className="px-2 py-1.5 border-r border-slate-200 text-right">Line</div>
                    <div className="px-4 py-1.5">Content</div>
                  </div>

                  <div className="grid grid-cols-[64px_1fr]">
                    <div className="border-r border-slate-200 bg-slate-50 text-right text-[11px] text-slate-500 font-mono py-6 px-2 select-none">
                      {Array.from({ length: editorLineCount }, (_, idx) => (
                        <div key={`editor-line-${idx + 1}`} className="h-5 leading-5">
                          {idx + 1}
                        </div>
                      ))}
                    </div>

                    <Editor
                      value={content}
                      onValueChange={code => setContent(code)}
                      highlight={code => Prism.highlight(code, Prism.languages[getPrismLanguage(name)] || Prism.languages.clike, getPrismLanguage(name))}
                      padding={24}
                      style={{
                        fontFamily: '"JetBrains Mono", "Fira Code", "Source Code Pro", monospace',
                        fontSize: 13,
                        lineHeight: '20px',
                        minHeight: '100%',
                      }}
                      className="prism-editor"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Status Bar */}
            <div className="h-8 border-t border-slate-50 px-6 flex items-center justify-between text-[10px] uppercase tracking-widest font-bold text-slate-400 shrink-0">
              <div className="flex items-center gap-4">
                <span>Lines: {content.split('\n').length}</span>
                <span>Words: {content.split(/\s+/).filter(Boolean).length}</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                Secure Edit Session
              </div>
            </div>
          </div>

          {/* ── Comments panel ───────────────────────────────────────────── */}
          {isCommentsOpen && initialData?.id && (
            <div className="w-80 flex flex-col border-l border-slate-200 bg-white shrink-0">
              {/* Panel header */}
              <div className="h-10 flex items-center justify-between px-4 border-b border-slate-100 bg-slate-50/60 shrink-0">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
                  Comments
                  {localCommentCount > 0 && (
                    <span className="ml-1 bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{localCommentCount}</span>
                  )}
                </span>
                <button
                  onClick={() => setIsCommentsOpen(false)}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* "Send all as secret" toggle */}
              <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/40 shrink-0">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allSecret}
                    onChange={e => setAllSecret(e.target.checked)}
                    className="w-3 h-3 accent-indigo-600"
                  />
                  <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                    <Lock className={cn('w-2.5 h-2.5', allSecret ? 'text-indigo-500' : 'text-slate-400')} />
                    Send all messages as secret
                  </span>
                </label>
              </div>

              {/* Comments list */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
                {isLoadingComments ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-10">
                    <MessageSquare className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">No comments yet</p>
                    <p className="text-[10px] text-slate-300 mt-1">Add a note below</p>
                  </div>
                ) : (
                  comments.map(comment => {
                    const displayContent = comment.isEncrypted
                      ? (decryptedMap.get(comment.id) ?? '🔒 Decrypting...')
                      : comment.content;
                    return (
                      <div
                        key={comment.id}
                        className={cn(
                          'group rounded-xl p-3 border transition-colors',
                          comment.isEncrypted
                            ? 'bg-indigo-50/60 border-indigo-100 hover:border-indigo-200'
                            : 'bg-slate-50 border-slate-100 hover:border-indigo-100'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {comment.isEncrypted && (
                              <span className="inline-flex items-center gap-1 mb-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded text-[8px] font-bold uppercase tracking-wide">
                                <Lock className="w-2 h-2" /> Secret
                              </span>
                            )}
                            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{displayContent}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteComment(comment.id)}
                            className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 rounded text-slate-300 hover:text-rose-500 transition-all"
                            title="Delete comment"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-300 mt-1.5 font-medium">
                          {new Date(comment.createdAt).toLocaleString()}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add comment input + split button */}
              <div className="px-3 py-3 border-t border-slate-100 shrink-0">
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={commentInput}
                    onChange={e => setCommentInput(e.target.value)}
                    placeholder={allSecret ? 'Type a secret message...' : 'Add a comment...'}
                    rows={2}
                    className={cn(
                      'text-xs resize-none rounded-xl border-slate-200 transition-colors',
                      allSecret && 'border-indigo-200 bg-indigo-50/30 placeholder:text-indigo-300'
                    )}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment();
                    }}
                    disabled={isAddingComment}
                  />

                  {/* Split button */}
                  <div className="flex gap-0.5">
                    {/* Main action */}
                    <Button
                      size="sm"
                      onClick={() => handleAddComment()}
                      disabled={!commentInput.trim() || isAddingComment}
                      className={cn(
                        'flex-1 h-8 text-xs font-semibold rounded-r-none',
                        allSecret
                          ? 'bg-indigo-700 hover:bg-indigo-800'
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      )}
                    >
                      {isAddingComment
                        ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Adding...</>
                        : allSecret
                          ? <><Lock className="w-3 h-3 mr-1.5" /> Add Secret Comment</>
                          : <><Send className="w-3 h-3 mr-1.5" /> Add Comment</>}
                    </Button>

                    {/* Dropdown arrow — shows the opposite action */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <button
                            className={cn(
                              'h-8 w-8 flex items-center justify-center rounded-l-none rounded-r-xl border-l border-white/20 text-white transition-colors',
                              allSecret
                                ? 'bg-indigo-700 hover:bg-indigo-800'
                                : 'bg-indigo-600 hover:bg-indigo-700',
                              (!commentInput.trim() || isAddingComment) && 'opacity-50 cursor-not-allowed'
                            )}
                            disabled={!commentInput.trim() || isAddingComment}
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-48">
                        {allSecret ? (
                          <DropdownMenuItem onClick={() => handleAddComment(false)}>
                            <Send className="w-3.5 h-3.5 mr-2 text-slate-500" />
                            Add Comment (plain)
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleAddComment(true)}>
                            <Lock className="w-3.5 h-3.5 mr-2 text-indigo-500" />
                            Add Secret Comment
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>

      {initialData?.id && (
        <FileHistoryModal
          open={isHistoryOpen}
          onOpenChange={setIsHistoryOpen}
          fileId={initialData.id}
          fileName={name || initialData.name}
          environmentId={environmentId || ''}
          folderId={folderId}
        />
      )}

      {/* ── File name conflict dialog ────────────────────────────────────── */}
      <Dialog
        open={!!conflictDialog}
        onOpenChange={(open) => { if (!open) setConflictDialog(null); }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 font-bold text-base">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              File Name Already Exists
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600 leading-relaxed">
              A file named{' '}
              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 py-0.5 rounded text-xs">
                {conflictDialog?.originalName}
              </span>{' '}
              already exists in this folder.
              {!conflictDialog?.isChangingName && (
                <>
                  {' '}The system will save it as{' '}
                  <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded text-xs">
                    {conflictDialog?.suggestedName}
                  </span>
                  .
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Custom name input */}
          {conflictDialog?.isChangingName && (
            <div className="pt-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                Choose a new name
              </label>
              <Input
                value={conflictDialog.customName}
                onChange={(e) =>
                  setConflictDialog(prev =>
                    prev ? { ...prev, customName: e.target.value } : null
                  )
                }
                placeholder="Enter file name..."
                className="font-mono text-sm"
                onKeyDown={(e) => { if (e.key === 'Enter') handleConflictCustomSave(); }}
                autoFocus
              />
              <p className="text-[10px] text-slate-400 mt-1.5">
                Press Enter or click &ldquo;Save with this name&rdquo; to confirm.
              </p>
            </div>
          )}

          <DialogFooter className="pt-4 gap-2 flex-col sm:flex-row">
            {conflictDialog?.isChangingName ? (
              <>
                <Button
                  variant="ghost"
                  className="flex-1 border border-slate-200 rounded-xl text-sm"
                  onClick={() => setConflictDialog(prev => prev ? { ...prev, isChangingName: false } : null)}
                >
                  Back
                </Button>
                <Button
                  className="flex-1 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 font-semibold"
                  onClick={handleConflictCustomSave}
                  disabled={!conflictDialog?.customName.trim()}
                >
                  Save with this name
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="flex-1 border border-slate-200 rounded-xl text-sm"
                  onClick={() =>
                    setConflictDialog(prev =>
                      prev ? { ...prev, isChangingName: true } : null
                    )
                  }
                >
                  Change Name
                </Button>
                <Button
                  className="flex-1 rounded-xl text-sm bg-indigo-600 hover:bg-indigo-700 font-semibold"
                  onClick={handleConflictContinue}
                >
                  Continue as &ldquo;{conflictDialog?.suggestedName}&rdquo;
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function Separator({ orientation, className }: { orientation?: 'horizontal' | 'vertical'; className?: string }) {
  return <div className={cn("bg-slate-200", orientation === 'vertical' ? 'w-[1px]' : 'h-[1px]', className)} />;
}
