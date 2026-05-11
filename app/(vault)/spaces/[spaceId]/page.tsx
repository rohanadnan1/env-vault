import { auth } from '@/lib/auth';
import { getCachedPrivateSpaceMergeRequests, getCachedPrivateSpaceWorkspace } from '@/lib/private-space-cache';
import { notFound, redirect } from 'next/navigation';
import { PrivateSpaceWorkspace } from '@/components/private-spaces/PrivateSpaceWorkspace';

export default async function PrivateSpacePage({ params }: { params: Promise<{ spaceId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }

  const { spaceId } = await params;
  const [initialSpace, initialMergeRequests] = await Promise.all([
    getCachedPrivateSpaceWorkspace(spaceId, session.user.id),
    getCachedPrivateSpaceMergeRequests(spaceId, session.user.id),
  ]);

  if (!initialSpace || !initialMergeRequests) {
    notFound();
  }

  return (
    <PrivateSpaceWorkspace
      spaceId={spaceId}
      userId={session.user.id}
      initialSpace={initialSpace}
      initialMergeRequests={initialMergeRequests}
    />
  );
}
