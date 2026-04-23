"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Smartphone,
  ShieldCheck,
  Loader2,
  Eye,
  EyeOff,
  AlertCircle,
  KeyRound,
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
import { generateUnlockToken, encryptMasterWith2FA } from "@/lib/crypto/recovery";

interface Props {
  is2FAEnabled: boolean;
}

export function TwoFAVaultSetup({ is2FAEnabled }: Props) {
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);

  // Setup form
  const [masterPassword, setMasterPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // New master key via 2FA
  const [newKeyTotpCode, setNewKeyTotpCode] = useState("");
  const [newMasterPassword, setNewMasterPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [isUpdatingKey, setIsUpdatingKey] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/totp/vault-setup");
      if (res.ok) {
        const data = await res.json();
        setIsEnabled(data.enabled);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const resetSetupForm = () => {
    setMasterPassword("");
    setTotpCode("");
    setShowPassword(false);
  };

  const handleSetup = async () => {
    if (!masterPassword || !totpCode) return;
    setIsSaving(true);
    try {
      const unlockToken = generateUnlockToken();
      const { encryptedMaster, masterIv } = await encryptMasterWith2FA(masterPassword, unlockToken);

      const res = await fetch("/api/auth/totp/vault-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totpCode, unlockToken, encryptedMaster, masterIv }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to set up 2FA vault unlock");
        return;
      }

      setIsEnabled(true);
      setShowSetupDialog(false);
      resetSetupForm();
      toast.success("2FA vault unlock enabled successfully");
    } catch {
      toast.error("Encryption failed. Check your inputs.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisable = async () => {
    const ok = confirm("Disable 2FA vault unlock? You won't be able to unlock your vault using 2FA until you set it up again.");
    if (!ok) return;

    try {
      const res = await fetch("/api/auth/totp/vault-setup", { method: "DELETE" });
      if (res.ok) {
        setIsEnabled(false);
        toast.success("2FA vault unlock disabled");
      } else {
        toast.error("Failed to disable 2FA vault unlock");
      }
    } catch {
      toast.error("An error occurred");
    }
  };

  const handleNewMasterKey = async () => {
    if (!newKeyTotpCode || !newMasterPassword) return;
    setIsUpdatingKey(true);
    try {
      const unlockToken = generateUnlockToken();
      const { encryptedMaster, masterIv } = await encryptMasterWith2FA(newMasterPassword, unlockToken);

      const res = await fetch("/api/auth/totp/vault-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          totpCode: newKeyTotpCode,
          unlockToken,
          encryptedMaster,
          masterIv,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Failed to update master key");
        return;
      }

      setShowNewKeyDialog(false);
      setNewKeyTotpCode("");
      setNewMasterPassword("");
      toast.success("2FA unlock updated with new master key. Re-lock and unlock your vault to apply.");
    } catch {
      toast.error("Encryption failed. Check your inputs.");
    } finally {
      setIsUpdatingKey(false);
    }
  };

  if (!is2FAEnabled) {
    return (
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden opacity-60">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle>2FA Vault Unlock</CardTitle>
            <CardDescription>Unlock your vault using your authenticator app instead of your master password.</CardDescription>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
            <Smartphone className="w-5 h-5 text-slate-400" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
            <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-500">
              Enable Two-Factor Authentication first to use this feature.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              2FA Vault Unlock
              {isLoading ? null : isEnabled ? (
                <Badge className="text-[10px] uppercase tracking-wider bg-emerald-100 text-emerald-700 border-emerald-200 font-bold">
                  Active
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-bold">
                  Inactive
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Unlock your vault using your authenticator app. Useful when you forget your master password.
            </CardDescription>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
            <Smartphone className="w-5 h-5 text-indigo-600" />
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            </div>
          ) : isEnabled ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-800 font-medium">
                  2FA vault unlock is active. You can unlock your vault using your authenticator app.
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-700">
                <strong>Generate new master key:</strong> If you need to update your vault's master key, use the button below. This updates the 2FA unlock mechanism with your new master password.
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-600">
              Set up 2FA vault unlock to access your vault using your authenticator app code — a useful fallback if you forget your master password.
            </div>
          )}
        </CardContent>

        <CardFooter className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 flex justify-end gap-3">
          {isEnabled ? (
            <>
              <Button
                variant="outline"
                onClick={() => setShowNewKeyDialog(true)}
                className="rounded-xl gap-2 font-bold"
              >
                <KeyRound className="w-4 h-4" />
                New Master Key via 2FA
              </Button>
              <Button
                variant="destructive"
                onClick={handleDisable}
                className="rounded-xl font-bold"
              >
                Disable
              </Button>
            </>
          ) : (
            <Button
              onClick={() => { resetSetupForm(); setShowSetupDialog(true); }}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md px-8 gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              Set Up 2FA Vault Unlock
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Setup dialog */}
      <Dialog open={showSetupDialog} onOpenChange={(open) => { setShowSetupDialog(open); if (!open) resetSetupForm(); }}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-indigo-600" />
              Set Up 2FA Vault Unlock
            </DialogTitle>
            <DialogDescription>
              Enter your master password and current 2FA code. Your master password will be securely encrypted and only released after 2FA verification.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Master Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
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

            <div className="space-y-2">
              <Label>Authenticator Code</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                className="rounded-xl tracking-widest text-center text-lg font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowSetupDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSetup}
              disabled={!masterPassword || totpCode.length !== 6 || isSaving}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold gap-2"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {isSaving ? "Saving..." : "Enable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New master key dialog */}
      <Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-indigo-600" />
              Generate New Master Key via 2FA
            </DialogTitle>
            <DialogDescription>
              Verify your identity with 2FA and set a new master password. This updates the 2FA unlock mechanism.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 font-medium">
              Full vault re-encryption with the new master key is coming soon. After saving, you'll need to re-lock and unlock your vault with the new master password.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Master Password</Label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  value={newMasterPassword}
                  onChange={(e) => setNewMasterPassword(e.target.value)}
                  className="rounded-xl pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Authenticator Code</Label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                maxLength={6}
                value={newKeyTotpCode}
                onChange={(e) => setNewKeyTotpCode(e.target.value.replace(/\D/g, ""))}
                className="rounded-xl tracking-widest text-center text-lg font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" onClick={() => setShowNewKeyDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleNewMasterKey}
              disabled={!newMasterPassword || newKeyTotpCode.length !== 6 || isUpdatingKey}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold gap-2"
            >
              {isUpdatingKey ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {isUpdatingKey ? "Updating..." : "Update Master Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
