import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateEnvironmentSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = CreateEnvironmentSchema.parse(body);

    // Verify the project belongs to the user
    const project = await db.project.findUnique({
      where: { id: data.projectId },
      select: { userId: true }
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Project not found or unauthorized' }, { status: 404 });
    }

    // Prevent duplicate environment names within the same project (case-insensitive)
    const duplicate = await db.environment.findFirst({
      where: {
        projectId: data.projectId,
        name: { equals: data.name, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `An environment named "${data.name}" already exists in this project.` },
        { status: 409 }
      );
    }

    const environment = await db.environment.create({
      data: {
        name: data.name,
        projectId: data.projectId,
      },
    });

    return NextResponse.json(environment, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
