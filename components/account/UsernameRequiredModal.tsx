"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AtSign, Loader2, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AvailabilityState = {
  checking: boolean;
  available: boolean | null;
  message: string | null;
};

export function UsernameRequiredModal() {
  const { data: session, status, update } = useSession();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityState>({
    checking: false,
    available: null,
    message: null,
  });

  useEffect(() => {
    if (status !== "authenticated") return;
    if (session.user.username) {
      setOpen(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch("/api/account/username", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setOpen(!!data.needsUsername);
        if (typeof data.suggestion === "string" && data.suggestion) {
          setUsername(data.suggestion);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user.username, status]);

  useEffect(() => {
    if (!open || !username.trim()) {
      setAvailability({ checking: false, available: null, message: null });
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setAvailability((current) => ({ ...current, checking: true }));
      try {
        const res = await fetch(`/api/account/username?value=${encodeURIComponent(username)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (cancelled) return;
        setAvailability({
          checking: false,
          available: !!data.available,
          message: data.error ?? (data.available ? "Username is available" : null),
        });
      } catch {
        if (!cancelled) {
          setAvailability({
            checking: false,
            available: false,
            message: "Could not validate username right now",
          });
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [open, username]);

  const canSave = useMemo(() => {
    return !isSaving && !availability.checking && availability.available === true && username.trim().length > 0;
  }, [availability.available, availability.checking, isSaving, username]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/account/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAvailability({
          checking: false,
          available: false,
          message: data.error ?? "Could not save username",
        });
        return;
      }

      await update({ username: data.user.username });
      setOpen(false);
    } finally {
      setIsSaving(false);
    }
  }

  if (status !== "authenticated" || isLoading || !open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="w-full max-w-lg"
          >
            <Card className="overflow-hidden rounded-[32px] border-slate-200/60 bg-white/95 p-8 shadow-2xl backdrop-blur-xl ring-1 ring-white/50">
              <div className="mb-8 flex flex-col items-center text-center">
                <div className="relative mb-5 flex h-20 w-20 items-center justify-center">
                  <div className="absolute inset-0 animate-ping rounded-full bg-indigo-100 opacity-50 duration-1000"></div>
                  <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-indigo-100 to-violet-50"></div>
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-100">
                    <AtSign className="h-7 w-7 text-indigo-600" />
                  </div>
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Claim your username</h2>
                <p className="mt-2 text-sm text-slate-500">Your unique identity across the entire ecosystem.</p>
              </div>

              <div className="space-y-4">
                <div className="relative flex items-center">
                  <div className="absolute left-4 flex h-full items-center justify-center text-slate-400">
                    <span className="text-lg font-medium">@</span>
                  </div>
                  <Input
                    value={username}
                    onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    className="h-14 w-full rounded-2xl border-slate-200 bg-slate-50 pl-10 pr-4 text-lg font-medium text-slate-900 transition-all focus-visible:bg-white focus-visible:ring-4 focus-visible:ring-indigo-500/20"
                    placeholder="username"
                    autoFocus
                    spellCheck={false}
                  />
                  <div className="absolute right-4 flex items-center justify-center">
                    {availability.checking ? (
                      <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                    ) : availability.available === true && username.trim().length > 0 ? (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </motion.div>
                    ) : availability.available === false ? (
                      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                          </svg>
                        </div>
                      </motion.div>
                    ) : null}
                  </div>
                </div>
                
                <AnimatePresence mode="wait">
                  <motion.p 
                    key={availability.message || 'default'}
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className={`text-center text-sm font-medium ${
                      availability.available === false ? "text-rose-600" : availability.available ? "text-emerald-600" : "text-slate-500"
                    }`}
                  >
                    {availability.checking
                      ? "Checking availability..."
                      : availability.message || "Use 3-20 lowercase letters, numbers, or underscores."}
                  </motion.p>
                </AnimatePresence>
              </div>

              <div className="mt-8 overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 p-5 ring-1 ring-indigo-100/50">
                <div className="flex gap-3">
                  <div className="mt-0.5 shrink-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-indigo-900/80">
                    You can change this <strong className="font-semibold text-indigo-900">once</strong> during your first 3 days. After that, your choice becomes completely permanent.
                  </p>
                </div>
              </div>

              <div className="mt-8">
                <Button 
                  onClick={handleSave} 
                  disabled={!canSave} 
                  className="group relative h-14 w-full overflow-hidden rounded-2xl bg-indigo-950 px-8 text-base font-semibold text-white transition-all hover:bg-indigo-900 hover:shadow-xl hover:shadow-indigo-500/20 active:scale-[0.98]"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 to-violet-600 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                  <span className="relative flex items-center justify-center gap-2">
                    {isSaving ? (
                      <><Loader2 className="h-5 w-5 animate-spin" /> Reserving...</>
                    ) : (
                      <>Claim Username <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></>
                    )}
                  </span>
                </Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
