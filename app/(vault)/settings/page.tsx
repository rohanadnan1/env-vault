"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { 
  User, 
  ShieldCheck, 
  Share2, 
  AlertTriangle,
  ChevronRight
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Sub-components (to be created in next steps)
import { ProfileTab } from "@/components/settings/ProfileTab";
import { SecurityTab } from "@/components/settings/SecurityTab";
import { DangerZone } from "@/components/settings/DangerZone";
// Note: Shares tab will show existing share management

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "security" ? "security" : "profile";
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <div className="max-w-5xl mx-auto p-6 lg:py-10">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Account Settings</h1>
        <p className="text-slate-500 mt-2">Manage your profile, security preferences, and vault access.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Navigation Sidebar (Desktop) */}
        <aside className="lg:w-64 shrink-0">
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => setActiveTab("profile")}
              className={cn(
                "flex items-center justify-between px-4 py-3 rounded-xl transition-all group",
                activeTab === "profile" 
                  ? "bg-indigo-50 text-indigo-700 shadow-sm" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <div className="flex items-center gap-3">
                <User className={cn("w-5 h-5", activeTab === "profile" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                <span className="font-semibold text-sm">Profile</span>
              </div>
              {activeTab === "profile" && <ChevronRight className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setActiveTab("security")}
              className={cn(
                "flex items-center justify-between px-4 py-3 rounded-xl transition-all group",
                activeTab === "security" 
                  ? "bg-indigo-50 text-indigo-700 shadow-sm" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <div className="flex items-center gap-3">
                <ShieldCheck className={cn("w-5 h-5", activeTab === "security" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                <span className="font-semibold text-sm">Security</span>
              </div>
              {activeTab === "security" && <ChevronRight className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setActiveTab("shares")}
              className={cn(
                "flex items-center justify-between px-4 py-3 rounded-xl transition-all group",
                activeTab === "shares" 
                  ? "bg-indigo-50 text-indigo-700 shadow-sm" 
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <div className="flex items-center gap-3">
                <Share2 className={cn("w-5 h-5", activeTab === "shares" ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600")} />
                <span className="font-semibold text-sm">Active Shares</span>
              </div>
              {activeTab === "shares" && <ChevronRight className="w-4 h-4" />}
            </button>

            <div className="my-4 h-px bg-slate-100" />

            <button
              onClick={() => setActiveTab("danger")}
              className={cn(
                "flex items-center justify-between px-4 py-3 rounded-xl transition-all group",
                activeTab === "danger" 
                  ? "bg-rose-50 text-rose-700 shadow-sm" 
                  : "text-slate-600 hover:bg-rose-50/50 hover:text-rose-700"
              )}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className={cn("w-5 h-5", activeTab === "danger" ? "text-rose-600" : "text-slate-400 group-hover:text-rose-600")} />
                <span className="font-semibold text-sm">Danger Zone</span>
              </div>
              {activeTab === "danger" && <ChevronRight className="w-4 h-4" />}
            </button>
          </nav>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "security" && <SecurityTab />}
          {activeTab === "shares" && (
            <Card className="border-slate-200 shadow-sm rounded-2xl">
              <CardHeader>
                <CardTitle>Manage Shares</CardTitle>
                <CardDescription>
                  Review and revoke active share links you've created.
                </CardDescription>
              </CardHeader>
              <CardContent className="py-10 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <Share2 className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-slate-900 font-semibold mb-1">No active shares found</h3>
                <p className="text-sm text-slate-500">You haven't shared any secrets from this vault yet.</p>
              </CardContent>
            </Card>
          )}
          {activeTab === "danger" && <DangerZone />}
        </main>
      </div>
    </div>
  );
}
