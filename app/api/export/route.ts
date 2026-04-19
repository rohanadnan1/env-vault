import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/export
 * Query params:
 *  - scope: 'folder' | 'environment' | 'project'
 *  - folderId: (when scope=folder)
 *  - environmentId: (when scope=folder|environment)
 *  - projectId: (when scope=project)
 *
 * Returns a structured JSON payload ready for client-side decryption:
 * {
 *   scope: string,
 *   environments: [{
 *     id, name,
 *     folders: [{ id, name, secrets: [{id, keyName, valueEncrypted, iv}], vaultFiles: [{id, name, contentEncrypted, iv}] }],
 *     rootSecrets: [{id, keyName, valueEncrypted, iv}],
 *     rootFiles: [{id, name, contentEncrypted, iv}]
 *   }]
 * }
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const scope = searchParams.get('scope'); // 'folder' | 'environment' | 'project'
  const folderId = searchParams.get('folderId');
  const environmentId = searchParams.get('environmentId');
  const projectId = searchParams.get('projectId');

  try {
    if (scope === 'folder') {
      if (!environmentId || !folderId) {
        return NextResponse.json({ error: 'environmentId and folderId required' }, { status: 400 });
      }

      // Verify ownership
      const env = await db.environment.findUnique({
        where: { id: environmentId },
        include: { project: { select: { userId: true, name: true } } },
      });
      if (!env || env.project.userId !== session.user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      const folder = await db.folder.findUnique({
        where: { id: folderId },
        include: {
          secrets: { orderBy: { keyName: 'asc' }, select: { id: true, keyName: true, valueEncrypted: true, iv: true } },
          vaultFiles: { orderBy: { name: 'asc' }, select: { id: true, name: true, contentEncrypted: true, iv: true } },
        },
      });
      if (!folder || folder.environmentId !== environmentId) {
        return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      }

      return NextResponse.json({
        scope: 'folder',
        projectName: env.project.name,
        environments: [{
          id: env.id,
          name: env.name,
          folders: [{ id: folder.id, name: folder.name, secrets: folder.secrets, vaultFiles: folder.vaultFiles }],
          rootSecrets: [],
          rootFiles: [],
        }],
      });
    }

    if (scope === 'environment') {
      if (!environmentId) {
        return NextResponse.json({ error: 'environmentId required' }, { status: 400 });
      }

      // Verify ownership
      const env = await db.environment.findUnique({
        where: { id: environmentId },
        include: {
          project: { select: { userId: true, name: true } },
          folders: {
            include: {
              secrets: { orderBy: { keyName: 'asc' }, select: { id: true, keyName: true, valueEncrypted: true, iv: true } },
              vaultFiles: { orderBy: { name: 'asc' }, select: { id: true, name: true, contentEncrypted: true, iv: true } },
            },
            orderBy: { name: 'asc' },
          },
          secrets: {
            where: { folderId: null },
            orderBy: { keyName: 'asc' },
            select: { id: true, keyName: true, valueEncrypted: true, iv: true },
          },
          vaultFiles: {
            where: { folderId: null },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, contentEncrypted: true, iv: true },
          },
        },
      });

      if (!env || env.project.userId !== session.user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      return NextResponse.json({
        scope: 'environment',
        projectName: env.project.name,
        environments: [{
          id: env.id,
          name: env.name,
          folders: env.folders.map(f => ({ id: f.id, name: f.name, secrets: f.secrets, vaultFiles: f.vaultFiles })),
          rootSecrets: env.secrets,
          rootFiles: env.vaultFiles,
        }],
      });
    }

    if (scope === 'project') {
      if (!projectId) {
        return NextResponse.json({ error: 'projectId required' }, { status: 400 });
      }

      const project = await db.project.findUnique({
        where: { id: projectId },
        include: {
          environments: {
            include: {
              folders: {
                include: {
                  secrets: { orderBy: { keyName: 'asc' }, select: { id: true, keyName: true, valueEncrypted: true, iv: true } },
                  vaultFiles: { orderBy: { name: 'asc' }, select: { id: true, name: true, contentEncrypted: true, iv: true, folderId: true } },
                },
                orderBy: { name: 'asc' },
              },
              secrets: {
                where: { folderId: null },
                orderBy: { keyName: 'asc' },
                select: { id: true, keyName: true, valueEncrypted: true, iv: true },
              },
              vaultFiles: {
                where: { folderId: null },
                orderBy: { name: 'asc' },
                select: { id: true, name: true, contentEncrypted: true, iv: true, folderId: true },
              },
            },
            orderBy: { name: 'asc' },
          },
        },
      });

      if (!project || project.userId !== session.user.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }

      return NextResponse.json({
        scope: 'project',
        projectName: project.name,
        environments: project.environments.map(env => ({
          id: env.id,
          name: env.name,
          folders: env.folders.map(f => ({ id: f.id, name: f.name, secrets: f.secrets, vaultFiles: f.vaultFiles })),
          rootSecrets: env.secrets,
          rootFiles: env.vaultFiles,
        })),
      });
    }

    return NextResponse.json({ error: 'Invalid scope. Use folder, environment, or project.' }, { status: 400 });
  } catch (err) {
    console.error('[EXPORT_ERROR]', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
