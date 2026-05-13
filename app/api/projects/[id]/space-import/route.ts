import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  buildProjectFolderPathMap,
  buildProjectImportRelativePath,
} from '@/lib/project-import';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: projectId } = await params;

  try {
    const project = await db.project.findUnique({
      where: { id: projectId },
      include: {
        environments: {
          include: {
            folders: {
              select: {
                id: true,
                name: true,
                parentId: true,
              },
              orderBy: { createdAt: 'asc' },
            },
            secrets: {
              select: {
                id: true,
                keyName: true,
                valueEncrypted: true,
                iv: true,
                folderId: true,
              },
              orderBy: [{ folderId: 'asc' }, { keyName: 'asc' }],
            },
            vaultFiles: {
              select: {
                id: true,
                name: true,
                contentEncrypted: true,
                iv: true,
                folderId: true,
              },
              orderBy: [{ folderId: 'asc' }, { name: 'asc' }],
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const environments = project.environments.map((environment) => {
      const folderPathMap = buildProjectFolderPathMap(environment.folders);

      return {
        id: environment.id,
        name: environment.name,
        folders: environment.folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
          relativePath: buildProjectImportRelativePath(
            environment.name,
            folderPathMap.get(folder.id) ?? '/'
          ),
        })),
        files: environment.vaultFiles.map((file) => ({
          id: file.id,
          name: file.name,
          contentEncrypted: file.contentEncrypted,
          iv: file.iv,
          relativeFolderPath: buildProjectImportRelativePath(
            environment.name,
            file.folderId ? (folderPathMap.get(file.folderId) ?? '/') : '/'
          ),
          aadScopeId: file.folderId ?? environment.id,
          environmentId: environment.id,
        })),
        secrets: environment.secrets.map((secret) => ({
          id: secret.id,
          keyName: secret.keyName,
          valueEncrypted: secret.valueEncrypted,
          iv: secret.iv,
          relativeFolderPath: buildProjectImportRelativePath(
            environment.name,
            secret.folderId ? (folderPathMap.get(secret.folderId) ?? '/') : '/'
          ),
          aadScopeId: secret.folderId ?? environment.id,
          environmentId: environment.id,
        })),
      };
    });

    const summary = environments.reduce(
      (acc, environment) => ({
        environmentCount: acc.environmentCount + 1,
        folderCount: acc.folderCount + environment.folders.length,
        fileCount: acc.fileCount + environment.files.length,
        secretCount: acc.secretCount + environment.secrets.length,
      }),
      {
        environmentCount: 0,
        folderCount: 0,
        fileCount: 0,
        secretCount: 0,
      }
    );

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
      },
      summary,
      environments,
    });
  } catch (error) {
    console.error('[PROJECT_SPACE_IMPORT_SNAPSHOT]', error);
    return NextResponse.json({ error: 'Could not prepare project import' }, { status: 500 });
  }
}
