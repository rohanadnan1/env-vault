export type VaultUnlockAlternativeKey = 'has2FAVaultUnlock' | 'hasRecoveryCodes';

export type VaultUnlockAlternativeState = {
  has2FAVaultUnlock: boolean | null;
  hasRecoveryCodes: boolean | null;
};

const ALT_2FA_KEY = 'envault_vault_alt_2fa_enabled';
const ALT_RECOVERY_KEY = 'envault_vault_alt_recovery_enabled';

function scopedKey(base: string, userId: string): string {
  return `${base}_${userId}`;
}

function readBoolean(key: string, userId: string): boolean | null {
  if (typeof window === 'undefined') return null;

  try {
    if (!userId) return null;
    const value = window.localStorage.getItem(scopedKey(key, userId));
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeBoolean(key: string, userId: string, value: boolean): void {
  if (typeof window === 'undefined') return;

  try {
    if (!userId) return;
    window.localStorage.setItem(scopedKey(key, userId), value ? 'true' : 'false');
  } catch {
    // Ignore storage write errors.
  }
}

export function readVaultUnlockAlternativeCache(userId: string): VaultUnlockAlternativeState {
  return {
    has2FAVaultUnlock: readBoolean(ALT_2FA_KEY, userId),
    hasRecoveryCodes: readBoolean(ALT_RECOVERY_KEY, userId),
  };
}

export function updateVaultUnlockAlternativeCache(
  userId: string,
  update: Partial<Record<VaultUnlockAlternativeKey, boolean>>
): void {
  if (typeof update.has2FAVaultUnlock === 'boolean') {
    writeBoolean(ALT_2FA_KEY, userId, update.has2FAVaultUnlock);
  }

  if (typeof update.hasRecoveryCodes === 'boolean') {
    writeBoolean(ALT_RECOVERY_KEY, userId, update.hasRecoveryCodes);
  }
}

export async function syncVaultUnlockAlternativeCacheFromServer(userId: string): Promise<VaultUnlockAlternativeState> {
  if (typeof window === 'undefined') {
    return { has2FAVaultUnlock: null, hasRecoveryCodes: null };
  }

  const [totpResult, recoveryResult] = await Promise.allSettled([
    fetch('/api/auth/totp/vault-setup', { cache: 'no-store' }),
    fetch('/api/recovery-codes/status', { cache: 'no-store' }),
  ]);

  const current = readVaultUnlockAlternativeCache(userId);

  let has2FAVaultUnlock = current.has2FAVaultUnlock;
  let hasRecoveryCodes = current.hasRecoveryCodes;

  if (totpResult.status === 'fulfilled' && totpResult.value.ok) {
    const data = await totpResult.value.json();
    has2FAVaultUnlock = !!data?.enabled;
  }

  if (recoveryResult.status === 'fulfilled' && recoveryResult.value.ok) {
    const data = await recoveryResult.value.json();
    hasRecoveryCodes = (data?.remaining ?? 0) > 0;
  }

  if (typeof has2FAVaultUnlock === 'boolean' || typeof hasRecoveryCodes === 'boolean') {
    updateVaultUnlockAlternativeCache(userId, {
      ...(typeof has2FAVaultUnlock === 'boolean' ? { has2FAVaultUnlock } : {}),
      ...(typeof hasRecoveryCodes === 'boolean' ? { hasRecoveryCodes } : {}),
    });
  }

  return {
    has2FAVaultUnlock,
    hasRecoveryCodes,
  };
}
