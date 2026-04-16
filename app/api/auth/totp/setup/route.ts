import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';

export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // 1. Generate a new secret
    const secret = generateSecret();
    
    // 2. Generate otpauth:// URI
    const otpauth = generateURI({
      secret,
      label: session.user.email,
      issuer: 'EnVault'
    });

    // 3. Generate QR code as Base64 image
    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    // Note: We don't save to DB yet. 
    // We send the secret back to the client so it can be verified in the next step.
    return NextResponse.json({
      secret,
      qrCodeUrl
    });
  } catch (error) {
    console.error('TOTP Setup Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
