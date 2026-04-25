import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

function isDatabaseUnavailable(error: unknown) {
  if (typeof error === 'object' && error && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'P1001') return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Can't reach database server") || message.includes('Timed out fetching a new connection');
}

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { totpSecret: true }
    });

    return NextResponse.json({ 
      enabled: !!user?.totpSecret 
    });
  } catch (error) {
    if (isDatabaseUnavailable(error)) {
      return NextResponse.json(
        { error: 'Database is temporarily unavailable. Please retry shortly.' },
        { status: 503 }
      );
    }

    console.error('TOTP Status Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
