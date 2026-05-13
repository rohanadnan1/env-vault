import { createHash, randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { EmailDeliveryError, getEmailBaseUrl, sendBrevoTransactionalEmail } from '@/lib/email/brevo';

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken() {
  return randomBytes(32).toString('hex');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function issuePasswordResetLink(userId: string, email: string, name?: string | null) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await db.passwordResetToken.deleteMany({
    where: {
      userId,
      consumedAt: null,
    },
  });

  await db.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const resetUrl = `${getEmailBaseUrl()}/reset-password/${token}`;
  const displayName = name?.trim() || 'there';

  try {
    await sendBrevoTransactionalEmail({
      to: [{ email, name: name?.trim() || undefined }],
      subject: 'Reset your EnVault password',
      htmlContent: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px">
        <h1 style="color:#4f46e5;font-size:24px;font-weight:800;margin-bottom:8px">Reset your password</h1>
        <p style="color:#64748b;font-size:16px;margin-bottom:16px">Hi ${escapeHtml(displayName)}, we received a request to reset your EnVault password.</p>
        <div style="background:#f8fafc;padding:16px;border-radius:10px;margin-bottom:20px;border:1px solid #e2e8f0">
          <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Choose a new password</a>
        </div>
        <p style="color:#475569;font-size:14px;margin-bottom:8px">This link expires in 30 minutes and can only be used once.</p>
        <p style="color:#475569;font-size:14px;margin-bottom:8px">If the button does not work, open this link:</p>
        <p style="font-family:ui-monospace, SFMono-Regular, Menlo, monospace;font-size:13px;color:#334155;word-break:break-all">${resetUrl}</p>
        <p style="color:#ef4444;font-size:12px;font-weight:600">If you did not request this reset, you can ignore this email.</p>
      </div>`,
      textContent: [
        'Reset your EnVault password',
        `Hi ${displayName}, we received a request to reset your EnVault password.`,
        `Reset link: ${resetUrl}`,
        'This link expires in 30 minutes and can only be used once.',
        'If you did not request this reset, you can ignore this email.',
      ].join('\n'),
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production' && error instanceof EmailDeliveryError) {
      console.warn('[PASSWORD_RESET_EMAIL_FALLBACK]', error.message, error.cause);
      console.info(`[PASSWORD_RESET_DEV_LINK] ${email} -> ${resetUrl}`);
      return;
    }

    throw error;
  }
}

export async function validatePasswordResetToken(token: string) {
  const tokenHash = hashToken(token);
  const record = await db.passwordResetToken.findFirst({
    where: {
      tokenHash,
      consumedAt: null,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    return { ok: false as const, reason: 'invalid' };
  }

  if (record.expiresAt < new Date()) {
    return { ok: false as const, reason: 'expired', userId: record.userId };
  }

  return { ok: true as const, record };
}

export async function consumePasswordResetToken(token: string, nextPassword: string) {
  const validated = await validatePasswordResetToken(token);
  if (!validated.ok) return validated;

  const hashedPassword = await bcrypt.hash(nextPassword, 12);
  const now = new Date();

  await db.$transaction([
    db.passwordResetToken.update({
      where: { id: validated.record.id },
      data: { consumedAt: now },
    }),
    db.user.update({
      where: { id: validated.record.userId },
      data: {
        password: hashedPassword,
        sessionVersion: { increment: 1 },
      },
    }),
    db.passwordResetToken.deleteMany({
      where: {
        userId: validated.record.userId,
        id: { not: validated.record.id },
      },
    }),
    db.loginChallenge.deleteMany({
      where: { userId: validated.record.userId },
    }),
  ]);

  return { ok: true as const, user: validated.record.user };
}
