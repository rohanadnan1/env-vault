"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { useVaultStore } from '@/lib/store/vaultStore';
import { encryptSecret } from '@/lib/crypto/encrypt';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyRound, ShieldCheck, Download, Clock, CheckCircle2, XCircle, Trash2,
  Eye, EyeOff, Copy, Plus, RefreshCw, AlertTriangle, FileKey, ShieldAlert, Upload, Loader2, FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StoredKey {
  id: string;
  spaceId?: string;
  spaceName: string;
  keyType: string;
  publicKey: string;
  privateKey?: string;
  algorithm: string;
  createdAt: string;
}

interface StoredCode {
  id: string;
  codeOrder: number;
  isUsed: boolean;
  usedAt: string | null;
  createdAt: string;
}

export default function KeysAndCodesPage() {
  const derivedKey = useVaultStore(s => s.derivedKey);
  const touchActivity = useVaultStore(s => s.touchActivity);

  const [keys, setKeys] = useState<StoredKey[]>([]);
  const [codes, setCodes] = useState<StoredCode[]>([]);
  const [codeStats, setCodeStats] = useState({ total: 0, unused: 0, used: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const [decryptedKeys, setDecryptedKeys] = useState<Record<string, string>>({});
  const [revealedCodes, setRevealedCodes] = useState<Record<string, string>>({});
  const [downloadCount, setDownloadCount] = useState(1);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResults, setImportResults] = useState<{ total: number; valid: number; used: number; invalid: number } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [keysRes, codesRes] = await Promise.all([
        fetch('/api/vault/keys'),
        fetch('/api/vault/recovery-codes'),
      ]);
      if (keysRes.ok) setKeys((await keysRes.json()) as StoredKey[]);
      if (codesRes.ok) {
        const data = await codesRes.json();
        setCodes(data.codes || []);
        setCodeStats({ total: data.total || 0, unused: data.unused || 0, used: data.used || 0 });
      }
    } catch { /* skip */ } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function decryptKey(keyId: string) {
    if (!derivedKey) { toast.error('Unlock vault first'); return; }
    const key = keys.find(k => k.id === keyId);
    if (!key?.privateKey) { toast.error('No private key stored'); return; }
    try {
      const plaintext = await decryptSecret(key.privateKey, '0'.repeat(24), derivedKey, keyId);
      setDecryptedKeys(prev => ({ ...prev, [keyId]: plaintext }));
      touchActivity();
    } catch {
      toast.error('Could not decrypt private key');
    }
  }

  async function revealCode(codeId: string) {
    if (!derivedKey) { toast.error('Unlock vault first'); return; }
    try {
      const res = await fetch(`/api/vault/recovery-codes/${codeId}`);
      if (!res.ok) throw new Error('Not found');
      const code = await res.json();
      const plaintext = await decryptSecret(code.codeEncrypted, code.iv, derivedKey);
      setRevealedCodes(prev => ({ ...prev, [codeId]: plaintext }));
      touchActivity();
    } catch {
      toast.error('Could not decrypt recovery code');
    }
  }

  async function saveCurrentKeys() {
    if (!derivedKey) { toast.error('Unlock vault first'); return; }
    try {
      const record = JSON.parse(localStorage.getItem(`envvault:private-space-keypair:${''}`) || 'null');
      if (!record) { toast.error('No local keys found'); return; }

      const encryptedPrivate = await encryptSecret(record.privateKey, derivedKey);

      const res = await fetch('/api/vault/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: record.publicKey,
          privateKey: encryptedPrivate.valueEncrypted,
          algorithm: record.algorithm,
          keyType: 'PRIVATE_SPACE',
        }),
      });
      if (!res.ok) throw new Error('Could not save');
      toast.success('Keys saved to vault');
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save keys');
    }
  }

  function downloadCodes() {
    const unused = codes.filter(c => !c.isUsed).slice(0, downloadCount);
    if (unused.length === 0) { toast.error('No unused codes available'); return; }
    const content = unused.map((c, i) => `${i + 1}. Recovery Code #${c.codeOrder}`).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'envvault-recovery-codes.txt';
    a.click(); URL.revokeObjectURL(url);
    toast.success(`Downloaded ${unused.length} code placeholder${unused.length > 1 ? 's' : ''}`);
    setShowDownloadDialog(false);
  }

  async function handleImportCodes() {
    if (!derivedKey) { toast.error('Unlock vault first'); return; }
    if (!importText.trim()) { toast.error('Paste your recovery codes first'); return; }
    setIsImporting(true);
    try {
      const lines = importText.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
      const codes = lines
        .map(l => l.replace(/^\d+[.)]\s*/, '').replace(/\[slot\s*\d+\]/i, '').trim())
        .filter(c => /^[0-9a-f]{8}-?[0-9a-f]{8}$/i.test(c));

      const res = await fetch('/api/vault/recovery-codes/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes }),
      });
      if (!res.ok) throw new Error('Validation failed');
      const { validCodes, results } = await res.json();
      setImportResults(results);

      if (validCodes.length > 0) {
        const encryptedCodes = await Promise.all(
          validCodes.map(async (code: string, idx: number) => {
            const encrypted = await encryptSecret(code, derivedKey);
            return { codeOrder: idx + 1, codeEncrypted: encrypted.valueEncrypted, iv: encrypted.iv };
          })
        );
        const saveRes = await fetch('/api/vault/recovery-codes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codes: encryptedCodes }),
        });
        if (saveRes.ok) {
          toast.success(`${validCodes.length} unused codes saved to vault`);
          fetchData();
        }
      } else {
        toast.info('No valid unused codes to save');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not import codes');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FileKey className="w-6 h-6 text-indigo-600" />
          Keys {'&'} Codes
        </h1>
        <p className="text-slate-500 mt-1 text-sm">Manage your recovery codes and encryption keys stored in the vault.</p>
      </div>

      <Tabs defaultValue="recovery">
        <TabsList className="rounded-xl border border-slate-200 bg-white p-1">
          <TabsTrigger value="recovery" className="px-4">Recovery Codes</TabsTrigger>
          <TabsTrigger value="keys" className="px-4">Encryption Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="recovery" className="space-y-4 mt-4">
          {!derivedKey && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center gap-3 text-sm text-amber-800">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              Unlock your vault to view and manage recovery codes.
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-slate-900">{codeStats.total}</p>
                <p className="text-xs text-slate-500 mt-1">Total Codes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-emerald-600">{codeStats.unused}</p>
                <p className="text-xs text-slate-500 mt-1">Available</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-rose-600">{codeStats.used}</p>
                <p className="text-xs text-slate-500 mt-1">Used</p>
              </CardContent>
            </Card>
          </div>

          {codes.length > 0 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDownloadDialog(true)}>
                <Download className="w-3.5 h-3.5 mr-1" /> Download Codes
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setShowImportDialog(true); setImportText(''); setImportResults(null); }}>
                <Upload className="w-3.5 h-3.5 mr-1" /> Import Codes
              </Button>
              <span className="text-xs text-slate-400">{codeStats.unused} available</span>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recovery Code History</CardTitle>
              <CardDescription>Track which codes have been used and when.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {codes.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  {isLoading ? 'Loading...' : (
                    <>No recovery codes stored yet. <button className="text-indigo-600 hover:underline" onClick={() => { setShowImportDialog(true); setImportText(''); setImportResults(null); }}>Import codes</button> or generate them from Settings.</>
                  )}
                </p>
              ) : (
                codes.map(code => (
                  <div key={code.id} className={cn(
                    'flex items-center justify-between rounded-lg border p-3',
                    code.isUsed ? 'border-rose-200 bg-rose-50/50' : 'border-slate-200'
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                        code.isUsed ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
                      )}>
                        {code.codeOrder}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-700">Code #{code.codeOrder}</p>
                        {code.isUsed ? (
                          <p className="text-xs text-rose-500 flex items-center gap-1">
                            <XCircle className="w-3 h-3" /> Used {code.usedAt ? new Date(code.usedAt).toLocaleDateString() : ''}
                          </p>
                        ) : (
                          <p className="text-xs text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Available
                          </p>
                        )}
                      </div>
                    </div>
                    {derivedKey && !code.isUsed && (
                      <Button variant="ghost" size="sm" className="text-xs"
                        onClick={() => revealCode(code.id)}>
                        {revealedCodes[code.id] ? (
                          <span className="font-mono">{revealedCodes[code.id]}</span>
                        ) : (
                          <><Eye className="w-3 h-3 mr-1" /> Reveal</>
                        )}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keys" className="space-y-4 mt-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveCurrentKeys} disabled={!derivedKey}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Save Current Keys
            </Button>
            <span className="text-xs text-slate-400">Store your private space keys in the vault</span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stored Encryption Keys</CardTitle>
              <CardDescription>Your private space keys are encrypted with your master key.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {keys.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  No keys stored yet. Click "Save Current Keys" to store your private space keypair.
                </p>
              ) : (
                keys.map(key => (
                  <div key={key.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {key.spaceName || 'Private Space Key'} <Badge className="text-[9px] ml-1">{key.keyType}</Badge>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{key.algorithm} · {new Date(key.createdAt).toLocaleDateString()}</p>
                      </div>
                      {key.privateKey && derivedKey && (
                        <Button variant="ghost" size="sm" className="text-xs"
                          onClick={() => {
                            if (decryptedKeys[key.id]) {
                              navigator.clipboard.writeText(decryptedKeys[key.id]);
                              toast.success('Private key copied');
                            } else {
                              decryptKey(key.id);
                            }
                          }}>
                          {decryptedKeys[key.id] ? (
                            <><Copy className="w-3 h-3 mr-1" /> Copied</>
                          ) : (
                            <><KeyRound className="w-3 h-3 mr-1" /> Decrypt</>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showImportDialog} onOpenChange={(open) => { setShowImportDialog(open); if (!open) { setImportText(''); setImportResults(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-indigo-600" />
              Import Recovery Codes
            </DialogTitle>
            <DialogDescription>
              Paste your recovery codes below. The system will detect which codes are already used and only save valid unused codes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-xl border-2 border-indigo-100 bg-indigo-50/50 p-6 border-dashed relative hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer group">
              <input
                type="file"
                accept=".txt"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const text = await file.text();
                    setImportText(text);
                  }
                  e.target.value = ''; // Reset so the same file can be selected again
                }}
              />
              <div className="flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                  <FileText className="w-6 h-6 text-indigo-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-indigo-900">Upload Recovery Codes File</p>
                  <p className="text-xs text-indigo-600/70 mt-1">Click or drag and drop your .txt file here</p>
                </div>
              </div>
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase font-semibold tracking-wider">
                <span className="bg-white px-3 text-slate-400">Or paste manually</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700">Recovery codes</Label>
              <textarea
                className="w-full min-h-[140px] rounded-xl border border-slate-200 p-3 font-mono text-sm resize-y focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-300"
                placeholder={`a1b2c3d4-e5f6a7b8\nf9e8d7c6-b5a49382\n...`}
                value={importText}
                onChange={e => setImportText(e.target.value)}
              />
              <p className="text-[11px] text-slate-500">
                You can paste codes with or without numbers, one per line. Duplicates are handled automatically.
              </p>
            </div>
            {importResults && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-3 gap-3 text-center text-xs"
              >
                <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                  <p className="text-lg font-bold text-slate-700">{importResults.total}</p>
                  <p className="text-slate-500 font-medium">Total Found</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="text-lg font-bold text-emerald-600">{importResults.valid}</p>
                  <p className="text-emerald-700 font-medium">Valid</p>
                </div>
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <p className="text-lg font-bold text-rose-600">{importResults.used + importResults.invalid}</p>
                  <p className="text-rose-700 font-medium">Used/Invalid</p>
                </div>
              </motion.div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>Cancel</Button>
            <Button onClick={handleImportCodes} disabled={isImporting || !importText.trim() || !derivedKey} className="bg-indigo-600 hover:bg-indigo-700">
              {isImporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Import and Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download Recovery Codes</DialogTitle>
            <DialogDescription>
              You have {codeStats.unused} unused code{codeStats.unused !== 1 ? 's' : ''}. How many would you like to download?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Number of codes</Label>
            <Input type="number" min={1} max={codeStats.unused}
              value={downloadCount}
              onChange={e => setDownloadCount(Math.max(1, Math.min(codeStats.unused, parseInt(e.target.value) || 1)))} />
            <p className="text-xs text-slate-400">
              Codes are downloaded as numbered placeholders. Reveal each code in the vault before downloading to get the actual values.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>Cancel</Button>
            <Button onClick={downloadCodes} disabled={codeStats.unused === 0}>
              <Download className="w-4 h-4 mr-2" /> Download {downloadCount} code{downloadCount > 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
