import { auth } from '@/lib/auth';
import { db, buildFolderTree, buildFolderAncestors } from '@/lib/db';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { VaultStructureView } from '@/components/vault/VaultStructureView';
import { ClientFolderSelector } from './ClientFolderSelector';
import { ClientFolderActions } from './ClientFolderActions';
import { AlertTriangle, Database } from 'lucide-react';

const getProject = cache(async (projectId: string, userId: string) => {
  try {
    const project = await db.project.findUnique({
      where: { id: projectId, userId },
      include: { environments: true }
    });

    return { project, loadError: false } as const;
  } catch (error) {
    console.error('[ENV_PAGE_PROJECT]', error);
    return { project: null, loadError: true } as const;
  }
});

async function getData(projectId: string, envId: string, folderId?: string, userId?: string) {
  if (!userId) return null;

  const projectResult = await getProject(projectId, userId);

  if (projectResult.loadError) {
    return { status: 'error' as const };
  }

  const project = projectResult.project;
  if (!project) {
    return { status: 'not-found' as const };
  }

  const environment = project.environments.find(e => e.id === envId);
  if (!environment) {
    return { status: 'not-found' as const };
  }

  let allFolders: { id: string; name: string; environmentId: string; parentId: string | null; createdAt: Date; updatedAt: Date }[] = [];
  let secrets: { id: string; keyName: string; valueEncrypted: string; iv: string; tags: string; environmentId: string; folderId: string | null; createdAt: Date; updatedAt: Date }[] = [];
  let files: { id: string; name: string; contentEncrypted: string; iv: string; mimeType: string; createdAt: Date; updatedAt: Date; pinnedAt: Date | null; _count: { comments: number } }[] = [];
  let loadError = false;

  try {
    // Group reads in one transaction to reduce concurrent connection pressure.
    const [foldersRes, secretsRes, filesRes] = await db.$transaction([
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
        orderBy: { name: 'asc' },
        select: { id: true, name: true, contentEncrypted: true, iv: true, mimeType: true, createdAt: true, updatedAt: true, pinnedAt: true, _count: { select: { comments: true } } },
      }),
    ]);

    allFolders = foldersRes;
    secrets = secretsRes;
    files = filesRes;
  } catch (error) {
    loadError = true;
    console.error('[ENV_PAGE_DATA]', error);
  }

  const folderTree = buildFolderTree(allFolders);
  const breadcrumbs = folderId ? buildFolderAncestors(folderId, allFolders) : [];
  const currentFolder = folderId ? allFolders.find((f) => f.id === folderId) ?? null : null;

  return {
    status: 'ok' as const,
    project,
    environment,
    folderTree,
    secrets,
    files,
    currentFolder,
    breadcrumbs,
    loadError,
  };
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

  if (!data || data.status === 'not-found') {
    notFound();
  }

  if (data.status === 'error') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-base font-semibold">Temporary server issue</h2>
            <p className="text-sm mt-1 text-amber-800">
              We could not load this vault folder right now. Please retry in a few seconds.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const { project, environment, folderTree, secrets, files, currentFolder, breadcrumbs, loadError } = data;

  return (
    <div className="space-y-3">
      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Some vault data could not be loaded right now. Your master key state remains intact; retry in a few seconds.
        </div>
      )}

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
    </div>
  );
}
