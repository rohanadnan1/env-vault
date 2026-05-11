"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Download, Upload, KeyRound, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { readPrivateSpaceKeyPair, savePrivateSpaceKeyPair, generatePrivateSpaceKeyPair, type PrivateSpaceKeyPairRecord } from '@/lib/crypto/private-space-client';

type Props = {
  userId: string;
};

export function KeypairManager({ userId }: Props) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [existingKeypair, setExistingKeypair] = useState<PrivateSpaceKeyPairRecord | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importedKeypair, setImportedKeypair] = useState<PrivateSpaceKeyPairRecord | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setExistingKeypair(readPrivateSpaceKeyPair(userId));
    setIsHydrated(true);
  }, [userId]);

  function handleExport() {
    if (!existingKeypair) {
      toast.error('No encryption keys found on this device');
      return;
    }
    const blob = new Blob([JSON.stringify(existingKeypair, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `envvault-space-keys-${userId.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Keys exported. Keep this file secure.');
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as PrivateSpaceKeyPairRecord;
        if (!parsed.publicKey || !parsed.privateKey || !parsed.algorithm) {
          throw new Error('Invalid key file format');
        }
        setImportedKeypair(parsed);
        setImportError(null);
      } catch {
        setImportError('Could not read the key file. Make sure it is a valid EnVault space keys export.');
        setImportedKeypair(null);
      }
    };
    reader.onerror = () => {
      setImportError('Could not read the file.');
    };
    reader.readAsText(file);
  }

  function handleImportConfirm() {
    if (!importedKeypair) return;
    savePrivateSpaceKeyPair(userId, importedKeypair);
    toast.success('Encryption keys imported. You can now access your private spaces.');
    setShowImport(false);
    setImportedKeypair(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    window.location.reload();
  }

  async function handleRegenerate() {
    try {
      const newPair = await generatePrivateSpaceKeyPair();
      savePrivateSpaceKeyPair(userId, newPair);
      setExistingKeypair(newPair);
      toast.success('New keys generated. You may need to be re-invited to private spaces.');
      window.location.reload();
    } catch {
      toast.error('Could not generate new keys');
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {!isHydrated ? (
          <Button variant="ghost" size="sm" className="text-[10px] text-slate-400" disabled>
            <KeyRound className="w-3 h-3 mr-1" /> Keys
          </Button>
        ) : existingKeypair ? (
          <Button variant="ghost" size="sm" className="text-[10px] text-slate-400 hover:text-indigo-600" onClick={() => setShowExport(true)}>
            <Download className="w-3 h-3 mr-1" /> Export keys
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="text-[10px] text-amber-600 hover:text-amber-700" onClick={() => setShowImport(true)}>
            <Upload className="w-3 h-3 mr-1" /> Import keys
          </Button>
        )}
      </div>

      <Dialog open={showExport} onOpenChange={setShowExport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              Export Encryption Keys
            </DialogTitle>
            <DialogDescription>
              Download your private space encryption keys as a file. You can import this file on another device to access your spaces from there.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Keep this file secure</p>
              <p className="text-xs text-amber-700 mt-0.5">Anyone with this file can decrypt your private spaces. Store it like a password.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExport(false)}>Cancel</Button>
            <Button onClick={handleExport} className="bg-indigo-600 hover:bg-indigo-700">
              <Download className="w-4 h-4 mr-2" /> Download Key File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-600" />
              Import Encryption Keys
            </DialogTitle>
            <DialogDescription>
              Upload a previously exported key file to access your private spaces on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {importError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {importError}
              </div>
            )}
            {importedKeypair && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                Valid key file detected. Ready to import.
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto text-xs" onClick={handleRegenerate}>
              Generate new keys instead
            </Button>
            <Button onClick={handleImportConfirm} disabled={!importedKeypair} className="bg-indigo-600 hover:bg-indigo-700">
              Import Keys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
