"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { User, Mail, Calendar } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ProfileTab() {
  const { data: session } = useSession();
  const [name, setName] = useState("");

  // Update name when session loads
  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [session?.user?.name]);

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your personal details and how others see you.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex flex-col items-center gap-4">
              <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center text-3xl font-bold text-indigo-700 border-4 border-white shadow-md">
                {session?.user?.name?.[0] || session?.user?.email?.[0]?.toUpperCase() || "U"}
              </div>
              <Button variant="outline" size="sm" className="rounded-xl">Change Avatar</Button>
            </div>

            <div className="flex-1 space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input 
                    id="name" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 rounded-xl" 
                    placeholder="Your Name"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input 
                    id="email" 
                    value={session?.user?.email || ""} 
                    disabled 
                    className="pl-10 rounded-xl bg-slate-50 border-slate-100 text-slate-500 cursor-not-allowed" 
                  />
                </div>
                <p className="text-[10px] text-slate-400 px-1 italic">Email cannot be changed for security reasons.</p>
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <Button variant="ghost" className="rounded-xl">Cancel</Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-xl px-8 shadow-md transition-all active:scale-95">
                  Save Changes
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">Account Created</span>
            </div>
            <span className="text-sm text-slate-900 font-semibold">
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">Verification Status</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-100">Verified</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ShieldCheck(props: unknown) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
