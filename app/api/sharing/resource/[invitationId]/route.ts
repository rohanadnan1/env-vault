import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  canRecipientUseAcceptedShare,
  isInvitationRecipientMatch,
  isShareInvitationExpired,
} from '@/lib/sharing-access';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ invitationId: string }> }
) {
  const { invitationId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const invitation = await db.shareInvitation.findUnique({
      where: { id: invitationId },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true, emoji: true, color: true } },
      }
    });
    if (!invitation) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const isOwner = invitation.ownerId === session.user.id;
    const isRecipient = isInvitationRecipientMatch(invitation, session);
    if (!isOwner && !isRecipient) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!isOwner && invitation.status === 'PENDING') {
      return NextResponse.json({ error: 'Invitation must be accepted before this resource can be opened' }, { status: 409 });
    }

    if (!isOwner && invitation.status === 'LEFT') {
      return NextResponse.json({ error: 'You left this shared resource. The owner must share it again.' }, { status: 410 });
    }

    if (invitation.status === 'REVOKED') {
      return NextResponse.json({ error: 'Access has been revoked' }, { status: 410 });
    }

    if (isShareInvitationExpired(invitation)) {
      if (invitation.status !== 'EXPIRED') {
        await db.shareInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' }
        });
      }
      return NextResponse.json({ error: 'Access has expired' }, { status: 410 });
    }

    if (!isOwner && !canRecipientUseAcceptedShare(invitation, session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.shareAccessLog.create({
      data: {
        invitationId: invitation.id,
        userId: session.user.id,
        action: 'VIEW',
        resourceDetail: `${invitation.resourceType}:${invitation.resourceId}`,
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
        userAgent: req.headers.get('user-agent') || undefined,
      }
    });

    if (!invitation.firstAccessedAt) {
      await db.shareInvitation.update({
        where: { id: invitation.id },
        data: { firstAccessedAt: new Date() }
      });
    }

    const content: {
      type: string;
      resourceId: string;
      resourceName: string;
      owner: { id: string; name: string | null; email: string };
      project: { id: string; name: string; emoji: string; color: string } | null;
      status: string;
      inviteToken: string;
      expiresAt: string | null;
      bundleEncrypted?: string | null;
      bundleIv?: string | null;
      encryptedShareKey: string;
      shareKeyIv: string | null;
      shareEncryptionSalt: string;
      permission: string;
      secrets?: Array<{ keyName: string; valueEncrypted: string; iv: string }>;
      files?: Array<{ name: string; contentEncrypted: string; iv: string; mimeType: string }>;
    } = {
      type: 'EMPTY',
      resourceId: invitation.resourceId,
      resourceName: '',
      owner: invitation.owner,
      project: invitation.project,
      status: invitation.status,
      inviteToken: invitation.inviteToken,
      expiresAt: invitation.expiresAt?.toISOString() || null,
      bundleEncrypted: invitation.bundleEncrypted,
      bundleIv: invitation.bundleIv,
      encryptedShareKey: invitation.encryptedShareKey,
      shareKeyIv: invitation.shareKeyIv,
      shareEncryptionSalt: invitation.shareEncryptionSalt,
      permission: invitation.permission,
    };

    if (invitation.resourceType === 'SECRET') {
      const secret = await db.secret.findUnique({
        where: { id: invitation.resourceId }
      });
      if (!secret) return NextResponse.json({ error: 'Secret not found' }, { status: 404 });

      content.type = 'SECRET';
      content.resourceName = secret.keyName;
      content.secrets = [{
        keyName: secret.keyName,
        valueEncrypted: secret.valueEncrypted,
        iv: secret.iv,
      }];

      if (invitation.versionMode === 'SPECIFIC' && invitation.specificVersionId) {
        const historyRecord = await db.secretHistory.findUnique({
          where: { id: invitation.specificVersionId }
        });
        if (historyRecord) {
          content.secrets[0].valueEncrypted = historyRecord.valueEncrypted;
          content.secrets[0].iv = historyRecord.iv;
        }
      }
    } else if (invitation.resourceType === 'FILE') {
      const file = await db.vaultFile.findUnique({
        where: { id: invitation.resourceId }
      });
      if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

      content.type = 'FILE';
      content.resourceName = file.name;
      content.files = [{
        name: file.name,
        contentEncrypted: file.contentEncrypted,
        iv: file.iv,
        mimeType: file.mimeType,
      }];

      if (invitation.versionMode === 'SPECIFIC' && invitation.specificVersionId) {
        const historyRecord = await db.fileHistory.findUnique({
          where: { id: invitation.specificVersionId }
        });
        if (historyRecord) {
          content.files[0].contentEncrypted = historyRecord.contentEncrypted;
          content.files[0].iv = historyRecord.iv;
        }
      }
    } else if (invitation.resourceType === 'ENVIRONMENT' || invitation.resourceType === 'FOLDER' || invitation.resourceType === 'PROJECT' || invitation.resourceType === 'BUNDLE') {
      content.type = invitation.resourceType;
      let resourceSecrets: Array<{ keyName: string; valueEncrypted: string; iv: string }> = [];
      let resourceFiles: Array<{ name: string; contentEncrypted: string; iv: string; mimeType: string }> = [];

      if (invitation.resourceType === 'PROJECT') {
        const envs = await db.environment.findMany({
          where: { projectId: invitation.resourceId },
          select: { id: true, name: true }
        });
        if (envs.length > 0) {
          content.resourceName = envs[0].name;
          const secrets = await db.secret.findMany({
            where: { environmentId: { in: envs.map(e => e.id) } }
          });
          resourceSecrets = secrets.map(s => ({ keyName: s.keyName, valueEncrypted: s.valueEncrypted, iv: s.iv }));

          const files = await db.vaultFile.findMany({
            where: { environmentId: { in: envs.map(e => e.id) } }
          });
          resourceFiles = files.map(f => ({ name: f.name, contentEncrypted: f.contentEncrypted, iv: f.iv, mimeType: f.mimeType }));
        }
      } else if (invitation.resourceType === 'ENVIRONMENT') {
        const env = await db.environment.findUnique({
          where: { id: invitation.resourceId },
          select: { name: true }
        });
        content.resourceName = env?.name || '';

        const secrets = await db.secret.findMany({
          where: { environmentId: invitation.resourceId }
        });
        resourceSecrets = secrets.map(s => ({ keyName: s.keyName, valueEncrypted: s.valueEncrypted, iv: s.iv }));

        const files = await db.vaultFile.findMany({
          where: { environmentId: invitation.resourceId }
        });
        resourceFiles = files.map(f => ({ name: f.name, contentEncrypted: f.contentEncrypted, iv: f.iv, mimeType: f.mimeType }));
      } else if (invitation.resourceType === 'FOLDER') {
        const folder = await db.folder.findUnique({
          where: { id: invitation.resourceId },
          select: { name: true }
        });
        content.resourceName = folder?.name || '';

        const secrets = await db.secret.findMany({
          where: { folderId: invitation.resourceId }
        });
        resourceSecrets = secrets.map(s => ({ keyName: s.keyName, valueEncrypted: s.valueEncrypted, iv: s.iv }));

        const files = await db.vaultFile.findMany({
          where: { folderId: invitation.resourceId }
        });
        resourceFiles = files.map(f => ({ name: f.name, contentEncrypted: f.contentEncrypted, iv: f.iv, mimeType: f.mimeType }));
      } else if (invitation.resourceType === 'BUNDLE') {
        const bundle = await db.fileBundle.findUnique({
          where: { id: invitation.resourceId },
          include: { members: { include: { file: true } } }
        });
        content.resourceName = bundle?.name || '';
        resourceFiles = bundle?.members.map(m => ({
          name: m.file.name,
          contentEncrypted: m.file.contentEncrypted,
          iv: m.file.iv,
          mimeType: m.file.mimeType,
        })) || [];
      }

      content.secrets = resourceSecrets;
      content.files = resourceFiles;
    } else {
      return NextResponse.json({ error: 'Unsupported resource type' }, { status: 400 });
    }

    return NextResponse.json(content);
  } catch (e) {
    console.error('[SHARING_RESOURCE]', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
