"use client";

import { useState } from "react";
import { 
  AlertTriangle, 
  Trash2, 
  Info,
  ShieldAlert
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { signOut } from "next-auth/react";

export function DangerZone() {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (confirmText !== "delete my account") {
      toast.error("Please type the confirmation text exactly.");
      return;
    }

    setIsDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (res.ok) {
        toast.success("Account deleted successfully.");
        await signOut({ callbackUrl: "/" });
      } else {
        throw new Error("Failed to delete account");
      }
    } catch (_err) {
      toast.error("An error occurred while deleting your account.");
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-rose-200 shadow-sm rounded-2xl overflow-hidden bg-rose-50/10">
        <CardHeader className="bg-rose-50/50 border-b border-rose-100 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-rose-900 font-bold">Danger Zone</CardTitle>
            <CardDescription className="text-rose-600/80">Permanent actions that cannot be undone.</CardDescription>
          </div>
          <div className="p-2 bg-white rounded-lg border border-rose-100 shadow-sm">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900">Delete Account</h3>
              <p className="text-sm text-slate-500 max-w-md">
                Permanently delete your account, all projects, environments, and encrypted secrets. 
                <span className="font-bold text-rose-600"> This action is irreversible.</span>
              </p>
            </div>
            
            <Dialog>
              <DialogTrigger 
                render={
                  <Button variant="destructive" className="rounded-xl shadow-lg shadow-rose-200 hover:shadow-rose-300 transition-all font-bold px-8">
                    Delete Account...
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-rose-600">
                    <AlertTriangle className="w-5 h-5" />
                    Absolute Certainty Required
                  </DialogTitle>
                  <DialogDescription className="pt-2 text-slate-600">
                    This will wipe your entire EnVault presence. You will lose access to all your secrets permanently.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-6 space-y-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs text-slate-500 mb-2">To confirm, please type <span className="font-bold text-slate-900 select-none">delete my account</span> below:</p>
                    <Input 
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder="Type here..." 
                      className="rounded-lg border-slate-200 focus:ring-rose-500 focus:border-rose-500"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button 
                    variant="destructive" 
                    className="w-full rounded-xl font-bold py-6 text-lg"
                    disabled={confirmText !== "delete my account" || isDeleting}
                    onClick={handleDeleteAccount}
                  >
                    {isDeleting ? "Deleting..." : "Permanently Delete My Account"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="my-4 h-px bg-rose-50" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900">Wipe All Current Shares</h3>
              <p className="text-sm text-slate-500 max-w-md">
                Immediately revoke access to all active share links you've created across all projects.
              </p>
            </div>
            <Button variant="outline" className="rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold px-8">
              Revoke All Links
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-4">
        <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm shrink-0">
          <Info className="w-5 h-5 text-slate-400" />
        </div>
        <div className="text-xs text-slate-500 leading-relaxed pt-1">
          At EnVault, your privacy is our priority. When you delete your account, we don't just "soft-delete" or deactivate: 
          we purge your records from our primary database and invalidate all associated cryptographic salts in your zero-knowledge model. 
          Some log data (IP logs, account events) may persist in isolated backups for up to 30 days for security and compliance auditing.
        </div>
      </div>
    </div>
  );
}
