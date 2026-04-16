import { auth } from '@/lib/auth';
import { db, getFolderTree } from '@/lib/db';
import { notFound } from 'next/navigation';
import { VaultStructureView } from '@/components/vault/VaultStructureView';
import { ClientFolderSelector } from './ClientFolderSelector';
import { ClientFolderActions } from './ClientFolderActions';
import { Database } from 'lucide-react';

async function getData(projectId: string, envId: string, folderId?: string, userId?: string) {
  const project = await db.project.findUnique({
    where: { id: projectId, userId },
    include: { environments: true }
  });

  if (!project) return null;

  const environment = project.environments.find(e => e.id === envId);
  if (!environment) return null;

  const folderTree = await getFolderTree(envId, userId!);
  
  const secrets = await db.secret.findMany({
    where: {
      environmentId: envId,
      folderId: folderId || null
    },
    orderBy: { keyName: 'asc' }
  });

  const files = await db.vaultFile.findMany({
    where: {
      environmentId: envId,
      folderId: folderId || null
    },
    orderBy: { name: 'asc' }
  });

  let currentFolder = null;
  if (folderId) {
    currentFolder = await db.folder.findUnique({ where: { id: folderId } });
  }

  return { project, environment, folderTree, secrets, files, currentFolder };
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

  const { project, environment, folderTree, secrets, files, currentFolder } = data;

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
        environment={environment}
        currentFolder={currentFolder}
        secrets={secrets}
        files={files}
        envId={envId}
        folderId={folderId || null}
      />
    </div>
  );
}
