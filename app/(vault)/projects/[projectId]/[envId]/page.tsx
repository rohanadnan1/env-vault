import { auth } from '@/lib/auth';
import { db, buildFolderTree, buildFolderAncestors } from '@/lib/db';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { VaultStructureView } from '@/components/vault/VaultStructureView';
import { ClientFolderSelector } from './ClientFolderSelector';
import { ClientFolderActions } from './ClientFolderActions';
import { Database } from 'lucide-react';

const getProject = cache(async (projectId: string, userId: string) => {
  return await db.project.findUnique({
    where: { id: projectId, userId },
    include: { environments: true }
  });
});

async function getData(projectId: string, envId: string, folderId?: string, userId?: string) {
  if (!userId) return null;

  const project = await getProject(projectId, userId);
  if (!project) return null;

  const environment = project.environments.find(e => e.id === envId);
  if (!environment) return null;

  // Execute all heavy operations in parallel
  const [allFolders, secrets, files, currentFolder] = await Promise.all([
    db.folder.findMany({
      where: { environmentId: envId },
      orderBy: { createdAt: 'asc' }
    }),
    db.secret.findMany({
      where: { environmentId: envId, folderId: folderId || null },
      orderBy: { keyName: 'asc' }
    }),
    db.vaultFile.findMany({
      where: { environmentId: envId, folderId: folderId || null },
      orderBy: { name: 'asc' }
    }),
    folderId ? db.folder.findUnique({ where: { id: folderId } }) : Promise.resolve(null)
  ]);

  const folderTree = buildFolderTree(allFolders);
  const breadcrumbs = folderId ? buildFolderAncestors(folderId, allFolders) : [];

  return { project, environment, folderTree, secrets, files, currentFolder, breadcrumbs };
}

export default async function EnvPage({ 
  params 
}: { 
  params: Promise<{ projectId: string; envId: string; folderId?: string }> 
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { projectId, envId, folderId } = await params;
  const data = await getData(projectId, envId, folderId, session.user.id);

  if (!data) notFound();

  const { project, environment, folderTree, secrets, files, currentFolder, breadcrumbs } = data;

  return (
    <div className="h-[calc(100vh-140px)] flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* Pane 1: Folders Sidebar */}
      <aside className="w-64 border-r border-slate-100 bg-slate-50/30 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Database className="w-3.5 h-3.5" />
            Structure
          </span>
          <ClientFolderActions environmentId={envId} />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <ClientFolderSelector 
            folderTree={folderTree} 
            activeFolderId={folderId} 
            projectId={projectId}
            envId={envId}
          />
        </div>
      </aside>

      {/* Pane 2: Main Content Area (Now a Client Component for Search) */}
      <VaultStructureView 
        project={project}
        projectId={projectId}
        environment={environment}
        envId={envId}
        breadcrumbs={breadcrumbs}
        currentFolder={currentFolder}
        secrets={secrets}
        files={files}
        folderId={folderId || null}
      />
    </div>
  );
}
