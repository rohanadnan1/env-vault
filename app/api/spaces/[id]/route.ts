import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCachedPrivateSpaceWorkspace, getPrivateSpaceWorkspaceUncached } from '@/lib/private-space-cache';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const fresh = searchParams.get('fresh') === '1';
  const workspace = fresh
    ? await getPrivateSpaceWorkspaceUncached(id, session.user.id)
    : await getCachedPrivateSpaceWorkspace(id, session.user.id);
  if (!workspace) {
    return NextResponse.json({ error: 'Private space not found' }, { status: 404 });
  }

  return NextResponse.json(workspace);
}
