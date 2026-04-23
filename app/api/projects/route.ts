import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateProjectSchema } from '@/lib/validations/schemas';
import { z } from 'zod';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const projects = await db.project.findMany({
    where: { userId: session.user.id },
    include: {
      _count: { select: { environments: true } },
      environments: {
        include: { _count: { select: { secrets: true } } }
      }
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = CreateProjectSchema.parse(body);

    // Prevent duplicate project names for the same user (case-insensitive)
    const duplicate = await db.project.findFirst({
      where: {
        userId: session.user.id,
        name: { equals: data.name, mode: 'insensitive' },
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `A project named "${data.name}" already exists.` },
        { status: 409 }
      );
    }

    const project = await db.project.create({
      data: { ...data, userId: session.user.id },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: (e as z.ZodError).issues[0].message }, { status: 400 });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
