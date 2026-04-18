"use client";

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';
import { toast } from 'sonner';
import { FileText, Save, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  
  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  const handleDecrypt = useCallback(async (encrypted: string, iv: string) => {
    if (!derivedKey) return;
    setIsDecrypting(true);
    try {
      const aad = `${initialData?.name || name}:${folderId}`;
      const decrypted = await decryptSecret(encrypted, iv, derivedKey, aad);
      setContent(decrypted);
    } catch (err) {
      console.error(err);
      toast.error('Failed to decrypt file content');
    } finally {
      setIsDecrypting(false);
    }
  }, [derivedKey, folderId, initialData?.name, name]);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setName(initialData.name);
        handleDecrypt(initialData.contentEncrypted, initialData.iv);
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
      const aad = `${name}:${folderId}`;
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
          mimeType: 'text/plain',
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "transition-all duration-300 flex flex-col p-0 gap-0 overflow-hidden border-none",
        isFullscreen ? "max-w-none w-screen h-screen rounded-none" : "sm:max-w-[800px] h-[80vh] rounded-xl"
      )}>
        {/* Editor Toolbar */}
        <div className="h-14 border-b border-slate-100 flex items-center justify-between px-6 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3 flex-1">
            <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
              <FileText className="w-4 h-4 text-indigo-500" />
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="filename.txt"
              className="bg-transparent border-none shadow-none font-bold text-slate-900 focus-visible:ring-0 p-0 text-base w-64"
              disabled={isLoading}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="text-slate-400 hover:text-slate-600"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Separator orientation="vertical" className="h-4 mx-2" />
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isLoading || !name || isDecrypting} className="bg-indigo-600 hover:bg-indigo-700">
              <Save className="w-4 h-4 mr-2" />
              {isLoading ? "Saving..." : "Save File"}
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
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste or type encrypted file content here..."
              className="flex-1 resize-none border-none shadow-none font-mono text-sm p-8 focus-visible:ring-0 leading-relaxed bg-slate-50/20"
              disabled={isLoading}
            />
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
