import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

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

    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await db.user.create({
      data: {
        name,
        email,
        password: hashedPassword
      }
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError;
      return NextResponse.json({ error: zodError.issues[0].message }, { status: 400 });
    }
    console.error('[REGISTER_ERROR]', error);
    return NextResponse.json({ error: 'Internal server error: ' + (error as Error).message }, { status: 500 });
  }
}
