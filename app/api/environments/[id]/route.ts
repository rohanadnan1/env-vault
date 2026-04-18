import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const UpdateEnvironmentSchema = z.object({
  name: z.string().min(1).max(30),
});

async function checkEnvironmentOwnership(id: string, userId: string) {
  const environment = await db.environment.findUnique({
    where: { id },
    include: {
      project: {
        select: { userId: true }
      }
    }
  });

  if (!environment || environment.project.userId !== userId) {
    return null;
  }
  return environment;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const environment = await checkEnvironmentOwnership(id, session.user.id);
  if (!environment) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  return NextResponse.json(environment);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const environment = await checkEnvironmentOwnership(id, session.user.id);
  if (!environment) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  try {
    const body = await req.json();
    const { name } = UpdateEnvironmentSchema.parse(body);

    const updated = await db.environment.update({
      where: { id },
      data: { name }
    });

    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const environment = await checkEnvironmentOwnership(id, session.user.id);
  if (!environment) return NextResponse.json({ error: 'Not found or unauthorized' }, { status: 404 });

  await db.environment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
