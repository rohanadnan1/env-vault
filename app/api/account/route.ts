import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Delete user - all relations (Project, Share, etc.) have onDelete: Cascade in schema
    await db.user.delete({
      where: { id: session.user.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Account Deletion Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
