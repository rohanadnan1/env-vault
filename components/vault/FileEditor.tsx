"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { encryptSecret } from '@/lib/crypto/encrypt';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';
import { FileText, Save, Maximize2, Minimize2, FileCode2, FileJson, FileImage, ShieldAlert, BookText, Code2, Database, X, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

// Syntax Highlighting
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
  folderId: string;
  environmentId?: string;
  onSuccess: () => void;
  initialData?: {
    id: string;
    name: string;
    contentEncrypted: string;
    iv: string;
    mimeType: string;
  };
}

export function FileEditor({
  open,
  onOpenChange,
  folderId,
  environmentId,
  onSuccess,
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
  
  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

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
  }, [derivedKey, folderId]);

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

  const handleSave = async () => {
    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    setIsLoading(true);
    touchActivity();

    try {
      const parentScopeId = environmentId || folderId;
      const aad = `${name}:${parentScopeId}`;
      const { valueEncrypted, iv } = await encryptSecret(content, derivedKey, aad);

      const url = initialData?.id ? `/api/vault-files/${initialData.id}` : '/api/vault-files';
      const method = initialData?.id ? 'PATCH' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contentEncrypted: valueEncrypted,
          iv,
          folderId,
          environmentId,
          mimeType: getMimeType(name),
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

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
    toast.success('Content copied to clipboard');
  };

  const uiConfig = getFileTypeConfig(name);
  const EditorIcon = uiConfig.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        showCloseButton={false}
        className={cn(
          "transition-all duration-500 ease-in-out flex flex-col p-0 gap-0 overflow-hidden border-none focus:outline-none shadow-2xl",
          isFullscreen 
            ? "max-w-none w-screen h-screen rounded-none ring-0 m-0" 
            : "sm:max-w-4xl h-[85vh] rounded-2xl ring-1 ring-slate-200"
        )}
      >
        <DialogTitle className="sr-only">
          {initialData?.id ? 'Edit File' : 'Create New File'}
        </DialogTitle>
        {/* Editor Toolbar */}
        <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-slate-50/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <div className={cn(
              "p-2.5 rounded-xl border border-slate-200/60 shadow-sm transition-all duration-300",
              uiConfig.bgColor
            )}>
              <EditorIcon className={cn("w-5 h-5", uiConfig.textColor)} />
            </div>
            <div className="flex flex-col gap-0.5">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="new-file.js"
                className="bg-transparent border-none shadow-none font-bold text-slate-900 focus-visible:ring-0 p-0 text-lg w-72 placeholder:text-slate-300 transition-all"
                disabled={isLoading}
              />
              <div className="flex items-center gap-2">
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

          <div className="flex items-center gap-2 lg:gap-3">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={copyToClipboard}
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
            <div className="w-px h-5 bg-slate-200 mx-1 hidden sm:block" />
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => onOpenChange(false)} 
              disabled={isLoading}
              className="h-9 px-4 text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 font-semibold text-xs"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isLoading || !name || isDecrypting} 
              className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 font-semibold text-xs transition-all active:scale-95"
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

        {/* Editor Body */}
        <div className="flex-1 relative bg-white overflow-hidden flex flex-col">
          {isDecrypting ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10">
              <div className="w-8 h-8 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin mb-4" />
              <p className="text-sm font-medium text-slate-500">Decrypting file content...</p>
            </div>
          ) : (
            <div className="flex-1 overflow-auto bg-slate-50/10">
              <Editor
                value={content}
                onValueChange={code => setContent(code)}
                highlight={code => Prism.highlight(code, Prism.languages[getPrismLanguage(name)] || Prism.languages.clike, getPrismLanguage(name))}
                padding={24}
                style={{
                  fontFamily: '"JetBrains Mono", "Fira Code", "Source Code Pro", monospace',
                  fontSize: 13,
                  minHeight: '100%',
                }}
                className="prism-editor"
              />
            </div>
          )}

          {/* Editor Status Bar */}
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
      </DialogContent>
    </Dialog>
  );
}

function Separator({ orientation, className }: { orientation?: 'horizontal' | 'vertical'; className?: string }) {
  return <div className={cn("bg-slate-200", orientation === 'vertical' ? 'w-[1px]' : 'h-[1px]', className)} />;
}
