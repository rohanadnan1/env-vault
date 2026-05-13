"use client";

import { useState, useEffect, useCallback } from "react";
import {
  KeyRound,
  ShieldAlert,
  Copy,
  Download,
  RefreshCw,
  CheckCircle2,
  Clock,
  Loader2,
  Eye,
  EyeOff,
  AlertTriangle,
  FileKey,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useVaultStore } from "@/lib/store/vaultStore";
import { cn } from "@/lib/utils";
import { updateVaultUnlockAlternativeCache } from "@/lib/vault-unlock-options-cache";
import {
  generateRecoveryCode,
  encryptMasterWithCode,
} from "@/lib/crypto/recovery";
import { encryptSecret } from "@/lib/crypto/encrypt";

interface CodesStatus {
  hasCodesGenerated: boolean;
  generatedAt: string | null;
  nextAllowedAt: string | null;
  canRegenerate: boolean;
  total: number;
  used: number;
  remaining: number;
}

interface RecoveryCodesSectionProps {
  onStatusChange?: (hasRecoveryCodes: boolean) => void;
}

export function RecoveryCodesSection({ onStatusChange }: RecoveryCodesSectionProps) {
  const { data: session } = useSession();
  const derivedKey = useVaultStore(s => s.derivedKey);

  const [codesStatus, setCodesStatus] = useState<CodesStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [showMasterPasswordDialog, setShowMasterPasswordDialog] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [showCodesDialog, setShowCodesDialog] = useState(false);
  const [showRegenDialog, setShowRegenDialog] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showSaveToVaultPrompt, setShowSaveToVaultPrompt] = useState(false);
  const [isSavingCodes, setIsSavingCodes] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/recovery-codes/status");
      if (res.ok) setCodesStatus(await res.json());
    } catch { /* skip */ } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (codesStatus) {
      onStatusChange?.(codesStatus.total > 0);
      updateVaultUnlockAlternativeCache(session?.user?.id || 'user', { hasRecoveryCodes: codesStatus.remaining > 0 });
    }
  }, [codesStatus, onStatusChange]);

  const handleGenerate = async () => {
    if (!masterPassword.trim()) { toast.error("Enter your master password"); return; }
    setIsGenerating(true);
    try {
      const codes = Array.from({ length: 30 }, () => generateRecoveryCode());
      const encrypted = await Promise.all(
        codes.map(async (code, index) => {
          const { codeHash, encryptedMaster, masterIv, codeSalt } = await encryptMasterWithCode(masterPassword, code);
          return { index, codeHash, encryptedMaster, masterIv, codeSalt };
        })
      );
      const res = await fetch("/api/recovery-codes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: encrypted }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Could not generate codes");
      }
      setGeneratedCodes(codes);
      setShowMasterPasswordDialog(false);
      setShowRegenDialog(false);
      setMasterPassword("");
      setShowCodesDialog(true);
      fetchStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not generate codes");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveCodesToVault = async () => {
    if (!derivedKey) { toast.error("Unlock vault first"); return; }
    setIsSavingCodes(true);
    try {
      const encryptedCodes = await Promise.all(
        generatedCodes.map(async (code, idx) => {
          const encrypted = await encryptSecret(code, derivedKey);
          return { codeOrder: idx + 1, codeEncrypted: encrypted.valueEncrypted, iv: encrypted.iv };
        })
      );
      const res = await fetch("/api/vault/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: encryptedCodes }),
      });
      if (!res.ok) throw new Error("Could not save");
      toast.success(`${encryptedCodes.length} recovery codes saved to vault`);
      setShowSaveToVaultPrompt(false);
      setGeneratedCodes([]);
      setShowCodesDialog(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save codes");
    } finally {
      setIsSavingCodes(false);
    }
  };

  const handleCloseCodesDialog = () => {
    setShowCodesDialog(false);
    setShowSaveToVaultPrompt(true);
  };

  const copyCode = async (code: string, idx: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
    toast.success("Recovery code copied");
  };

  const downloadCodes = () => {
    const content = generatedCodes.map((c, i) => `${i + 1}. ${c}  [slot ${i + 1}]`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "envvault-recovery-codes.txt";
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success("Codes downloaded");
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-600" />
            Recovery Codes
          </CardTitle>
          <CardDescription>
            Generate one-time recovery codes to regain access if you lose your master password or 2FA device.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!codesStatus?.hasCodesGenerated ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No recovery codes generated</p>
                <p className="text-xs text-amber-600 mt-1">
                  Generate recovery codes now to protect your account. Each code can be used once to unlock your vault if you forget your master password.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{codesStatus.total}</p>
                <p className="text-xs text-slate-500">Total</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center">
                <p className="text-2xl font-bold text-emerald-600">{codesStatus.remaining}</p>
                <p className="text-xs text-emerald-600">Remaining</p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-center">
                <p className="text-2xl font-bold text-rose-600">{codesStatus.used}</p>
                <p className="text-xs text-rose-600">Used</p>
              </div>
            </div>
          )}

          {codesStatus?.canRegenerate && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              Regeneration locked until {new Date(codesStatus.nextAllowedAt!).toLocaleDateString()}
            </div>
          )}
        </CardContent>
        <CardFooter>
          {!codesStatus?.hasCodesGenerated ? (
            <Button onClick={() => setShowMasterPasswordDialog(true)} disabled={isGenerating} className="w-full">
              <KeyRound className="w-4 h-4 mr-2" />
              Generate Recovery Codes
            </Button>
          ) : (
            <Button onClick={() => { setShowRegenDialog(true); setMasterPassword(""); }} disabled={!codesStatus.canRegenerate || isGenerating} variant="outline" className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate Codes
            </Button>
          )}
        </CardFooter>
      </Card>

      <Dialog open={showMasterPasswordDialog} onOpenChange={setShowMasterPasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enter Master Password</DialogTitle>
            <DialogDescription>
              Your master password is needed to encrypt the recovery codes. It will not be stored or sent anywhere.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Master Password</Label>
            <PasswordInput value={masterPassword} onChange={e => setMasterPassword(e.target.value)}
              placeholder="Enter your master password" autoFocus
              onKeyDown={e => { if (e.key === "Enter") handleGenerate(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMasterPasswordDialog(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={isGenerating || !masterPassword.trim()}>
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRegenDialog} onOpenChange={setShowRegenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Regenerate Recovery Codes</DialogTitle>
            <DialogDescription>
              This will invalidate all existing recovery codes and create 30 new ones. Enter your master password to continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Master Password</Label>
            <PasswordInput value={masterPassword} onChange={e => setMasterPassword(e.target.value)}
              placeholder="Enter your master password" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenDialog(false)}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={isGenerating || !masterPassword.trim()}>
              {isGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCodesDialog} onOpenChange={(open) => { setShowCodesDialog(open); if (!open) setGeneratedCodes([]); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="w-5 h-5" />
              Your Recovery Codes
            </DialogTitle>
            <DialogDescription>
              These codes are shown only once. Download or copy them now before closing this dialog.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {generatedCodes.map((code, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="text-xs text-slate-700 font-mono tracking-widest">{code}</span>
                  <button onClick={() => copyCode(code, i)} className="text-slate-400 hover:text-indigo-600 transition-colors">
                    {copiedIndex === i ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={downloadCodes} className="rounded-xl gap-2 font-bold">
              <Download className="w-4 h-4" /> Download as .txt
            </Button>
            <Button onClick={handleCloseCodesDialog} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold gap-2">
              <CheckCircle2 className="w-4 h-4" /> I've saved my codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSaveToVaultPrompt} onOpenChange={(open) => { setShowSaveToVaultPrompt(open); if (!open) setGeneratedCodes([]); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-indigo-600">
              <FileKey className="w-5 h-5" />
              Save Codes to Vault
            </DialogTitle>
            <DialogDescription>
              Would you like to save your recovery codes in the Keys &amp; Codes vault? They will be encrypted with your master key and accessible from the vault later.
            </DialogDescription>
          </DialogHeader>
          {!derivedKey && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              Unlock your vault first to save recovery codes.
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setShowSaveToVaultPrompt(false); setGeneratedCodes([]); }}>
              No, Thanks
            </Button>
            <Button onClick={handleSaveCodesToVault} disabled={isSavingCodes || !derivedKey} className="bg-indigo-600 hover:bg-indigo-700">
              {isSavingCodes ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileKey className="w-4 h-4 mr-2" />}
              Save to Vault
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
