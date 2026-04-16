import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import crypto from 'crypto';
import { Resend } from 'resend';

// Move Resend initialization inside the handler to prevent build-time errors

const CreateShareSchema = z.object({
  projectId: z.string().optional(),
  scopeType: z.enum(['PROJECT', 'ENV', 'FOLDER']),
  scopeId: z.string(),
  bundleEncrypted: z.string().min(1),
  bundleIv: z.string().min(1),
  shareSalt: z.string().min(1),
  expiresAt: z.string().optional().nullable(),
  singleUse: z.boolean().default(false),
  recipientEmail: z.string().email().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = CreateShareSchema.parse(body);

    let scopeName = '';
    // Verify ownership of the scope resource
    if (data.scopeType === 'PROJECT') {
      const project = await db.project.findFirst({
        where: { id: data.scopeId, userId: session.user.id }
      });
      if (!project) return NextResponse.json({ error: 'Unauthorized scope' }, { status: 403 });
      scopeName = project.name;
    } else if (data.scopeType === 'ENV') {
      const env = await db.environment.findFirst({
        where: { id: data.scopeId, project: { userId: session.user.id } }
      });
      if (!env) return NextResponse.json({ error: 'Unauthorized scope' }, { status: 403 });
      scopeName = env.name;
    } else if (data.scopeType === 'FOLDER') {
      const folder = await db.folder.findFirst({
        where: { id: data.scopeId, environment: { project: { userId: session.user.id } } }
      });
      if (!folder) return NextResponse.json({ error: 'Unauthorized scope' }, { status: 403 });
      scopeName = folder.name;
    }

    // Generate a secure access token
    const accessToken = crypto.randomBytes(32).toString('hex');
    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/share/${accessToken}`;

    const share = await db.share.create({
      data: {
        projectId: data.projectId || null,
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        bundleEncrypted: data.bundleEncrypted,
        bundleIv: data.bundleIv,
        shareSalt: data.shareSalt,
        accessToken,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        singleUse: data.singleUse,
        recipientEmail: data.recipientEmail,
        note: data.note,
        sharedById: session.user.id,
      },
    });

    // 7. Send email if recipient provided
    if (data.recipientEmail) {
      if (!process.env.RESEND_API_KEY) {
        console.error('RESEND_API_KEY is missing. Email not sent.');
      } else {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);
          await resend.emails.send({
          from: process.env.RESEND_FROM || 'EnVault <onboarding@resend.dev>',
          to: data.recipientEmail,
          subject: `Secure secrets shared with you: ${scopeName}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
              <h1 style="color: #4f46e5; font-size: 24px; font-weight: 800; margin-bottom: 8px;">EnVault Link</h1>
              <p style="color: #64748b; font-size: 16px; margin-bottom: 24px;">${session.user.name || 'A user'} has shared a secure secrets bundle with you.</p>
              
              <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin-bottom: 24px; border-left: 4px solid #4f46e5;">
                <p style="margin: 0; font-size: 14px; font-weight: 600; color: #1e293b;">Access Link:</p>
                <a href="${shareUrl}" style="color: #4f46e5; word-break: break-all; font-family: monospace; font-size: 13px;">${shareUrl}</a>
              </div>

              ${data.note ? `<p style="color: #475569; font-style: italic; font-size: 14px; margin-bottom: 24px;">"${data.note}"</p>` : ''}
              
              <p style="color: #ef4444; font-size: 12px; font-weight: 600;">IMPORTANT: You will need the passphrase provided separately by the sender to unlock these secrets.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="color: #94a3b8; font-size: 11px;">This is an automated message from EnVault Security.</p>
            </div>
          `
        });
      } catch (err) {
        console.error('Failed to send email:', err);
      }
    }
  }

  return NextResponse.json({
      id: share.id,
      accessToken,
      url: shareUrl
    }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    console.error(e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
