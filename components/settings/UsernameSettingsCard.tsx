"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { AtSign, Loader2, Lock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type UsernameStatus = {
  username: string | null;
  suggestion: string;
  locked: boolean;
  canEdit: boolean;
  editableUntil: string | null;
  needsUsername: boolean;
};

type AvailabilityState = {
  checking: boolean;
  available: boolean | null;
  message: string | null;
};

export function UsernameSettingsCard() {
  const { data: session, update } = useSession();
  const [status, setStatus] = useState<UsernameStatus | null>(null);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [confirmationDraft, setConfirmationDraft] = useState("");
  const [availability, setAvailability] = useState<AvailabilityState>({
    checking: false,
    available: null,
    message: null,
  });
  const [confirmationAvailability, setConfirmationAvailability] = useState<AvailabilityState>({
    checking: false,
    available: null,
    message: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showFinalPrompt, setShowFinalPrompt] = useState(false);
  const [showConfirmationEditor, setShowConfirmationEditor] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    fetch("/api/account/username", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setStatus(data);
        const nextValue = data.username ?? data.suggestion ?? "";
        setUsernameDraft(nextValue);
        setConfirmationDraft(nextValue);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useUsernameAvailability(usernameDraft, setAvailability, status?.username ?? null, !showFinalPrompt);
  useUsernameAvailability(confirmationDraft, setConfirmationAvailability, status?.username ?? null, showFinalPrompt && showConfirmationEditor);

  const isChangingExistingUsername = !!status?.username && usernameDraft.trim().toLowerCase() !== status.username;
  const canSaveDraft = useMemo(() => {
    if (!status) return false;
    if (status.locked) return false;
    if (usernameDraft.trim().toLowerCase() === (status.username ?? "").toLowerCase()) return false;
    return availability.available === true && !availability.checking && !isSaving;
  }, [availability.available, availability.checking, isSaving, status, usernameDraft]);

  const canSaveConfirmationDraft = useMemo(() => {
    return confirmationAvailability.available === true && !confirmationAvailability.checking && !isSaving;
  }, [confirmationAvailability.available, confirmationAvailability.checking, isSaving]);

  async function saveUsername(username: string, confirmFinalChange = false) {
    setIsSaving(true);
    try {
      const res = await fetch("/api/account/username", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, confirmFinalChange }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Could not save username");
        return false;
      }

      await update({ username: data.user.username });
      setStatus((current) =>
        current
          ? {
              ...current,
              username: data.user.username,
              locked: data.user.locked,
              canEdit: !data.user.locked,
              editableUntil: data.user.editableUntil,
              needsUsername: false,
            }
          : current
      );
      setUsernameDraft(data.user.username);
      setConfirmationDraft(data.user.username);
      setShowFinalPrompt(false);
      setShowConfirmationEditor(false);
      toast.success("Username saved");
      return true;
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSave() {
    if (!status) return;

    if (!status.username) {
      await saveUsername(usernameDraft);
      return;
    }

    if (isChangingExistingUsername) {
      setConfirmationDraft(usernameDraft);
      setShowFinalPrompt(true);
      return;
    }
  }

  if (isLoading) {
    return (
      <Card className="border-slate-200 shadow-sm rounded-2xl">
        <CardContent className="p-6 flex items-center gap-3 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading username settings...
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  return (
    <Card className="border-slate-200 shadow-sm rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AtSign className="w-5 h-5 text-indigo-600" />
          Username
        </CardTitle>
        <CardDescription>
          Unique public identity used for sharing, invitations, and notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={usernameDraft}
            onChange={(event) => {
              setUsernameDraft(event.target.value);
              setShowFinalPrompt(false);
              setShowConfirmationEditor(false);
            }}
            disabled={status.locked || isSaving}
            className="rounded-xl"
          />
          <p className={`text-xs ${
            availability.available === false ? "text-rose-600" : availability.available ? "text-emerald-600" : "text-slate-500"
          }`}>
            {status.locked ? (
              <span className="inline-flex items-center gap-1"><Lock className="w-3 h-3" /> This username is permanent.</span>
            ) : availability.checking ? (
              "Checking availability..."
            ) : (
              availability.message || "Use 3-20 lowercase letters, numbers, or underscores."
            )}
          </p>
        </div>

        {!status.locked && status.editableUntil && status.username && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            You can still change your username until {new Date(status.editableUntil).toLocaleString()}.
            Changing it now will make the next username permanent immediately.
          </div>
        )}

        {showFinalPrompt && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-rose-900">
              This is your last chance to set your username. After this save, you will never be able to change it again.
            </p>

            {showConfirmationEditor ? (
              <div className="space-y-3">
                <Input
                  value={confirmationDraft}
                  onChange={(event) => setConfirmationDraft(event.target.value)}
                  disabled={isSaving}
                  className="rounded-xl bg-white"
                />
                <p className={`text-xs ${
                  confirmationAvailability.available === false ? "text-rose-600" : confirmationAvailability.available ? "text-emerald-700" : "text-slate-600"
                }`}>
                  {confirmationAvailability.checking
                    ? "Checking availability..."
                    : confirmationAvailability.message || "Make your last edits, then save permanently."}
                </p>
                <div className="flex justify-end">
                  <Button
                    onClick={() => void saveUsername(confirmationDraft, true)}
                    disabled={!canSaveConfirmationDraft}
                    className="rounded-xl"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Final Username"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setShowConfirmationEditor(true)}
                >
                  Wait! I want to make some changes
                </Button>
                <Button
                  className="rounded-xl bg-rose-600 hover:bg-rose-700"
                  onClick={() => void saveUsername(usernameDraft, true)}
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "This Is Final"}
                </Button>
              </div>
            )}
          </div>
        )}

        {!status.locked && (
          <div className="flex justify-end">
            <Button onClick={() => void handleSave()} disabled={!canSaveDraft} className="rounded-xl">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : status.username ? "Save Username" : "Set Username"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function useUsernameAvailability(
  value: string,
  setState: (value: AvailabilityState) => void,
  currentUsername: string | null,
  enabled: boolean
) {
  useEffect(() => {
    const normalizedCurrent = (currentUsername ?? "").toLowerCase();
    const normalizedValue = value.trim().toLowerCase();

    if (!enabled) return;

    if (!normalizedValue) {
      setState({ checking: false, available: null, message: "Username is required" });
      return;
    }

    if (normalizedValue === normalizedCurrent) {
      setState({ checking: false, available: true, message: "This is your current username" });
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setState({ checking: true, available: null, message: null });
      try {
        const res = await fetch(`/api/account/username?value=${encodeURIComponent(value)}`, { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setState({
          checking: false,
          available: !!data.available,
          message: data.error ?? (data.available ? "Username is available" : null),
        });
      } catch {
        if (!cancelled) {
          setState({ checking: false, available: false, message: "Could not validate username right now" });
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [currentUsername, enabled, setState, value]);
}
