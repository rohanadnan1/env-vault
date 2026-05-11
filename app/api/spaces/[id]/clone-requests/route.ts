import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireSpaceMembership } from '@/lib/private-space';
import { z } from 'zod';

const CreateCloneRequestSchema = z.object({
  sourceMemberId: z.string().min(1),
  type: z.enum(['STRUCTURE', 'CONTENT']).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: spaceId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 404 });

  const [sent, received] = await Promise.all([
    db.peerCloneRequest.findMany({
      where: { spaceId, requesterId: membership.id },
      include: {
        source: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.peerCloneRequest.findMany({
      where: { spaceId, sourceId: membership.id, status: 'PENDING' },
      include: {
        requester: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({ sent, received });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id: spaceId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 404 });

  let body: { sourceMemberId: string; type?: 'STRUCTURE' | 'CONTENT' };
  try {
    body = CreateCloneRequestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'sourceMemberId is required' }, { status: 400 });
  }

  const source = await db.spaceMember.findFirst({
    where: { id: body.sourceMemberId, spaceId },
    select: { id: true },
  });
  if (!source) return NextResponse.json({ error: 'Source member not found' }, { status: 404 });
  if (source.id === membership.id) return NextResponse.json({ error: 'Cannot request from yourself' }, { status: 400 });

  const existing = await db.peerCloneRequest.findFirst({
    where: { spaceId, requesterId: membership.id, sourceId: source.id, status: 'PENDING' },
  });
  if (existing) return NextResponse.json({ error: 'A pending request already exists' }, { status: 409 });

  const request = await db.peerCloneRequest.create({
    data: {
      spaceId,
      requesterId: membership.id,
      sourceId: source.id,
      type: body.type || 'CONTENT',
    },
  });

  return NextResponse.json(request, { status: 201 });
}
