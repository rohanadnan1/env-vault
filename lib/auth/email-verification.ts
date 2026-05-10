import { createHash, randomInt } from 'crypto';
import { db } from '@/lib/db';
import { sendBrevoTransactionalEmail } from '@/lib/email/brevo';

const EMAIL_VERIFICATION_TTL_MS = 10 * 60 * 1000;

function hashCode(code: string) {
  return createHash('sha256').update(code).digest('hex');
}

function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function issueEmailVerificationCode(userId: string, email: string, name?: string | null) {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await db.emailVerificationCode.deleteMany({
    where: {
      userId,
      consumedAt: null,
    },
  });

  await db.emailVerificationCode.create({
    data: {
      userId,
      codeHash: hashCode(code),
      expiresAt,
    },
  });

  const displayName = name?.trim() || 'there';

  await sendBrevoTransactionalEmail({
    to: [{ email, name: name?.trim() || undefined }],
    subject: 'Verify your EnVault email',
    htmlContent: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px">
      <h1 style="color:#4f46e5;font-size:24px;font-weight:800;margin-bottom:8px">Verify your email</h1>
      <p style="color:#64748b;font-size:16px;margin-bottom:16px">Hi ${escapeHtml(displayName)}, enter this code in EnVault to verify your email address.</p>
      <div style="background:#f8fafc;padding:20px;border-radius:10px;margin-bottom:20px;border:1px solid #e2e8f0;text-align:center">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.12em">Verification code</p>
        <p style="margin:0;font-size:34px;font-weight:800;color:#0f172a;letter-spacing:0.35em;font-family:ui-monospace, SFMono-Regular, Menlo, monospace">${code}</p>
      </div>
      <p style="color:#475569;font-size:14px;margin-bottom:8px">This code expires in 10 minutes.</p>
      <p style="color:#ef4444;font-size:12px;font-weight:600">If you did not create this account, you can ignore this email.</p>
    </div>`,
    textContent: [
      'Verify your EnVault email',
      `Hi ${displayName}, enter this code in EnVault to verify your email address.`,
      `Verification code: ${code}`,
      'This code expires in 10 minutes.',
    ].join('\n'),
  });
}

export async function verifyEmailVerificationCode(userId: string, code: string) {
  const normalized = code.replace(/\D/g, '').slice(0, 6);
  if (normalized.length !== 6) {
    return { ok: false as const, reason: 'invalid' };
  }

  const record = await db.emailVerificationCode.findFirst({
    where: {
      userId,
      codeHash: hashCode(normalized),
      consumedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    return { ok: false as const, reason: 'invalid' };
  }

  if (record.expiresAt < new Date()) {
    return { ok: false as const, reason: 'expired' };
  }

  await db.$transaction([
    db.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }),
    db.user.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    }),
    db.emailVerificationCode.deleteMany({
      where: {
        userId,
        id: { not: record.id },
      },
    }),
  ]);

  return { ok: true as const };
}
