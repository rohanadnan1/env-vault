"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Lock,
  KeyRound,
  Smartphone,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Loader2,
  MonitorX,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { TwoFactorSetup } from "./TwoFactorSetup";
import { TwoFAVaultSetup } from "./TwoFAVaultSetup";
import { RecoveryCodesSection } from "./RecoveryCodesSection";
import { SignOutAllDevicesModal } from "./SignOutAllDevicesModal";
import { ChangeMasterPasswordModal } from "./ChangeMasterPasswordModal";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  syncVaultUnlockAlternativeCacheFromServer,
  updateVaultUnlockAlternativeCache,
} from "@/lib/vault-unlock-options-cache";

export function SecurityTab() {
  const [autoLock, setAutoLock] = useState("15");
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);
  const [isRevoking2FA, setIsRevoking2FA] = useState(false);
  const [showRevoke2FAModal, setShowRevoke2FAModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showSignOutAll, setShowSignOutAll] = useState(false);
  const [hasRecoveryCodes, setHasRecoveryCodes] = useState(false);
  const [showChangeMasterPw, setShowChangeMasterPw] = useState(false);
  const [masterPwStatus, setMasterPwStatus] = useState<{
    hasResetPath: boolean; hasRecoveryCodes: boolean; hasTotp: boolean;
    onCooldown: boolean; nextChangeAt: string | null;
  } | null>(null);

  const refreshMasterPasswordStatus = useCallback(async () => {
    try {
      const mpRes = await fetch("/api/auth/master-password/status");
      if (mpRes.ok) {
        setMasterPwStatus(await mpRes.json());
      }
    } catch {
      // silent
    }
  }, []);

  const handleRecoveryCodesStatusChange = useCallback((nextHasRecoveryCodes: boolean) => {
    setHasRecoveryCodes((prev) => {
      if (prev === nextHasRecoveryCodes) return prev;
      void refreshMasterPasswordStatus();
      return nextHasRecoveryCodes;
    });
  }, [refreshMasterPasswordStatus]);

  // Load status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // Load auto-lock
        const saved = localStorage.getItem("envault_autolock");
        if (saved) setAutoLock(saved);

        const [totpStatusResult, recoveryStatusResult] = await Promise.allSettled([
          fetch("/api/auth/totp/status"),
          fetch("/api/recovery-codes/status"),
        ]);

        if (totpStatusResult.status === "fulfilled" && totpStatusResult.value.ok) {
          const data = await totpStatusResult.value.json();
          setIs2FAEnabled(!!data?.enabled);
        }

        if (recoveryStatusResult.status === "fulfilled" && recoveryStatusResult.value.ok) {
          const rcData = await recoveryStatusResult.value.json();
          setHasRecoveryCodes((rcData?.remaining ?? 0) > 0);
        }

        // Load master password change status
        await refreshMasterPasswordStatus();

        // Keep vault unlock alternatives cache fresh after settings page loads.
        void syncVaultUnlockAlternativeCacheFromServer();
      } catch (_err) {
        console.error("Failed to load security status");
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, [refreshMasterPasswordStatus]);

  const handleAutoLockChange = (value: string | null) => {
    if (!value) return;
    setAutoLock(value);
    localStorage.setItem("envault_autolock", value);
    toast.success(`Auto-lock timeout updated to ${value === '0' ? 'Never' : value + ' minutes'}`);
  };

  const handleRevoke2FA = async () => {
    setIsRevoking2FA(true);

    try {
      const res = await fetch("/api/auth/totp/disable", { method: "POST" });
      if (res.ok) {
        setIs2FAEnabled(false);
        updateVaultUnlockAlternativeCache({ has2FAVaultUnlock: false });
        setShowRevoke2FAModal(false);
        await refreshMasterPasswordStatus();
        toast.success("2FA has been disabled.");
      } else {
        toast.error("Failed to disable 2FA");
      }
    } catch (_err) {
      toast.error("An error occurred");
    } finally {
      setIsRevoking2FA(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {!is2FAEnabled && !hasRecoveryCodes && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800 leading-relaxed">
            Your account is not fully secured yet. Enable <strong>2FA</strong> and generate <strong>recovery codes</strong> to protect access if you lose your password or device.
          </p>
        </div>
      )}

      {/* Vault Auto-lock */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle>Vault Security</CardTitle>
            <CardDescription>Control how your vault behaves when you're away.</CardDescription>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
            <Lock className="w-5 h-5 text-indigo-600" />
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label className="text-base">Auto-lock Timeout</Label>
              <p className="text-sm text-slate-500">The vault will automatically lock after this period of inactivity.</p>
            </div>
            <Select value={autoLock} onValueChange={handleAutoLockChange}>
              <SelectTrigger className="w-[180px] rounded-xl">
                <SelectValue placeholder="Select timeout" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 Minutes</SelectItem>
                <SelectItem value="15">15 Minutes</SelectItem>
                <SelectItem value="30">30 Minutes</SelectItem>
                <SelectItem value="60">1 Hour</SelectItem>
                <SelectItem value="0">Never (Unsafe)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Two-Factor Authentication */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Two-Factor Authentication
              {!is2FAEnabled && <Badge variant="outline" className="text-[10px] uppercase tracking-wider bg-white font-bold ml-2">Recommended</Badge>}
            </CardTitle>
            <CardDescription>Add an extra layer of security to your account login.</CardDescription>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
            <Smartphone className="w-5 h-5 text-indigo-600" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-4">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center border",
                is2FAEnabled ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-slate-50 border-slate-100 text-slate-400"
              )}>
                {is2FAEnabled ? <ShieldCheck className="w-6 h-6" /> : <Smartphone className="w-6 h-6" />}
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-slate-900">Authenticator App</h3>
                <p className="text-sm text-slate-500">
                  {is2FAEnabled 
                    ? "Your account is protected with 2FA using an authenticator app." 
                    : "Use an app like Google Authenticator or Authy to generate secure login codes."}
                </p>
              </div>
            </div>
            <Button 
              variant={is2FAEnabled ? "destructive" : "default"}
              onClick={() => is2FAEnabled ? setShowRevoke2FAModal(true) : setIsSettingUp2FA(true)}
              disabled={isRevoking2FA}
              className={cn("rounded-xl font-bold", !is2FAEnabled && "bg-indigo-600 hover:bg-indigo-700 shadow-md px-8")}
            >
              {is2FAEnabled ? "Revoke 2FA" : "Set up 2FA"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Master Password */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle>Master Password</CardTitle>
            <CardDescription>Changing your master password will re-encrypt all your secrets.</CardDescription>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
            <KeyRound className="w-5 h-5 text-indigo-600" />
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          {!masterPwStatus?.hasResetPath && (
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 leading-relaxed">
                You need to set up <strong>2FA</strong> or generate <strong>recovery codes</strong> first.
                This is required to verify your identity before resetting your master password.
              </div>
            </div>
          )}
          {masterPwStatus?.onCooldown && masterPwStatus.nextChangeAt && (
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex gap-3">
              <AlertCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
              <div className="text-sm text-slate-600 leading-relaxed">
                Master password was recently changed. You can change it again after{' '}
                <strong>{new Date(masterPwStatus.nextChangeAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.
              </div>
            </div>
          )}
          {masterPwStatus?.hasResetPath && !masterPwStatus.onCooldown && (
            <p className="text-sm text-slate-500 leading-relaxed">
              Verify your identity with {masterPwStatus.hasTotp && masterPwStatus.hasRecoveryCodes ? <><strong>2FA</strong> or a <strong>recovery code</strong></> : masterPwStatus.hasTotp ? <strong>2FA</strong> : <strong>a recovery code</strong>} and a new random master password will be generated.
              All your secrets and files will be re-encrypted in your browser.
              The new password is shown <strong>once for 15 seconds</strong> — you must save it immediately.
              After changing, you cannot change it again for <strong className="text-slate-700">10 days</strong>.
            </p>
          )}
        </CardContent>
        <CardFooter className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 flex justify-end">
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md px-8"
            disabled={!masterPwStatus?.hasResetPath || masterPwStatus.onCooldown}
            onClick={() => setShowChangeMasterPw(true)}
          >
            Reset Master Password
          </Button>
        </CardFooter>
      </Card>

      {/* Active Sessions */}
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Sessions</CardTitle>
            <CardDescription>Sign out all devices that have access to your account.</CardDescription>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-100 shadow-sm">
            <MonitorX className="w-5 h-5 text-red-500" />
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border bg-red-50 border-red-100">
              <MonitorX className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="font-bold text-slate-900">Sign out everywhere</h3>
              <p className="text-sm text-slate-500">
                Immediately invalidates all active sessions on every device. You can choose
                to stay signed in on this device after verification.
              </p>
              {!is2FAEnabled && !hasRecoveryCodes && (
                <p className="text-xs text-amber-600 font-medium pt-1">
                  Set up 2FA or generate recovery codes first — verification is required to use this feature.
                </p>
              )}
            </div>
            <Button
              variant="destructive"
              className="shrink-0"
              disabled={!is2FAEnabled && !hasRecoveryCodes}
              onClick={() => setShowSignOutAll(true)}
            >
              Sign Out All
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recovery Codes */}
      <RecoveryCodesSection
        onStatusChange={handleRecoveryCodesStatusChange}
      />

      <TwoFAVaultSetup is2FAEnabled={is2FAEnabled} />

      <TwoFactorSetup
        open={isSettingUp2FA}
        onOpenChange={setIsSettingUp2FA}
        onSuccess={() => {
          setIs2FAEnabled(true);
          void syncVaultUnlockAlternativeCacheFromServer();
          void refreshMasterPasswordStatus();
        }}
      />

      <SignOutAllDevicesModal
        open={showSignOutAll}
        onOpenChange={setShowSignOutAll}
        hasTotp={is2FAEnabled}
        hasRecoveryCodes={hasRecoveryCodes}
      />

      {masterPwStatus && (
        <ChangeMasterPasswordModal
          open={showChangeMasterPw}
          onOpenChange={setShowChangeMasterPw}
          hasRecoveryCodes={masterPwStatus.hasRecoveryCodes}
          hasTotp={masterPwStatus.hasTotp}
        />
      )}

      <Dialog open={showRevoke2FAModal} onOpenChange={(open) => !isRevoking2FA && setShowRevoke2FAModal(open)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Disable Two-Factor Authentication?</DialogTitle>
            <DialogDescription>
              Turning off 2FA lowers account security and removes authenticator-based verification.
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800">
            Keep recovery codes ready before disabling 2FA so you still have a secure fallback.
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              onClick={() => setShowRevoke2FAModal(false)}
              disabled={isRevoking2FA}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              onClick={handleRevoke2FA}
              disabled={isRevoking2FA}
            >
              {isRevoking2FA ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Disabling...
                </span>
              ) : (
                "Disable 2FA"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
