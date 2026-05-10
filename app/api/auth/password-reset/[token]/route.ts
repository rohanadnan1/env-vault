import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumePasswordResetToken, validatePasswordResetToken } from '@/lib/auth/password-reset';

const Schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function GET(
  _: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const result = await validatePasswordResetToken(token);

    if (!result.ok) {
      return NextResponse.json(
        {
          valid: false,
          reason: result.reason,
          error: result.reason === 'expired' ? 'This reset link has expired.' : 'This reset link is invalid.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: true,
      email: result.record.user.email,
      name: result.record.user.name,
    });
  } catch (error) {
    console.error('password-reset/[token] GET error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await req.json();
    const { password } = Schema.parse(body);

    const result = await consumePasswordResetToken(token, password);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.reason === 'expired'
            ? 'This reset link has expired. Request a new one.'
            : 'This reset link is invalid or has already been used.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
    }
    console.error('password-reset/[token] POST error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
