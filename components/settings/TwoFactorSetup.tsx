"use client";

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Copy, Check } from "lucide-react";
import Image from "next/image";

interface TwoFactorSetupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TwoFactorSetup({ open, onOpenChange, onSuccess }: TwoFactorSetupProps) {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeUrl: string } | null>(null);
  const [token, setToken] = useState("");
  const [isCopied, setIsCopied] = useState(false);

  const startSetup = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/totp/setup", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setSetupData(data);
        setStep(2);
      } else {
        toast.error("Failed to start 2FA setup");
      }
    } catch (err) {
      toast.error("An error occurred during setup");
    } finally {
      setIsLoading(false);
    }
  };

  const verifySetup = async () => {
    if (!setupData || !token) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: setupData.secret,
          token
        })
      });
      if (res.ok) {
        toast.success("Two-factor authentication enabled!");
        onSuccess();
        onOpenChange(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "Verification failed");
      }
    } catch (err) {
      toast.error("Verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const copySecret = () => {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.secret);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      if (!isLoading) {
        onOpenChange(val);
        if (!val) {
          setStep(1);
          setSetupData(null);
          setToken("");
        }
      }
    }}>
      <DialogContent className="sm:max-w-[425px]">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle>Enable Two-Factor Authentication</DialogTitle>
              <DialogDescription>
                Protect your account by requiring a code from your authenticator app when you log in.
              </DialogDescription>
            </DialogHeader>
            <div className="py-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-indigo-600" />
              </div>
              <p className="text-sm text-slate-500 max-w-xs">
                We'll generate a unique secret and QR code for your authenticator app (Google Authenticator, Authy, etc).
              </p>
            </div>
            <DialogFooter>
              <Button onClick={startSetup} disabled={isLoading} className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-xl">
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Get Started
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && setupData && (
          <>
            <DialogHeader>
              <DialogTitle>Scan QR Code</DialogTitle>
              <DialogDescription>
                Scan the QR code with your authenticator app to get started.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-6">
              <div className="flex justify-center p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                <Image 
                  src={setupData.qrCodeUrl} 
                  alt="QR Code" 
                  width={200} 
                  height={200} 
                  className="rounded-lg shadow-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-500 uppercase tracking-wider font-bold">Manual Entry Key</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    readOnly 
                    value={setupData.secret} 
                    className="font-mono text-xs rounded-xl bg-slate-50 border-slate-100" 
                  />
                  <Button variant="outline" size="icon" onClick={copySecret} className="rounded-xl shrink-0">
                    {isCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Label htmlFor="token" className="text-sm font-semibold">Enter 6-digit Code</Label>
                <Input 
                  id="token"
                  placeholder="000000"
                  maxLength={6}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="text-center text-2xl tracking-[0.5em] font-bold rounded-xl h-14"
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                onClick={verifySetup} 
                disabled={isLoading || token.length < 6} 
                className="w-full bg-indigo-600 hover:bg-indigo-700 rounded-xl h-12 text-lg font-bold"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verify & Enable
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
