import { db } from "@/lib/db";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_EDIT_WINDOW_DAYS = 3;
export const USERNAME_EDIT_WINDOW_MS = USERNAME_EDIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
export const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

type UsernameLifecycleUser = {
  id?: string;
  username: string | null;
  usernameSetAt: Date | null;
  usernameLockedAt: Date | null;
};

type LabelUser = {
  username?: string | null;
  name?: string | null;
  email?: string | null;
};

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string) {
  const normalized = normalizeUsername(value);

  if (!normalized) return "Username is required";
  if (!USERNAME_REGEX.test(normalized)) {
    return "Use 3-20 lowercase letters, numbers, or underscores";
  }

  return null;
}

export function getUsernameEditableUntil(user: Pick<UsernameLifecycleUser, "usernameSetAt">) {
  if (!user.usernameSetAt) return null;
  return new Date(user.usernameSetAt.getTime() + USERNAME_EDIT_WINDOW_MS);
}

export function isUsernameLocked(user: UsernameLifecycleUser, now = new Date()) {
  if (!user.username) return false;
  if (user.usernameLockedAt) return true;
  const editableUntil = getUsernameEditableUntil(user);
  return editableUntil !== null && now.getTime() >= editableUntil.getTime();
}

export function canChangeUsername(user: UsernameLifecycleUser, now = new Date()) {
  if (!user.username) return true;
  return !isUsernameLocked(user, now);
}

export function getUserLabel(user: LabelUser) {
  if (user.username) return `@${user.username}`;
  if (user.name) return user.name;
  if (user.email) return user.email;
  return "Unknown user";
}

export function getUsernameStatus(user: UsernameLifecycleUser, now = new Date()) {
  const locked = isUsernameLocked(user, now);
  const editableUntil = locked ? null : getUsernameEditableUntil(user);
  return {
    hasUsername: !!user.username,
    locked,
    editableUntil,
    canEdit: !locked && !!user.username,
    needsUsername: !user.username,
  };
}

export async function ensureUsernameLockState(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      usernameSetAt: true,
      usernameLockedAt: true,
    },
  });

  if (!user) return null;
  if (!isUsernameLocked(user) || user.usernameLockedAt) return user;

  return db.user.update({
    where: { id: userId },
    data: { usernameLockedAt: new Date() },
    select: {
      id: true,
      username: true,
      usernameSetAt: true,
      usernameLockedAt: true,
    },
  });
}

export async function isUsernameAvailable(username: string, excludeUserId?: string) {
  const normalized = normalizeUsername(username);
  const existing = await db.user.findFirst({
    where: {
      username: normalized,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { id: true },
  });

  return !existing;
}

export async function generateUniqueUsername(seed: string, excludeUserId?: string) {
  const base = toUsernameBase(seed);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const suffix = Math.floor(1000 + Math.random() * 9000).toString();
    const maxBaseLength = USERNAME_MAX_LENGTH - suffix.length - 1;
    const candidateBase = base.slice(0, Math.max(USERNAME_MIN_LENGTH, maxBaseLength));
    const candidate = `${candidateBase}_${suffix}`;

    if (await isUsernameAvailable(candidate, excludeUserId)) {
      return candidate;
    }
  }

  return `user_${Math.random().toString(36).slice(2, 10)}`.slice(0, USERNAME_MAX_LENGTH);
}

function toUsernameBase(seed: string) {
  const normalized = normalizeUsername(seed)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  if (normalized.length >= USERNAME_MIN_LENGTH) {
    return normalized.slice(0, USERNAME_MAX_LENGTH - 5);
  }

  return "user";
}
