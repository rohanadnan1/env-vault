import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Sidebar } from '@/components/layout/Sidebar';
import { Navbar } from '@/components/layout/Navbar';
import { VaultClientWrapper } from '@/components/vault/VaultClientWrapper';
import { redirect } from 'next/navigation';

export default async function VaultLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  // Fetch projects for the sidebar
  const projects = await db.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      emoji: true,
      color: true,
    }
  });

  return (
    <div className="flex h-screen bg-slate-50">
      <VaultClientWrapper>
        <Sidebar projects={projects} />
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <Navbar />
          <main className="flex-1 overflow-auto bg-slate-50 p-6">
            {children}
          </main>
        </div>
      </VaultClientWrapper>
    </div>
  );
}
