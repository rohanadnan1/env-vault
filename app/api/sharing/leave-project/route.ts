import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sessionEmail = session.user.email?.toLowerCase();

  let projectId: string;
  try {
    const body = await req.json();
    projectId = body.projectId;
    if (!projectId) throw new Error();
  } catch {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  try {
    const result = await db.shareInvitation.updateMany({
      where: {
        projectId,
        status: { not: 'REVOKED' },
        OR: [
          { recipientId: session.user.id },
          ...(sessionEmail ? [{ recipientEmail: { equals: sessionEmail, mode: 'insensitive' as const } }] : []),
        ],
      },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    return NextResponse.json({ success: true, removed: result.count });
  } catch (e) {
    console.error('[SHARING_LEAVE_PROJECT]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
