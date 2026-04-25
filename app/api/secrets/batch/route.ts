import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { resolveSecretTargetFolder } from '@/lib/variables-folder';
import { z } from 'zod';

const BatchImportSchema = z.object({
  environmentId: z.string().cuid(),
  folderId: z.string().cuid().optional().nullable(),
  upsertOnConflict: z.boolean().default(false),
  items: z
    .array(
      z.object({
        keyName: z.string().regex(/^[A-Za-z0-9_]+$/, 'Only letters, numbers, and underscores').max(200),
        valueEncrypted: z.string().min(1),
        iv: z.string().min(1),
      })
    )
    .min(1)
    .max(500),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = BatchImportSchema.parse(body);

    const env = await db.environment.findUnique({
      where: { id: data.environmentId },
      include: { project: { select: { userId: true } } },
    });

    if (!env || env.project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Resolve target folder once outside any transaction
    const placement = await resolveSecretTargetFolder(db, data.environmentId, data.folderId ?? null);

    // Batch-read all existing secrets + their latest history revision in one round-trip
    const existingSecrets = await db.secret.findMany({
      where: {
        environmentId: data.environmentId,
        folderId: placement.targetFolderId,
        keyName: { in: data.items.map((i) => i.keyName) },
      },
      select: {
        id: true,
        keyName: true,
        history: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          select: { id: true, revisionNumber: true },
        },
      },
    });

    const existingMap = new Map(existingSecrets.map((s) => [s.keyName, s]));

    type ResultRow = { keyName: string; action: 'created' | 'updated' | 'conflict' };
    const results: ResultRow[] = [];

    // Build a flat list of Prisma operations — no interactive transaction, no held connection.
    // We pre-generate IDs so secret + its history record can be built without awaiting each other.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops: any[] = [];

    for (const item of data.items) {
      const existing = existingMap.get(item.keyName);

      if (existing) {
        if (!data.upsertOnConflict) {
          results.push({ keyName: item.keyName, action: 'conflict' });
          continue;
        }

        const latestHistory = existing.history[0] ?? null;
        ops.push(
          db.secret.update({
            where: { id: existing.id },
            data: { valueEncrypted: item.valueEncrypted, iv: item.iv },
          }),
          db.secretHistory.create({
            data: {
              secretId: existing.id,
              valueEncrypted: item.valueEncrypted,
              iv: item.iv,
              revisionNumber: (latestHistory?.revisionNumber ?? 0) + 1,
              previousHistoryId: latestHistory?.id ?? null,
            },
          })
        );
        results.push({ keyName: item.keyName, action: 'updated' });
      } else {
        // Pre-generate ID so the history record can reference it without awaiting the create
        const secretId = crypto.randomUUID();
        ops.push(
          db.secret.create({
            data: {
              id: secretId,
              keyName: item.keyName,
              valueEncrypted: item.valueEncrypted,
              iv: item.iv,
              environmentId: data.environmentId,
              folderId: placement.targetFolderId,
              tags: '',
            },
          }),
          db.secretHistory.create({
            data: {
              secretId,
              valueEncrypted: item.valueEncrypted,
              iv: item.iv,
              revisionNumber: 1,
              previousHistoryId: null,
            },
          })
        );
        results.push({ keyName: item.keyName, action: 'created' });
      }
    }

    // Static (array) transaction: Prisma sends all ops in one batch — no connection
    // held open between statements, no interactive-transaction timeout.
    if (ops.length > 0) {
      await db.$transaction(ops);
    }

    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    }
    if (e instanceof Error && e.message === 'Invalid folder') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    console.error('batch import error', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
