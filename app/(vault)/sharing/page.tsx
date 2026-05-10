import { auth } from '@/lib/auth';

import { SharingPageContent } from './SharingPageContent';

export default async function SharingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { tab } = await searchParams;
  const defaultTab = tab || 'sent';
  return <SharingPageContent userId={session.user.id} userName={session.user.name} defaultTab={defaultTab} />;
}
