"use client";

import { useState, useEffect } from "react";
import { 
  Lock, 
  KeyRound, 
  Smartphone, 
  Clock, 
  ShieldCheck,
  AlertCircle,
  QrCode,
  Loader2,
  Trash2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { TwoFactorSetup } from "./TwoFactorSetup";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function SecurityTab() {
  const [autoLock, setAutoLock] = useState("15");
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [isSettingUp2FA, setIsSettingUp2FA] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        // Load auto-lock
        const saved = localStorage.getItem("envault_autolock");
        if (saved) setAutoLock(saved);

        // Load 2FA status
        const res = await fetch("/api/auth/totp/status");
        if (res.ok) {
          const data = await res.json();
          setIs2FAEnabled(data.enabled);
        }
      } catch (err) {
        console.error("Failed to load security status");
      } finally {
        setIsLoading(false);
      }
    };
    fetchStatus();
  }, []);

  const handleAutoLockChange = (value: string | null) => {
    if (!value) return;
    setAutoLock(value);
    localStorage.setItem("envault_autolock", value);
    toast.success(`Auto-lock timeout updated to ${value === '0' ? 'Never' : value + ' minutes'}`);
  };

  const handleRevoke2FA = async () => {
    const ok = confirm("Are you sure you want to disable two-factor authentication? This reduces your account security.");
    if (!ok) return;

    try {
      const res = await fetch("/api/auth/totp/disable", { method: "POST" });
      if (res.ok) {
        setIs2FAEnabled(false);
        toast.success("2FA has been disabled.");
      } else {
        toast.error("Failed to disable 2FA");
      }
    } catch (err) {
      toast.error("An error occurred");
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
              onClick={() => is2FAEnabled ? handleRevoke2FA() : setIsSettingUp2FA(true)}
              className={cn("rounded-xl font-bold", !is2FAEnabled && "bg-indigo-600 hover:bg-indigo-700 shadow-md px-8")}
            >
              {is2FAEnabled ? "Revoke 2FA" : "Set up 2FA"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Change Master Password (UI only foundation) */}
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
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800 leading-relaxed font-medium">
              <strong>Warning:</strong> Re-keying requires decrypting and re-encrypting every secret in your browser. This will be implemented in a future update.
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="current-pw">Current Master Password</Label>
            <Input id="current-pw" type="password" placeholder="••••••••" className="rounded-xl" disabled />
          </div>
        </CardContent>
        <CardFooter className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 flex justify-end">
          <Button disabled className="bg-slate-900 text-white rounded-xl shadow-lg px-8">
            Coming Soon
          </Button>
        </CardFooter>
      </Card>

      <TwoFactorSetup 
        open={isSettingUp2FA} 
        onOpenChange={setIsSettingUp2FA} 
        onSuccess={() => setIs2FAEnabled(true)} 
      />
    </div>
  );
}
