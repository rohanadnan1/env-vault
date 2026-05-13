import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import crypto from 'crypto';
import { CreateShareInvitationSchema } from '@/lib/validations/schemas';
import { sharingInviteLimiter } from '@/lib/ratelimit';
import { getUserLabel } from '@/lib/username';
import {
  getEmailBaseUrl,
  sendBrevoTransactionalEmail,
} from '@/lib/email/brevo';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { success: rateOk } = await sharingInviteLimiter.limit(session.user.id);
    if (!rateOk) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });

    const body = await req.json();
    const data = CreateShareInvitationSchema.parse(body);

    let scopeName = '';
    let projectId = data.projectId || null;

    if (data.resourceType === 'PROJECT') {
      const project = await db.project.findFirst({
        where: { id: data.resourceId, userId: session.user.id }
      });
      if (!project) return NextResponse.json({ error: 'Unauthorized resource' }, { status: 403 });
      scopeName = project.name;
      projectId = project.id;
    } else if (data.resourceType === 'ENVIRONMENT') {
      const env = await db.environment.findFirst({
        where: { id: data.resourceId, project: { userId: session.user.id } },
        include: { project: true }
      });
      if (!env) return NextResponse.json({ error: 'Unauthorized resource' }, { status: 403 });
      scopeName = env.name;
      projectId = env.projectId;
    } else if (data.resourceType === 'FOLDER') {
      const folder = await db.folder.findFirst({
        where: { id: data.resourceId, environment: { project: { userId: session.user.id } } },
        include: { environment: { include: { project: true } } }
      });
      if (!folder) return NextResponse.json({ error: 'Unauthorized resource' }, { status: 403 });
      scopeName = folder.name;
      projectId = folder.environment.projectId;
    } else if (data.resourceType === 'FILE') {
      const file = await db.vaultFile.findFirst({
        where: { id: data.resourceId, environment: { project: { userId: session.user.id } } },
        include: { environment: { include: { project: true } } }
      });
      if (!file) return NextResponse.json({ error: 'Unauthorized resource' }, { status: 403 });
      scopeName = file.name;
      projectId = file.environment.projectId;
    } else if (data.resourceType === 'BUNDLE') {
      const bundle = await db.fileBundle.findFirst({
        where: { id: data.resourceId, environment: { project: { userId: session.user.id } } },
        include: { environment: { include: { project: true } } }
      });
      if (!bundle) return NextResponse.json({ error: 'Unauthorized resource' }, { status: 403 });
      scopeName = bundle.name;
      projectId = bundle.environment.projectId;
    } else if (data.resourceType === 'SECRET') {
      const secret = await db.secret.findFirst({
        where: { id: data.resourceId, environment: { project: { userId: session.user.id } } },
        include: { environment: { include: { project: true } } }
      });
      if (!secret) return NextResponse.json({ error: 'Unauthorized resource' }, { status: 403 });
      scopeName = secret.keyName;
      projectId = secret.environment.projectId;
    }

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const acceptUrl = `${getEmailBaseUrl()}/sharing/accept/${inviteToken}`;

    let expiresAt: Date | null = null;
    if (data.expiresAt) {
      expiresAt = new Date(data.expiresAt);
    } else if (data.ttlDays) {
      expiresAt = new Date(Date.now() + data.ttlDays * 24 * 60 * 60 * 1000);
    }

    const invitation = await db.shareInvitation.create({
      data: {
        ownerId: session.user.id,
        recipientEmail: data.recipientEmail,
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        projectId,
        permission: data.permission,
        versionMode: data.versionMode,
        specificVersionId: data.specificVersionId || null,
        expiresAt,
        ttlDays: data.ttlDays || null,
        inviteToken,
        shareEncryptionSalt: data.shareEncryptionSalt,
        encryptedShareKey: data.encryptedShareKey,
        shareKeyIv: data.shareKeyIv || null,
        bundleEncrypted: data.bundleEncrypted || null,
        bundleIv: data.bundleIv || null,
        note: data.note || null,
      }
    });

    try {
      const ownerName = getUserLabel(session.user);
      const permissionLabel = data.permission === 'READ_ONLY' ? 'Read only' : data.permission === 'COMMENT' ? 'Comment' : 'Edit';
      const expiryLabel = expiresAt ? expiresAt.toLocaleDateString() : 'No expiry';
      const noteBlock = data.note
        ? `<p style="color:#475569;font-style:italic;font-size:14px;margin-bottom:24px">"${escapeHtml(data.note)}"</p>`
        : '';

      await sendBrevoTransactionalEmail({
        to: [{ email: data.recipientEmail }],
        subject: `${ownerName} shared ${scopeName} with you on EnVault`,
        htmlContent: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:12px">
          <h1 style="color:#4f46e5;font-size:24px;font-weight:800;margin-bottom:8px">EnVault Share</h1>
          <p style="color:#64748b;font-size:16px;margin-bottom:16px">${escapeHtml(ownerName)} has shared <strong>${escapeHtml(scopeName)}</strong> with you.</p>
          <div style="background:#f8fafc;padding:16px;border-radius:8px;margin-bottom:24px;border-left:4px solid #4f46e5">
            <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase">${escapeHtml(data.resourceType)} · ${escapeHtml(permissionLabel)}</p>
            <p style="margin:0 0 8px;font-size:13px;color:#64748b">Expires: ${escapeHtml(expiryLabel)}</p>
            <a href="${acceptUrl}" style="display:inline-block;background:#4f46e5;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-top:8px">Access Shared Content</a>
          </div>
          ${noteBlock}
          <p style="color:#ef4444;font-size:12px;font-weight:600">Protected: You will need the passphrase shared separately by the sender to unlock this content.</p>
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:24px 0">
          <p style="color:#94a3b8;font-size:11px">This is an automated message from EnVault.</p>
        </div>`,
        textContent: [
          'EnVault Share',
          `${ownerName} has shared ${scopeName} with you.`,
          `${data.resourceType} · ${permissionLabel}`,
          `Expires: ${expiryLabel}`,
          `Access shared content: ${acceptUrl}`,
          data.note ? `Note: ${data.note}` : null,
          'You will need the passphrase shared separately by the sender to unlock this content.',
        ].filter(Boolean).join('\n'),
      });
    } catch (err) {
      await db.shareInvitation.delete({ where: { id: invitation.id } }).catch(() => undefined);
      console.error('[SHARING_INVITE_EMAIL]', err);
      return NextResponse.json(
        {
          error:
            err instanceof Error && err.message
              ? `Invitation email failed: ${err.message}`
              : 'Invitation email failed',
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      id: invitation.id,
      inviteToken,
      url: acceptUrl,
      status: invitation.status,
    }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0].message }, { status: 400 });
    console.error('[SHARING_INVITE]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
