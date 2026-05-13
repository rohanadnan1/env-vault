"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { User, Mail, Calendar, ShieldCheck, Check, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  AVATAR_ACCESSORIES,
  AVATAR_3D_EYE_COLORS,
  AVATAR_3D_EYE_STYLES,
  AVATAR_3D_HAIR_COLORS,
  AVATAR_3D_HAIR_STYLES_BOY,
  AVATAR_3D_HAIR_STYLES_GIRL,
  AVATAR_3D_SKIN_TONES,
  AVATAR_BG_COLORS,
  AVATAR_EYE_STYLES,
  AVATAR_HAIR_COLORS,
  AVATAR_HAIR_STYLES,
  AVATAR_MOUTH_STYLES,
  AVATAR_SKIN_TONES,
  DEFAULT_AVATAR_CONFIG,
  DEFAULT_3D_AVATAR_CONFIG,
  EMOJI_AVATARS,
  FREE_AVATARS,
  getDefault3DAvatarConfig,
  isEmojiAvatar,
  isSerializedAvatar3DConfig,
  parseAvatarConfig,
  parseAvatar3DConfig,
  serializeAvatarConfig,
  serializeAvatar3DConfig,
} from "@/lib/avatars";
import { AvatarRenderer } from "@/components/ui/avatar-renderer";
import { Avatar3D } from "@/components/ui/avatar-3d";
import { UsernameSettingsCard } from "@/components/settings/UsernameSettingsCard";

export function ProfileTab() {
  const { data: session, update } = useSession();
  const [name, setName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState<string | null>(null);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [builderMode, setBuilderMode] = useState<"2d" | "3d">("2d");
  const [customAvatarConfig, setCustomAvatarConfig] = useState(DEFAULT_AVATAR_CONFIG);
  const [customAvatarInitialized, setCustomAvatarInitialized] = useState(false);
  const [custom3DConfig, setCustom3DConfig] = useState(DEFAULT_3D_AVATAR_CONFIG);
  const [custom3DInitialized, setCustom3DInitialized] = useState(false);

  // Update name when session loads only if the user hasn't explicitly changed it
  useEffect(() => {
    if (session?.user?.name && name === "") {
      setName(session.user.name);
    }
  }, [session?.user?.name, name]);

  useEffect(() => {
    if (session?.user?.image && !selectedAvatar) {
      setSelectedAvatar(session.user.image);
    }
  }, [session?.user?.image, selectedAvatar]);

  useEffect(() => {
    const avatarValue = selectedAvatar ?? session?.user?.image ?? null;
    if (!avatarValue) return;
    setBuilderMode(parseAvatar3DConfig(avatarValue) ? "3d" : "2d");
  }, [selectedAvatar, session?.user?.image]);

  useEffect(() => {
    if (customAvatarInitialized) return;
    const parsed = session?.user?.image ? parseAvatarConfig(session.user.image) : null;
    if (parsed) {
      setCustomAvatarConfig(parsed);
    }
    setCustomAvatarInitialized(true);
  }, [customAvatarInitialized, session?.user?.image]);

  useEffect(() => {
    if (custom3DInitialized) return;
    const parsed = session?.user?.image ? parseAvatar3DConfig(session.user.image) : null;
    if (parsed) {
      setCustom3DConfig(parsed);
    }
    setCustom3DInitialized(true);
  }, [custom3DInitialized, session?.user?.image]);

  useEffect(() => {
    if (!selectedAvatar) return;
    const parsed = parseAvatarConfig(selectedAvatar);
    if (!parsed) return;
    const nextValue = serializeAvatarConfig(customAvatarConfig);
    if (nextValue !== selectedAvatar) {
      setSelectedAvatar(nextValue);
    }
  }, [customAvatarConfig, selectedAvatar]);

  useEffect(() => {
    if (!selectedAvatar || !isSerializedAvatar3DConfig(selectedAvatar)) return;
    const nextValue = serializeAvatar3DConfig(custom3DConfig);
    if (nextValue !== selectedAvatar) {
      setSelectedAvatar(nextValue);
    }
  }, [custom3DConfig, selectedAvatar]);

  const initial =
    session?.user?.name?.[0] || session?.user?.email?.[0]?.toUpperCase() || "U";
  const currentAvatar = selectedAvatar ?? session?.user?.image ?? null;
  const showEmojiAvatar = currentAvatar ? isEmojiAvatar(currentAvatar) : false;
  const customAvatar = currentAvatar ? parseAvatarConfig(currentAvatar) : null;
  const custom3DAvatar = currentAvatar ? parseAvatar3DConfig(currentAvatar) : null;
  const customAvatarValue = serializeAvatarConfig(customAvatarConfig);
  const custom3DValue = serializeAvatar3DConfig(custom3DConfig);

  async function handleSave() {
    if (!session?.user?.id) {
      toast.error("Please sign in again to update your profile");
      return;
    }

    const normalizedName = name.trim();
    const avatarValue = selectedAvatar ?? "";
    const initialName = session.user.name ?? "";
    const initialAvatar = session.user.image ?? "";
    const hasChanges = normalizedName !== initialName || avatarValue !== initialAvatar;

    if (!hasChanges) {
      toast.message("No changes to save");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName, image: avatarValue }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Could not update profile");
        return;
      }

      await update({ name: data.user?.name ?? undefined, image: data.user?.image ?? undefined });
      toast.success("Profile updated");
      setIsAvatarPickerOpen(false);
    } catch {
      toast.error("Could not update profile right now");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <UsernameSettingsCard />

      <Card className="border-slate-200 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>Update your personal details and how others see you.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex flex-col items-center gap-4">
              <div className="relative w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center text-3xl font-bold text-indigo-700 border-4 border-white shadow-md overflow-hidden">
                {currentAvatar ? (
                  custom3DAvatar ? (
                    <Avatar3D config={custom3DAvatar} className="w-full h-full" />
                  ) : customAvatar ? (
                    <AvatarRenderer config={customAvatar} className="w-full h-full" />
                  ) : showEmojiAvatar ? (
                    <span className="text-4xl" aria-hidden>
                      {currentAvatar}
                    </span>
                  ) : (
                    <Image
                      src={currentAvatar}
                      alt={session?.user?.name ? `${session.user.name} avatar` : "User avatar"}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  )
                ) : (
                  initial
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl"
                onClick={() => setIsAvatarPickerOpen((v) => !v)}
              >
                {isAvatarPickerOpen ? "Hide Avatars" : "Change Avatar"}
              </Button>

              {isAvatarPickerOpen && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                      Avatars
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                      {FREE_AVATARS.map((avatar) => {
                        const isSelected = selectedAvatar === avatar;
                        return (
                          <button
                            key={avatar}
                            type="button"
                            onClick={() => setSelectedAvatar(avatar)}
                            className={`relative w-12 h-12 rounded-full overflow-hidden border transition-all ${
                              isSelected
                                ? "border-indigo-500 ring-2 ring-indigo-200"
                                : "border-slate-200 hover:border-indigo-300"
                            }`}
                            aria-pressed={isSelected}
                          >
                            <Image
                              src={avatar}
                              alt="Avatar option"
                              fill
                              sizes="48px"
                              className="object-cover"
                              loading="lazy"
                            />
                            {isSelected && (
                              <span className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center">
                                <Check className="w-4 h-4 text-indigo-700" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                      Emoji
                    </p>
                    <div className="grid grid-cols-5 sm:grid-cols-8 gap-3">
                      {EMOJI_AVATARS.map((emoji) => {
                        const isSelected = selectedAvatar === emoji;
                        return (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setSelectedAvatar(emoji)}
                            className={`relative w-10 h-10 rounded-full border flex items-center justify-center text-lg transition-all ${
                              isSelected
                                ? "border-indigo-500 ring-2 ring-indigo-200"
                                : "border-slate-200 hover:border-indigo-300"
                            }`}
                            aria-pressed={isSelected}
                          >
                            <span aria-hidden>{emoji}</span>
                            {isSelected && (
                              <span className="absolute inset-0 bg-indigo-500/10 flex items-center justify-center rounded-full">
                                <Check className="w-4 h-4 text-indigo-700" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold">
                        Avatar Builder
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant={builderMode === "2d" ? "default" : "outline"}
                          size="sm"
                          className="h-7 rounded-full px-3"
                          onClick={() => {
                            setBuilderMode("2d");
                            setSelectedAvatar(customAvatarValue);
                          }}
                        >
                          2D Builder
                        </Button>
                        <Button
                          variant={builderMode === "3d" ? "default" : "outline"}
                          size="sm"
                          className="h-7 rounded-full px-3"
                          onClick={() => {
                            setBuilderMode("3d");
                            setSelectedAvatar(custom3DValue);
                          }}
                        >
                          3D Builder
                        </Button>
                      </div>
                    </div>

                    {builderMode === "2d" ? (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-slate-600">
                            Build a more detailed illustrated avatar with layered hair, expression, and accessories.
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 rounded-full px-3"
                            onClick={() => {
                              setBuilderMode("3d");
                              setSelectedAvatar(custom3DValue);
                            }}
                          >
                            Switch to 3D
                          </Button>
                        </div>

                        <div className="space-y-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Skin Tone
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_SKIN_TONES.map((tone) => {
                              const isSelected = customAvatarConfig.skinTone === tone;
                              return (
                                <button
                                  key={tone}
                                  type="button"
                                  className={`w-8 h-8 rounded-full border transition-all ${
                                    isSelected
                                      ? "border-indigo-500 ring-2 ring-indigo-200"
                                      : "border-slate-200 hover:border-indigo-300"
                                  }`}
                                  style={{ backgroundColor: tone }}
                                  onClick={() => setCustomAvatarConfig({ ...customAvatarConfig, skinTone: tone })}
                                  aria-pressed={isSelected}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Hair Style
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_HAIR_STYLES.map((style) => {
                              const isSelected = customAvatarConfig.hairStyle === style;
                              return (
                                <button
                                  key={style}
                                  type="button"
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all capitalize ${
                                    isSelected
                                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                      : "border-slate-200 text-slate-600 hover:border-indigo-300"
                                  }`}
                                  onClick={() => setCustomAvatarConfig({ ...customAvatarConfig, hairStyle: style })}
                                  aria-pressed={isSelected}
                                >
                                  {style}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Hair Color
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_HAIR_COLORS.map((color) => {
                              const isSelected = customAvatarConfig.hairColor === color;
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  className={`w-8 h-8 rounded-full border transition-all ${
                                    isSelected
                                      ? "border-indigo-500 ring-2 ring-indigo-200"
                                      : "border-slate-200 hover:border-indigo-300"
                                  }`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => setCustomAvatarConfig({ ...customAvatarConfig, hairColor: color })}
                                  aria-pressed={isSelected}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Eye Shape
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_EYE_STYLES.map((style) => {
                              const isSelected = customAvatarConfig.eyeStyle === style;
                              return (
                                <button
                                  key={style}
                                  type="button"
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all capitalize ${
                                    isSelected
                                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                      : "border-slate-200 text-slate-600 hover:border-indigo-300"
                                  }`}
                                  onClick={() => setCustomAvatarConfig({ ...customAvatarConfig, eyeStyle: style })}
                                  aria-pressed={isSelected}
                                >
                                  {style}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Mouth
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_MOUTH_STYLES.map((style) => {
                              const isSelected = customAvatarConfig.mouthStyle === style;
                              return (
                                <button
                                  key={style}
                                  type="button"
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all capitalize ${
                                    isSelected
                                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                      : "border-slate-200 text-slate-600 hover:border-indigo-300"
                                  }`}
                                  onClick={() => setCustomAvatarConfig({ ...customAvatarConfig, mouthStyle: style })}
                                  aria-pressed={isSelected}
                                >
                                  {style}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Accessory
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_ACCESSORIES.map((accessory) => {
                              const isSelected = customAvatarConfig.accessory === accessory;
                              return (
                                <button
                                  key={accessory}
                                  type="button"
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all capitalize ${
                                    isSelected
                                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                      : "border-slate-200 text-slate-600 hover:border-indigo-300"
                                  }`}
                                  onClick={() => setCustomAvatarConfig({ ...customAvatarConfig, accessory })}
                                  aria-pressed={isSelected}
                                >
                                  {accessory}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Background
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_BG_COLORS.map((color) => {
                              const isSelected = customAvatarConfig.bgColor === color;
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  className={`w-8 h-8 rounded-full border transition-all ${
                                    isSelected
                                      ? "border-indigo-500 ring-2 ring-indigo-200"
                                      : "border-slate-200 hover:border-indigo-300"
                                  }`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => setCustomAvatarConfig({ ...customAvatarConfig, bgColor: color })}
                                  aria-pressed={isSelected}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm text-slate-600">
                            Build a more realistic 3D avatar with deeper face shaping and improved facial features.
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0 rounded-full px-3"
                            onClick={() => {
                              setBuilderMode("2d");
                              setSelectedAvatar(customAvatarValue);
                            }}
                          >
                            Switch to 2D
                          </Button>
                        </div>

                        <div className="space-y-3">
                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Boy or Girl
                          </p>
                          <div className="flex gap-2">
                            {(["boy", "girl"] as const).map((style) => {
                              const isSelected = custom3DConfig.style === style;
                              return (
                                <button
                                  key={style}
                                  type="button"
                                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition-all ${
                                    isSelected
                                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                      : "border-slate-200 text-slate-600 hover:border-indigo-300 bg-white"
                                  }`}
                                  onClick={() =>
                                    setCustom3DConfig((prev) =>
                                      getDefault3DAvatarConfig(style)
                                    )
                                  }
                                  aria-pressed={isSelected}
                                >
                                  {style === "boy" ? "Boy" : "Girl"}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Skin Tone
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_3D_SKIN_TONES.map((tone) => {
                              const isSelected = custom3DConfig.skinTone === tone;
                              return (
                                <button
                                  key={tone}
                                  type="button"
                                  className={`w-8 h-8 rounded-full border transition-all ${
                                    isSelected
                                      ? "border-indigo-500 ring-2 ring-indigo-200"
                                      : "border-slate-200 hover:border-indigo-300"
                                  }`}
                                  style={{ backgroundColor: tone }}
                                  onClick={() => setCustom3DConfig({ ...custom3DConfig, skinTone: tone })}
                                  aria-pressed={isSelected}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Hair Style
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {(custom3DConfig.style === "boy"
                              ? AVATAR_3D_HAIR_STYLES_BOY
                              : AVATAR_3D_HAIR_STYLES_GIRL
                            ).map((style) => {
                              const isSelected = custom3DConfig.hairStyle === style;
                              return (
                                <button
                                  key={style}
                                  type="button"
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                                    isSelected
                                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                      : "border-slate-200 text-slate-600 hover:border-indigo-300"
                                  }`}
                                  onClick={() => setCustom3DConfig({ ...custom3DConfig, hairStyle: style })}
                                  aria-pressed={isSelected}
                                >
                                  {style}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Hair Color
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_3D_HAIR_COLORS.map((color) => {
                              const isSelected = custom3DConfig.hairColor === color;
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  className={`w-8 h-8 rounded-full border transition-all ${
                                    isSelected
                                      ? "border-indigo-500 ring-2 ring-indigo-200"
                                      : "border-slate-200 hover:border-indigo-300"
                                  }`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => setCustom3DConfig({ ...custom3DConfig, hairColor: color })}
                                  aria-pressed={isSelected}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Eye Shape
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_3D_EYE_STYLES.map((style) => {
                              const isSelected = custom3DConfig.eyeStyle === style;
                              return (
                                <button
                                  key={style}
                                  type="button"
                                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all capitalize ${
                                    isSelected
                                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                                      : "border-slate-200 text-slate-600 hover:border-indigo-300"
                                  }`}
                                  onClick={() => setCustom3DConfig({ ...custom3DConfig, eyeStyle: style })}
                                  aria-pressed={isSelected}
                                >
                                  {style}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-2">
                            Eye Color
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {AVATAR_3D_EYE_COLORS.map((color) => {
                              const isSelected = custom3DConfig.eyeColor === color;
                              return (
                                <button
                                  key={color}
                                  type="button"
                                  className={`w-8 h-8 rounded-full border transition-all ${
                                    isSelected
                                      ? "border-indigo-500 ring-2 ring-indigo-200"
                                      : "border-slate-200 hover:border-indigo-300"
                                  }`}
                                  style={{ backgroundColor: color }}
                                  onClick={() => setCustom3DConfig({ ...custom3DConfig, eyeColor: color })}
                                  aria-pressed={isSelected}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                <Button
                  variant="ghost"
                  className="rounded-xl"
                  onClick={() => {
                    setName(session?.user?.name ?? "");
                    setSelectedAvatar(session?.user?.image ?? null);
                    const parsed2D = session?.user?.image ? parseAvatarConfig(session.user.image) : null;
                    const parsed3D = session?.user?.image ? parseAvatar3DConfig(session.user.image) : null;
                    setCustomAvatarConfig(parsed2D ?? DEFAULT_AVATAR_CONFIG);
                    setCustom3DConfig(parsed3D ?? DEFAULT_3D_AVATAR_CONFIG);
                    setBuilderMode(parsed3D ? "3d" : "2d");
                    setIsAvatarPickerOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-indigo-600 hover:bg-indigo-700 rounded-xl px-8 shadow-md transition-all active:scale-95"
                  onClick={handleSave}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </span>
                  ) : (
                    "Save Changes"
                  )}
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
