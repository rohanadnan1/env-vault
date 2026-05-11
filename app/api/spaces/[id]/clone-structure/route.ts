import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { requireSpaceMembership } from '@/lib/private-space';
import { z } from 'zod';

const CloneStructureSchema = z.object({
  sourceMemberId: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: spaceId } = await params;
  const membership = await requireSpaceMembership(spaceId, session.user.id);
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 404 });

  let body: { sourceMemberId: string };
  try {
    body = CloneStructureSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'sourceMemberId is required' }, { status: 400 });
  }

  const sourceMember = await db.spaceMember.findFirst({
    where: { id: body.sourceMemberId, spaceId },
    select: { id: true },
  });
  if (!sourceMember) return NextResponse.json({ error: 'Source member not found' }, { status: 404 });

  const result = await db.$transaction(async (tx) => {
    const filesCreated: number[] = [];
    const secretsCreated: number[] = [];

    const existingNames = new Set(
      (await tx.userFile.findMany({
        where: { memberId: membership.id },
        select: { name: true, folderPath: true },
      })).map(f => `${f.folderPath}:${f.name}`)
    );

    const existingSecretKeys = new Set(
      (await tx.userSecret.findMany({
        where: { memberId: membership.id },
        select: { keyName: true, folderPath: true },
      })).map(s => `${s.folderPath}:${s.keyName}`)
    );

    const sourceFiles = await tx.userFile.findMany({
      where: { memberId: sourceMember.id },
      select: { name: true, folderPath: true },
    });

    for (const file of sourceFiles) {
      if (existingNames.has(`${file.folderPath}:${file.name}`)) continue;
      await tx.userFile.create({
        data: {
          memberId: membership.id,
          name: file.name,
          folderPath: file.folderPath,
          contentEncrypted: '',
          iv: '',
          workspaceMode: 'DRAFT',
        },
      });
      filesCreated.push(1);
    }

    const sourceSecrets = await tx.userSecret.findMany({
      where: { memberId: sourceMember.id },
      select: { keyName: true, folderPath: true },
    });

    for (const secret of sourceSecrets) {
      if (existingSecretKeys.has(`${secret.folderPath}:${secret.keyName}`)) continue;
      await tx.userSecret.create({
        data: {
          memberId: membership.id,
          keyName: secret.keyName,
          folderPath: secret.folderPath,
          valueEncrypted: '',
          iv: '',
          workspaceMode: 'DRAFT',
        },
      });
      secretsCreated.push(1);
    }

    return { filesCreated: filesCreated.length, secretsCreated: secretsCreated.length };
  });

  return NextResponse.json(result, { status: 201 });
}
