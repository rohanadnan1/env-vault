import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const COOLDOWN_DAYS = 10;

const EncryptedItem = z.object({ id: z.string(), valueEncrypted: z.string(), iv: z.string() });
const EncryptedFile = z.object({ id: z.string(), contentEncrypted: z.string(), iv: z.string() });
const EncryptedComment = z.object({ id: z.string(), content: z.string(), iv: z.string() });

const Schema = z.object({
  verifyId: z.string().min(1),
  newSalt: z.string().min(1),
  secrets: z.array(EncryptedItem),
  secretHistories: z.array(EncryptedItem),
  files: z.array(EncryptedFile),
  fileHistories: z.array(EncryptedFile),
  fileComments: z.array(EncryptedComment).default([]),
  // Orphaned history revisions that could not be decrypted (unrecoverable after salt
  // change) — deleted atomically so they don't remain as permanently corrupt blobs.
  deleteFileHistoryIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  try {
    const body = await req.json();
    const { verifyId, newSalt, secrets, secretHistories, files, fileHistories, fileComments, deleteFileHistoryIds } = Schema.parse(body);

    // Validate challenge
    const challenge = await db.loginChallenge.findUnique({ where: { id: verifyId } });
    if (
      !challenge ||
      challenge.userId !== userId ||
      challenge.deviceId !== 'rekey' ||
      challenge.verified ||
      challenge.expiresAt < new Date()
    ) {
      return NextResponse.json({ error: 'Verification expired — please try again' }, { status: 400 });
    }

    // Enforce cooldown
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { masterPasswordChangedAt: true },
    });
    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    if (user?.masterPasswordChangedAt && Date.now() - user.masterPasswordChangedAt.getTime() < cooldownMs) {
      return NextResponse.json({ error: 'Still within 10-day cooldown' }, { status: 429 });
    }

    // Mark challenge consumed
    await db.loginChallenge.update({ where: { id: verifyId }, data: { verified: true } });

    // Verify ownership of all items before writing
    const projects = await db.project.findMany({ where: { userId }, select: { id: true } });
    const projectIds = new Set(projects.map((p) => p.id));
    const environments = await db.environment.findMany({
      where: { projectId: { in: [...projectIds] } },
      select: { id: true },
    });
    const envIds = new Set(environments.map((e) => e.id));

    const ownedSecretIds = new Set(
      (await db.secret.findMany({ where: { environmentId: { in: [...envIds] } }, select: { id: true } }))
        .map((s) => s.id)
    );
    const ownedFileIds = new Set(
      (await db.vaultFile.findMany({ where: { environmentId: { in: [...envIds] } }, select: { id: true } }))
        .map((f) => f.id)
    );
    const ownedSecretHistoryIds = new Set(
      (await db.secretHistory.findMany({ where: { secret: { environmentId: { in: [...envIds] } } }, select: { id: true } }))
        .map((h) => h.id)
    );
    const ownedFileHistoryIds = new Set(
      (await db.fileHistory.findMany({ where: { file: { environmentId: { in: [...envIds] } } }, select: { id: true } }))
        .map((h) => h.id)
    );
    const ownedCommentIds = new Set(
      (await db.fileComment.findMany({ where: { file: { environmentId: { in: [...envIds] } } }, select: { id: true } }))
        .map((c) => c.id)
    );

    if (secrets.some((s) => !ownedSecretIds.has(s.id))) {
      return NextResponse.json({ error: 'Unauthorized secret in payload' }, { status: 403 });
    }
    if (files.some((f) => !ownedFileIds.has(f.id))) {
      return NextResponse.json({ error: 'Unauthorized file in payload' }, { status: 403 });
    }
    if (secretHistories.some((h) => !ownedSecretHistoryIds.has(h.id))) {
      return NextResponse.json({ error: 'Unauthorized secret history in payload' }, { status: 403 });
    }
    if (fileHistories.some((h) => !ownedFileHistoryIds.has(h.id))) {
      return NextResponse.json({ error: 'Unauthorized file history in payload' }, { status: 403 });
    }
    if (fileComments.some((c) => !ownedCommentIds.has(c.id))) {
      return NextResponse.json({ error: 'Unauthorized comment in payload' }, { status: 403 });
    }
    if (deleteFileHistoryIds.some((id) => !ownedFileHistoryIds.has(id))) {
      return NextResponse.json({ error: 'Unauthorized file history in delete list' }, { status: 403 });
    }

    // Atomic update — single transaction
    await db.$transaction([
      // Update vault salt + timestamps + clear 2FA unlock + clear recovery codes
      db.user.update({
        where: { id: userId },
        data: {
          vaultSalt: newSalt,
          masterPasswordChangedAt: new Date(),
          twoFAEncryptedMaster: null,
          twoFAMasterIv: null,
          twoFAUnlockToken: null,
          codesGeneratedAt: null,
        },
      }),
      // Delete all recovery codes (they encrypt the old master password)
      db.recoveryCode.deleteMany({ where: { userId } }),
      // Re-encrypt secrets
      ...secrets.map((s) =>
        db.secret.update({ where: { id: s.id }, data: { valueEncrypted: s.valueEncrypted, iv: s.iv } })
      ),
      ...secretHistories.map((h) =>
        db.secretHistory.update({ where: { id: h.id }, data: { valueEncrypted: h.valueEncrypted, iv: h.iv } })
      ),
      ...files.map((f) =>
        db.vaultFile.update({ where: { id: f.id }, data: { contentEncrypted: f.contentEncrypted, iv: f.iv } })
      ),
      ...fileHistories.map((h) =>
        db.fileHistory.update({ where: { id: h.id }, data: { contentEncrypted: h.contentEncrypted, iv: h.iv } })
      ),
      ...fileComments.map((c) =>
        db.fileComment.update({ where: { id: c.id }, data: { content: c.content, iv: c.iv } })
      ),
      // Delete orphan history revisions that could not be decrypted.
      ...(deleteFileHistoryIds.length > 0
        ? [db.fileHistory.deleteMany({ where: { id: { in: deleteFileHistoryIds } } })]
        : []),
    ]);

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    console.error('master-password/rekey error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
