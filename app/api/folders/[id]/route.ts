import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const UpdateFolderSchema = z.object({
  name: z.string().min(1).max(100),
});

async function checkFolderOwnership(id: string, userId: string) {
  const folder = await db.folder.findUnique({
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

  if (!folder || folder.environment.project.userId !== userId) {
    return null;
  }
  return folder;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const folder = await checkFolderOwnership(id, session.user.id);
  if (!folder) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  return NextResponse.json(folder);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const folder = await checkFolderOwnership(id, session.user.id);
  if (!folder) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  try {
    const body = await req.json();
    const { name } = UpdateFolderSchema.parse(body);

    const updated = await db.folder.update({
      where: { id },
      data: { name }
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

  const folder = await checkFolderOwnership(id, session.user.id);
  if (!folder) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  await db.folder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
