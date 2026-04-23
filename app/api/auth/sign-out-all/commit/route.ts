import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { encode, decode } from '@auth/core/jwt';
import { cookies } from 'next/headers';
import { z } from 'zod';

const Schema = z.object({
  verifyId: z.string().min(1),
  keepCurrentDevice: z.boolean(),
});

const SECRET = process.env.AUTH_SECRET!;
// NextAuth v5 (authjs) default session cookie names
const COOKIE_NAME =
  process.env.NODE_ENV === 'production'
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { verifyId, keepCurrentDevice } = Schema.parse(body);
    const userId = session.user.id;

    // Validate the short-lived verify token issued by the prepare step
    const challenge = await db.loginChallenge.findUnique({
      where: { id: verifyId },
    });

    if (
      !challenge ||
      challenge.userId !== userId ||
      challenge.deviceId !== 'sign-out-all' ||
      challenge.verified ||
      challenge.expiresAt < new Date()
    ) {
      return NextResponse.json({ error: 'Verification expired — please try again' }, { status: 400 });
    }

    // Mark the challenge consumed
    await db.loginChallenge.update({ where: { id: verifyId }, data: { verified: true } });

    // Increment sessionVersion — invalidates every existing JWT on other devices
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { sessionVersion: { increment: 1 } },
      select: { sessionVersion: true },
    });

    // Clear trusted devices so every device must re-verify on next login
    await db.trustedDevice.deleteMany({ where: { userId } });

    if (!keepCurrentDevice) {
      return NextResponse.json({ status: 'ok', kept: false });
    }

    // Re-issue the current device's JWT with the new sessionVersion so it
    // stays valid without needing a client-side update() call.
    const cookieStore = await cookies();
    const oldTokenStr = cookieStore.get(COOKIE_NAME)?.value;

    if (oldTokenStr) {
      const decoded = await decode({ token: oldTokenStr, secret: SECRET, salt: COOKIE_NAME });

      if (decoded) {
        const now = Math.floor(Date.now() / 1000);
        const remainingSeconds = typeof decoded.exp === 'number'
          ? decoded.exp - now
          : 30 * 24 * 60 * 60;

        const newTokenStr = await encode({
          token: { ...decoded, sessionVersion: updatedUser.sessionVersion },
          secret: SECRET,
          salt: COOKIE_NAME,
          maxAge: remainingSeconds > 0 ? remainingSeconds : 30 * 24 * 60 * 60,
        });

        const response = NextResponse.json({ status: 'ok', kept: true });
        response.cookies.set(COOKIE_NAME, newTokenStr, {
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          secure: process.env.NODE_ENV === 'production',
          maxAge: remainingSeconds > 0 ? remainingSeconds : 30 * 24 * 60 * 60,
        });
        return response;
      }
    }

    // Fallback: could not re-issue — caller should sign out and re-login
    return NextResponse.json({ status: 'ok', kept: false, relogin: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    console.error('sign-out-all/commit error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
