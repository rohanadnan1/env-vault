import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const secrets = await db.secret.findMany({
      where: {
        environment: {
          project: {
            userId: session.user.id
          }
        },
        keyName: {
          contains: q
        }
      },
      select: {
        id: true,
        keyName: true,
        environmentId: true,
        environment: {
          select: {
            id: true,
            name: true,
            project: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        folder: {
          select: {
            id: true,
            name: true
          }
        }
      },
      take: 10,
      orderBy: {
        updatedAt: 'desc'
      }
    });

    return NextResponse.json(secrets);
  } catch (error) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
