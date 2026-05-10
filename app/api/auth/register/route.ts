import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { issueEmailVerificationCode } from '@/lib/auth/email-verification';

const registerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters')
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password } = registerSchema.parse(body);

    const existingUser = await db.user.findUnique({
      where: { email }
    });

    if (existingUser?.emailVerified) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = existingUser
      ? await db.user.update({
          where: { id: existingUser.id },
          data: {
            name,
            email,
            password: hashedPassword,
            emailVerified: null,
          },
        })
      : await db.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
          },
        });

    await issueEmailVerificationCode(user.id, user.email, user.name);

    return NextResponse.json(
      { success: true, userId: user.id, email: user.email, name: user.name },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError;
      return NextResponse.json({ error: zodError.issues[0].message }, { status: 400 });
    }
    console.error('[REGISTER_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error: ' + (error as Error).message }, { status: 500 });
  }
}
