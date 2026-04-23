import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const CreateCommentSchema = z.object({
  content: z.string().min(1).max(8000), // encrypted content can be longer than plaintext
  isEncrypted: z.boolean().default(false),
  iv: z.string().optional(),
});

async function checkFileOwnership(id: string, userId: string) {
  const file = await db.vaultFile.findUnique({
    where: { id },
    include: {
      environment: { include: { project: { select: { userId: true } } } },
    },
  });
  if (!file || file.environment.project.userId !== userId) return null;
  return file;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const file = await checkFileOwnership(id, session.user.id);
  if (!file) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  const comments = await db.fileComment.findMany({
    where: { fileId: id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, content: true, iv: true, isEncrypted: true, createdAt: true },
  });

  return NextResponse.json(comments);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const file = await checkFileOwnership(id, session.user.id);
  if (!file) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  try {
    const body = await req.json();
    const data = CreateCommentSchema.parse(body);

    const comment = await db.fileComment.create({
      data: {
        fileId: id,
        content: data.content,
        isEncrypted: data.isEncrypted,
        iv: data.iv ?? null,
      },
      select: { id: true, content: true, iv: true, isEncrypted: true, createdAt: true },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
