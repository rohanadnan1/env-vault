import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  const { invitationId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const invitation = await db.shareInvitation.findFirst({
      where: { id: invitationId, ownerId: session.user.id }
    });
    if (!invitation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const downloads = await db.shareDownloadLog.findMany({
      where: { invitationId },
      include: {
        user: { select: { name: true, email: true } }
      },
      orderBy: { downloadedAt: 'desc' }
    });

    return NextResponse.json(downloads.map(d => ({
      id: d.id,
      fileName: d.fileName,
      fileType: d.fileType,
      ownerNotified: d.ownerNotified,
      downloadedAt: d.downloadedAt.toISOString(),
      user: d.user,
    })));
  } catch (e) {
    console.error('[SHARING_DOWNLOADS]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
