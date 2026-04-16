import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateSecretSchema } from '@/lib/validations/schemas';
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

    // Verify folder belongs to environment if provided
    if (data.folderId) {
      const folder = await db.folder.findUnique({
        where: { id: data.folderId },
        select: { environmentId: true }
      });
      if (!folder || folder.environmentId !== data.environmentId) {
        return NextResponse.json({ error: 'Invalid folder' }, { status: 400 });
      }
    }

    const secret = await db.secret.create({
      data: {
        keyName: data.keyName,
        valueEncrypted: data.valueEncrypted,
        iv: data.iv,
        environmentId: data.environmentId,
        folderId: data.folderId,
        tags: data.tags ? data.tags.join(',') : '',
      },
    });

    return NextResponse.json(secret, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
