import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateSecretSchema } from '@/lib/validations/schemas';
import { resolveSecretTargetFolder } from '@/lib/variables-folder';
import { z } from 'zod';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const environmentId = searchParams.get('envId');
  const folderId = searchParams.get('folderId'); // optional

  if (!environmentId) {
    return NextResponse.json({ error: 'Environment ID is required' }, { status: 400 });
  }

  // Verify ownership of the environment
  const env = await db.environment.findUnique({
    where: { id: environmentId },
    include: { project: { select: { userId: true } } }
  });

  if (!env || env.project.userId !== session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const secrets = await db.secret.findMany({
    where: {
      environmentId,
      folderId: folderId || null,
    },
    orderBy: { keyName: 'asc' }
  });

  return NextResponse.json(secrets);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = CreateSecretSchema.parse(body);

    // Verify ownership of environment
    const env = await db.environment.findUnique({
      where: { id: data.environmentId },
      include: { project: { select: { userId: true } } }
    });

    if (!env || env.project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const secret = await db.$transaction(async (tx) => {
      const placement = await resolveSecretTargetFolder(tx, data.environmentId, data.folderId ?? null);

      const created = await tx.secret.create({
        data: {
          keyName: data.keyName,
          valueEncrypted: data.valueEncrypted,
          iv: data.iv,
          environmentId: data.environmentId,
          folderId: placement.targetFolderId,
          tags: data.tags ? data.tags.join(',') : '',
        },
      });

      // Revision 1 always captures the initial variable state.
      await tx.secretHistory.create({
        data: {
          secretId: created.id,
          valueEncrypted: data.valueEncrypted,
          iv: data.iv,
          revisionNumber: 1,
          previousHistoryId: null,
        }
      });

      return {
        ...created,
        migratedToVariablesFolder: placement.migratedToVariablesFolder,
        autoCreatedVariablesFolder: placement.autoCreatedVariablesFolder,
      };
    });

    return NextResponse.json(secret, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message === 'Invalid folder') {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof z.ZodError) return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
