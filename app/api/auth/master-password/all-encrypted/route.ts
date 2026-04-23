import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// Returns every encrypted blob the user owns so the client can re-encrypt them.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;

  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { vaultSalt: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const projects = await db.project.findMany({
      where: { userId },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);

    const environments = await db.environment.findMany({
      where: { projectId: { in: projectIds } },
      select: { id: true },
    });
    const envIds = environments.map((e) => e.id);

    const [secrets, secretHistories, files, fileHistories] = await Promise.all([
      db.secret.findMany({
        where: { environmentId: { in: envIds } },
        select: { id: true, valueEncrypted: true, iv: true },
      }),
      db.secretHistory.findMany({
        where: { secret: { environmentId: { in: envIds } } },
        select: { id: true, valueEncrypted: true, iv: true },
      }),
      db.vaultFile.findMany({
        where: { environmentId: { in: envIds } },
        select: { id: true, contentEncrypted: true, iv: true },
      }),
      db.fileHistory.findMany({
        where: { file: { environmentId: { in: envIds } } },
        select: { id: true, contentEncrypted: true, iv: true },
      }),
    ]);

    return NextResponse.json({
      currentSalt: user.vaultSalt,
      secrets,
      secretHistories,
      files,
      fileHistories,
    });
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
