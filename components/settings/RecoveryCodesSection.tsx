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
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { cn } from "@/lib/utils";
import {
  generateRecoveryCode,
  encryptMasterWithCode,
} from "@/lib/crypto/recovery";

interface CodesStatus {
  hasCodesGenerated: boolean;
  generatedAt: string | null;
  nextAllowedAt: string | null;
  canRegenerate: boolean;
  total: number;
  used: number;
  remaining: number;
}

export function RecoveryCodesSection() {
  const [status, setStatus] = useState<CodesStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [masterPassword, setMasterPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [showCodesDialog, setShowCodesDialog] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/recovery-codes/status");
      if (res.ok) setStatus(await res.json());
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleGenerate = async () => {
    if (!masterPassword) return;
    setIsGenerating(true);

    try {
      const codes = Array.from({ length: 30 }, generateRecoveryCode);

      const encrypted = await Promise.all(
        codes.map((code, index) =>
          encryptMasterWithCode(code, masterPassword).then((e) => ({ ...e, index }))
        )
      );

      const res = await fetch("/api/recovery-codes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codes: encrypted }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 429 && data.nextAllowedAt) {
          const date = new Date(data.nextAllowedAt);
          toast.error(`You can generate new codes after ${date.toLocaleDateString()}`);
        } else {
          toast.error(data.error ?? "Failed to generate codes");
        }
        return;
      }

      setGeneratedCodes(codes);
      setShowDialog(false);
      setMasterPassword("");
      setShowCodesDialog(true);
      fetchStatus();
    } catch (err: any) {
      toast.error("Encryption failed. Check your master password.");
    } finally {
      setIsGenerating(false);
    }
  };

  const copyCode = async (code: string, index: number) => {
    await navigator.clipboard.writeText(code);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const downloadCodes = () => {
    const userEmail = "your account";
    const date = new Date().toLocaleDateString();
    const header = [
      "EnVault Recovery Codes",
      `Generated: ${date}`,
      "",
      "Each code can be used only once to unlock your vault or verify identity.",
      "Store these codes in a safe place — they cannot be shown again.",
      "",
      "═══════════════════════════════════════",
      "",
    ].join("\n");
    const body = generatedCodes.map((c, i) => `${String(i + 1).padStart(2, " ")}. ${c}`).join("\n");
    const blob = new Blob([header + body], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "envault-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Recovery codes downloaded");
  };

  if (isLoading) {
    return (
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        </CardContent>
      </Card>
    );
  }

  const nextDate = status?.nextAllowedAt ? new Date(status.nextAllowedAt) : null;

  return (
    <>
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Recovery Codes
              {status?.hasCodesGenerated && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] uppercase tracking-wider font-bold",
                    status.remaining === 0
                      ? "border-rose-200 text-rose-600 bg-rose-50"
                      : status.remaining <= 5
                      ? "border-amber-200 text-amber-600 bg-amber-50"
                      : "border-emerald-200 text-emerald-600 bg-emerald-50"
                  )}
                >
                  {status.remaining} remaining
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              30 single-use backup codes to unlock your vault or verify your identity.
            </CardDescription>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
            <ShieldAlert className="w-5 h-5 text-indigo-600" />
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {!status?.hasCodesGenerated ? (
            <div className="flex items-start gap-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium">
                You haven't generated recovery codes yet. Generate them now to ensure you can regain access to your vault if you lose your master password.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-4 text-center border border-slate-100">
                <div className="text-2xl font-bold text-slate-900">{status.total}</div>
                <div className="text-xs text-slate-500 mt-1">Total</div>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
                <div className="text-2xl font-bold text-emerald-700">{status.remaining}</div>
                <div className="text-xs text-emerald-600 mt-1">Remaining</div>
              </div>
              <div className="bg-rose-50 rounded-xl p-4 text-center border border-rose-100">
                <div className="text-2xl font-bold text-rose-700">{status.used}</div>
                <div className="text-xs text-rose-600 mt-1">Used</div>
              </div>
            </div>
          )}

          {status?.generatedAt && (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>
                Generated {new Date(status.generatedAt).toLocaleDateString()}
                {!status.canRegenerate && nextDate && (
                  <> · Next generation available {nextDate.toLocaleDateString()}</>
                )}
              </span>
            </div>
          )}

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-1">
            <p className="font-semibold text-slate-700">How recovery codes work:</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500">
              <li>Each code can be used only once</li>
              <li>Use a code to unlock your vault or create a new master key</li>
              <li>Generating new codes immediately invalidates all previous ones</li>
              <li>You can generate a new set at most once per week</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
          <Button
            onClick={() => {
              setMasterPassword("");
              setShowDialog(true);
            }}
            disabled={!status?.canRegenerate && status?.hasCodesGenerated}
            variant={status?.hasCodesGenerated ? "outline" : "default"}
            className={cn(
              "rounded-xl font-bold gap-2",
              !status?.hasCodesGenerated && "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md px-8"
            )}
          >
            <RefreshCw className="w-4 h-4" />
            {status?.hasCodesGenerated ? "Regenerate Codes" : "Generate Recovery Codes"}
          </Button>
        </CardFooter>
      </Card>

      {/* Generate confirmation dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-600" />
              {status?.hasCodesGenerated ? "Regenerate Recovery Codes" : "Generate Recovery Codes"}
            </DialogTitle>
            <DialogDescription>
              {status?.hasCodesGenerated
                ? "This will immediately invalidate all existing recovery codes. Enter your master password to continue."
                : "Enter your master password to encrypt your recovery codes. They will only be shown once."}
            </DialogDescription>
          </DialogHeader>

          {status?.hasCodesGenerated && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 font-medium">
                All {status.total} existing codes will be permanently invalidated.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="gen-master-pw">Master Password</Label>
            <div className="relative">
              <Input
                id="gen-master-pw"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••••"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isGenerating && masterPassword && handleGenerate()}
                className="rounded-xl pr-10"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={!masterPassword || isGenerating}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate 30 Codes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show codes dialog */}
      <Dialog
        open={showCodesDialog}
        onOpenChange={(open) => {
          if (!open) {
            toast.warning("Make sure you've saved your recovery codes!");
          }
          setShowCodesDialog(open);
          setGeneratedCodes([]);
        }}
      >
        <DialogContent className="rounded-2xl max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              Your Recovery Codes
            </DialogTitle>
            <DialogDescription>
              Save these codes in a safe place. Each code can only be used once and they will not be shown again.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-semibold">
              These codes are shown only once. Download or copy them now before closing this dialog.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {generatedCodes.map((code, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-mono text-sm"
              >
                <span className="text-slate-700 tracking-widest">{code}</span>
                <button
                  onClick={() => copyCode(code, i)}
                  className="ml-2 text-slate-400 hover:text-indigo-600 transition-colors"
                >
                  {copiedIndex === i ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={downloadCodes}
              className="rounded-xl gap-2 font-bold"
            >
              <Download className="w-4 h-4" />
              Download as .txt
            </Button>
            <Button
              onClick={() => {
                setShowCodesDialog(false);
                setGeneratedCodes([]);
              }}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              I've saved my codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
