import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const UpdateVaultFileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  contentEncrypted: z.string().min(1).optional(),
  iv: z.string().min(1).optional(),
  mimeType: z.string().optional(),
});

async function checkFileOwnership(id: string, userId: string) {
  const file = await db.vaultFile.findUnique({
    where: { id },
    include: {
      environment: {
        include: {
          project: {
            select: { userId: true }
          }
        }
      }
    }
  });

  if (!file || file.environment.project.userId !== userId) {
    return null;
  }
  return file;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const file = await checkFileOwnership(id, session.user.id);
  if (!file) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  return NextResponse.json(file);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const file = await checkFileOwnership(id, session.user.id);
  if (!file) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  try {
    const body = await req.json();
    const data = UpdateVaultFileSchema.parse(body);

    const updated = await db.vaultFile.update({
      where: { id },
      data,
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const file = await checkFileOwnership(id, session.user.id);
  if (!file) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  await db.vaultFile.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
