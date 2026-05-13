export const FREE_AVATARS = [
  "/avatars/free/avatar1.svg",
  "/avatars/free/avatar2.svg",
  "/avatars/free/avatar3.png",
  "/avatars/free/avatar4.png",
  "/avatars/free/avatar5.png",
] as const;

export const EMOJI_AVATARS = [
  "👑",
  "👸",
  "🤴",
  "🦁",
  "🐉",
  "🦊",
  "🦉",
  "🦄",
  "🚀",
  "🎸",
] as const;

export const AVATAR_SKIN_TONES = [
  "#F7D7C4",
  "#EBC4A1",
  "#D7A27E",
  "#B67B5B",
  "#8A5A3C",
] as const;

export const AVATAR_HAIR_STYLES = [
  "short",
  "wave",
  "curly",
  "bun",
  "buzz",
] as const;

export const AVATAR_HAIR_COLORS = [
  "#1F2937",
  "#4B5563",
  "#7C2D12",
  "#B45309",
  "#D97706",
  "#FDE68A",
] as const;

export const AVATAR_EYE_STYLES = [
  "round",
  "happy",
  "sleepy",
] as const;

export const AVATAR_MOUTH_STYLES = [
  "smile",
  "smirk",
  "open",
] as const;

export const AVATAR_ACCESSORIES = [
  "none",
  "glasses",
  "crown",
  "headset",
] as const;

export const AVATAR_BG_COLORS = [
  "#E0F2FE",
  "#EDE9FE",
  "#FCE7F3",
  "#ECFCCB",
  "#FEF9C3",
] as const;

export const AVATAR_CONFIG_PREFIX = "avatar-config:" as const;
export const AVATAR_3D_CONFIG_PREFIX = "avatar-3d:" as const;

export type FreeAvatar = (typeof FREE_AVATARS)[number];
export type EmojiAvatar = (typeof EMOJI_AVATARS)[number];
export type AvatarSkinTone = (typeof AVATAR_SKIN_TONES)[number];
export type AvatarHairStyle = (typeof AVATAR_HAIR_STYLES)[number];
export type AvatarHairColor = (typeof AVATAR_HAIR_COLORS)[number];
export type AvatarEyeStyle = (typeof AVATAR_EYE_STYLES)[number];
export type AvatarMouthStyle = (typeof AVATAR_MOUTH_STYLES)[number];
export type AvatarAccessory = (typeof AVATAR_ACCESSORIES)[number];
export type AvatarBgColor = (typeof AVATAR_BG_COLORS)[number];

export type AvatarConfig = {
  version: 1;
  skinTone: AvatarSkinTone;
  hairStyle: AvatarHairStyle;
  hairColor: AvatarHairColor;
  eyeStyle: AvatarEyeStyle;
  mouthStyle: AvatarMouthStyle;
  accessory: AvatarAccessory;
  bgColor: AvatarBgColor;
};

export const AVATAR_3D_SKIN_TONES = [
  "#F7D7C4",
  "#EBC4A1",
  "#D7A27E",
  "#B67B5B",
  "#8A5A3C",
] as const;

export const AVATAR_3D_HAIR_COLORS = [
  "#111827",
  "#374151",
  "#7C2D12",
  "#B45309",
  "#F59E0B",
  "#FDE68A",
] as const;

export const AVATAR_3D_EYE_COLORS = [
  "#0F172A",
  "#1F2937",
  "#0F766E",
  "#1E3A8A",
] as const;

export const AVATAR_3D_EYE_STYLES = [
  "round",
  "almond",
  "sleepy",
  "wink",
] as const;

export const AVATAR_3D_HAIR_STYLES_BOY = [
  "short",
  "quiff",
  "fade",
  "buzz",
] as const;

export const AVATAR_3D_HAIR_STYLES_GIRL = [
  "bob",
  "long",
  "wave",
  "bun",
] as const;

export type Avatar3DStyle = "boy" | "girl";
export type Avatar3DSkinTone = (typeof AVATAR_3D_SKIN_TONES)[number];
export type Avatar3DHairColor = (typeof AVATAR_3D_HAIR_COLORS)[number];
export type Avatar3DEyeColor = (typeof AVATAR_3D_EYE_COLORS)[number];
export type Avatar3DEyeStyle = (typeof AVATAR_3D_EYE_STYLES)[number];
export type Avatar3DHairStyle =
  | (typeof AVATAR_3D_HAIR_STYLES_BOY)[number]
  | (typeof AVATAR_3D_HAIR_STYLES_GIRL)[number];

export type Avatar3DConfig = {
  version: 2;
  style: Avatar3DStyle;
  skinTone: Avatar3DSkinTone;
  hairStyle: Avatar3DHairStyle;
  hairColor: Avatar3DHairColor;
  eyeColor: Avatar3DEyeColor;
  eyeStyle: Avatar3DEyeStyle;
};

export type SerializedAvatarConfig = `${typeof AVATAR_CONFIG_PREFIX}${string}`;
export type SerializedAvatar3DConfig = `${typeof AVATAR_3D_CONFIG_PREFIX}${string}`;
export type AvatarValue = FreeAvatar | EmojiAvatar | SerializedAvatarConfig | SerializedAvatar3DConfig;

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  version: 1,
  skinTone: AVATAR_SKIN_TONES[1],
  hairStyle: "short",
  hairColor: AVATAR_HAIR_COLORS[0],
  eyeStyle: "round",
  mouthStyle: "smile",
  accessory: "none",
  bgColor: AVATAR_BG_COLORS[0],
};

export const DEFAULT_3D_AVATAR_CONFIG: Avatar3DConfig = {
  version: 2,
  style: "boy",
  skinTone: AVATAR_3D_SKIN_TONES[1],
  hairStyle: AVATAR_3D_HAIR_STYLES_BOY[0],
  hairColor: AVATAR_3D_HAIR_COLORS[0],
  eyeColor: AVATAR_3D_EYE_COLORS[0],
  eyeStyle: AVATAR_3D_EYE_STYLES[0],
};

export function isFreeAvatar(value: string): value is FreeAvatar {
  return (FREE_AVATARS as readonly string[]).includes(value);
}

export function isEmojiAvatar(value: string): value is EmojiAvatar {
  return (EMOJI_AVATARS as readonly string[]).includes(value);
}

export function isAvatarValue(value: string): value is AvatarValue {
  return (
    isFreeAvatar(value) ||
    isEmojiAvatar(value) ||
    isSerializedAvatarConfig(value) ||
    isSerializedAvatar3DConfig(value)
  );
}

export function isAvatarConfig(value: unknown): value is AvatarConfig {
  if (!value || typeof value !== "object") return false;
  const config = value as AvatarConfig;
  return (
    config.version === 1 &&
    (AVATAR_SKIN_TONES as readonly string[]).includes(config.skinTone) &&
    (AVATAR_HAIR_STYLES as readonly string[]).includes(config.hairStyle) &&
    (AVATAR_HAIR_COLORS as readonly string[]).includes(config.hairColor) &&
    (AVATAR_EYE_STYLES as readonly string[]).includes(config.eyeStyle) &&
    (AVATAR_MOUTH_STYLES as readonly string[]).includes(config.mouthStyle) &&
    (AVATAR_ACCESSORIES as readonly string[]).includes(config.accessory) &&
    (AVATAR_BG_COLORS as readonly string[]).includes(config.bgColor)
  );
}

export function serializeAvatarConfig(config: AvatarConfig): SerializedAvatarConfig {
  return `${AVATAR_CONFIG_PREFIX}${JSON.stringify(config)}`;
}

export function parseAvatarConfig(value: string): AvatarConfig | null {
  if (!value.startsWith(AVATAR_CONFIG_PREFIX)) return null;
  const raw = value.slice(AVATAR_CONFIG_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as unknown;
    return isAvatarConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isSerializedAvatarConfig(value: string): value is SerializedAvatarConfig {
  return parseAvatarConfig(value) !== null;
}

export function isAvatar3DConfig(value: unknown): value is Avatar3DConfig {
  return normalizeAvatar3DConfig(value) !== null;
}

export function serializeAvatar3DConfig(config: Avatar3DConfig): SerializedAvatar3DConfig {
  return `${AVATAR_3D_CONFIG_PREFIX}${JSON.stringify(config)}`;
}

export function parseAvatar3DConfig(value: string): Avatar3DConfig | null {
  if (!value.startsWith(AVATAR_3D_CONFIG_PREFIX)) return null;
  const raw = value.slice(AVATAR_3D_CONFIG_PREFIX.length);
  try {
    const parsed = JSON.parse(raw) as unknown;
    return normalizeAvatar3DConfig(parsed);
  } catch {
    return null;
  }
}

export function isSerializedAvatar3DConfig(value: string): value is SerializedAvatar3DConfig {
  return parseAvatar3DConfig(value) !== null;
}

export function getDefault3DAvatarConfig(style: Avatar3DStyle): Avatar3DConfig {
  return {
    version: 2,
    style,
    skinTone: AVATAR_3D_SKIN_TONES[1],
    hairStyle: style === "boy" ? AVATAR_3D_HAIR_STYLES_BOY[0] : AVATAR_3D_HAIR_STYLES_GIRL[0],
    hairColor: AVATAR_3D_HAIR_COLORS[0],
    eyeColor: AVATAR_3D_EYE_COLORS[0],
    eyeStyle: AVATAR_3D_EYE_STYLES[0],
  };
}

type LegacyAvatar3DConfig = {
  version: 1;
  style: Avatar3DStyle;
  skinTone: Avatar3DSkinTone;
  hairStyle: Avatar3DHairStyle;
  hairColor: Avatar3DHairColor;
  eyeColor: Avatar3DEyeColor;
};

function normalizeAvatar3DConfig(value: unknown): Avatar3DConfig | null {
  if (!value || typeof value !== "object") return null;

  const config = value as Partial<Avatar3DConfig> & Partial<LegacyAvatar3DConfig>;
  if (config.style !== "boy" && config.style !== "girl") return null;

  const hairStyles = config.style === "boy" ? AVATAR_3D_HAIR_STYLES_BOY : AVATAR_3D_HAIR_STYLES_GIRL;
  if (
    !(AVATAR_3D_SKIN_TONES as readonly string[]).includes(config.skinTone ?? "") ||
    !(AVATAR_3D_HAIR_COLORS as readonly string[]).includes(config.hairColor ?? "") ||
    !(AVATAR_3D_EYE_COLORS as readonly string[]).includes(config.eyeColor ?? "") ||
    !(hairStyles as readonly string[]).includes(config.hairStyle ?? "")
  ) {
    return null;
  }

  const eyeStyle = (AVATAR_3D_EYE_STYLES as readonly string[]).includes(config.eyeStyle ?? "")
    ? (config.eyeStyle as Avatar3DEyeStyle)
    : AVATAR_3D_EYE_STYLES[0];

  if (config.version !== 1 && config.version !== 2) return null;

  return {
    version: 2,
    style: config.style,
    skinTone: config.skinTone as Avatar3DSkinTone,
    hairStyle: config.hairStyle as Avatar3DHairStyle,
    hairColor: config.hairColor as Avatar3DHairColor,
    eyeColor: config.eyeColor as Avatar3DEyeColor,
    eyeStyle,
  };
}
