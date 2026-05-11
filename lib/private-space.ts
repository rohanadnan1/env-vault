import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { ensureSpaceFolderPath } from '@/lib/private-space-folders';
import { getMergeApprovalPolicy } from '@/lib/private-space-governance';

export function normalizeSpacePath(folderPath?: string | null): string {
  if (!folderPath) return '/';
  const trimmed = folderPath.trim();
  if (!trimmed || trimmed === '/') return '/';

  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export async function requireSpaceMembership(spaceId: string, userId: string) {
  const membership = await db.spaceMember.findFirst({
    where: { spaceId, userId },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
      space: {
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      },
    },
  });

  return membership;
}

export async function getCurrentMergeApprovalThreshold(
  tx: Prisma.TransactionClient,
  spaceId: string
) {
  const policy = await getMergeApprovalPolicy(tx, spaceId);
  return {
    memberCount: policy.memberCount,
    requiredApprovals: policy.requiredApprovals,
  };
}

export async function mergePrivateSpaceRequest(
  tx: Prisma.TransactionClient,
  requestId: string
) {
  const request = await tx.mergeRequest.findUnique({
    where: { id: requestId },
    include: {
      approvals: true,
      kingFile: true,
      kingSecret: true,
    },
  });

  if (!request || request.status !== 'PENDING') {
    return null;
  }

  const { requiredApprovals } = await getCurrentMergeApprovalThreshold(tx, request.spaceId);
  if (request.approvals.length < requiredApprovals) {
    return null;
  }

  if (request.resourceType === 'FILE' && request.kingFile) {
    const latestHistory = await tx.kingFileHistory.findFirst({
      where: { kingFileId: request.kingFile.id },
      orderBy: { revisionNumber: 'desc' },
    });
    const proposedFolderPath = normalizeSpacePath(request.proposedFolderPath ?? request.kingFile.folderPath);
    const folderMoveRequested = proposedFolderPath !== request.kingFile.folderPath;
    const preserveFolderVotes = request.approvals.filter((approval) => approval.preserveFolderStructure).length;
    const preserveVoteThreshold = Math.ceil(request.approvals.length / 2);
    const keepOriginalFolderStructure = folderMoveRequested && preserveFolderVotes >= preserveVoteThreshold;
    const effectiveFolderPath = keepOriginalFolderStructure ? request.kingFile.folderPath : proposedFolderPath;

    await ensureSpaceFolderPath(tx, {
      spaceId: request.spaceId,
      visibility: 'KING',
      domain: 'FILE',
      folderPath: effectiveFolderPath,
    });

    await tx.kingFile.update({
      where: { id: request.kingFile.id },
      data: {
        contentEncrypted: request.proposedData,
        iv: request.iv,
        name: request.proposedName ?? request.kingFile.name,
        folderPath: effectiveFolderPath,
      },
    });

    await tx.kingFileHistory.create({
      data: {
        kingFileId: request.kingFile.id,
        name: request.proposedName ?? request.kingFile.name,
        contentEncrypted: request.proposedData,
        iv: request.iv,
        folderPath: effectiveFolderPath,
        revisionNumber: (latestHistory?.revisionNumber ?? 0) + 1,
        previousHistoryId: latestHistory?.id ?? null,
      },
    });
  } else if (request.resourceType === 'FILE') {
    const proposedName = request.proposedName?.trim();
    const proposedFolderPath = normalizeSpacePath(request.proposedFolderPath);
    if (!proposedName) {
      return null;
    }

    const existingKingFile = await tx.kingFile.findFirst({
      where: {
        spaceId: request.spaceId,
        name: proposedName,
        folderPath: proposedFolderPath,
      },
      select: { id: true },
    });
    if (existingKingFile) {
      return tx.mergeRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED' },
      });
    }

    await ensureSpaceFolderPath(tx, {
      spaceId: request.spaceId,
      visibility: 'KING',
      domain: 'FILE',
      folderPath: proposedFolderPath,
    });

    const kingFile = await tx.kingFile.create({
      data: {
        spaceId: request.spaceId,
        name: proposedName,
        contentEncrypted: request.proposedData,
        iv: request.iv,
        folderPath: proposedFolderPath,
      },
    });

    await tx.kingFileHistory.create({
      data: {
        kingFileId: kingFile.id,
        name: kingFile.name,
        contentEncrypted: kingFile.contentEncrypted,
        iv: kingFile.iv,
        folderPath: kingFile.folderPath,
        revisionNumber: 1,
        previousHistoryId: null,
      },
    });

    const requesterDraft = await tx.userFile.findFirst({
      where: {
        memberId: request.requesterId,
        kingFileId: null,
        name: proposedName,
        folderPath: proposedFolderPath,
      },
      select: { id: true },
    });

    if (requesterDraft) {
      await tx.userFile.update({
        where: { id: requesterDraft.id },
        data: {
          kingFileId: kingFile.id,
          workspaceMode: 'FORK',
          name: kingFile.name,
          contentEncrypted: kingFile.contentEncrypted,
          iv: kingFile.iv,
          folderPath: kingFile.folderPath,
        },
      });
    }
  } else if (request.resourceType === 'SECRET' && request.kingSecret) {
    const latestHistory = await tx.kingSecretHistory.findFirst({
      where: { kingSecretId: request.kingSecret.id },
      orderBy: { revisionNumber: 'desc' },
    });
    const proposedFolderPath = normalizeSpacePath(request.proposedFolderPath ?? request.kingSecret.folderPath);
    const folderMoveRequested = proposedFolderPath !== request.kingSecret.folderPath;
    const preserveFolderVotes = request.approvals.filter((approval) => approval.preserveFolderStructure).length;
    const preserveVoteThreshold = Math.ceil(request.approvals.length / 2);
    const keepOriginalFolderStructure = folderMoveRequested && preserveFolderVotes >= preserveVoteThreshold;
    const nextFolderPath = keepOriginalFolderStructure ? request.kingSecret.folderPath : proposedFolderPath;

    await ensureSpaceFolderPath(tx, {
      spaceId: request.spaceId,
      visibility: 'KING',
      domain: 'SECRET',
      folderPath: nextFolderPath,
    });

    await tx.kingSecret.update({
      where: { id: request.kingSecret.id },
      data: {
        keyName: request.proposedName ?? request.kingSecret.keyName,
        valueEncrypted: request.proposedData,
        iv: request.iv,
        folderPath: nextFolderPath,
      },
    });

    await tx.kingSecretHistory.create({
      data: {
        kingSecretId: request.kingSecret.id,
        valueEncrypted: request.proposedData,
        iv: request.iv,
        revisionNumber: (latestHistory?.revisionNumber ?? 0) + 1,
        previousHistoryId: latestHistory?.id ?? null,
      },
    });
  } else if (request.resourceType === 'SECRET') {
    const proposedKeyName = request.proposedName?.trim();
    const proposedFolderPath = normalizeSpacePath(request.proposedFolderPath);
    if (!proposedKeyName) {
      return null;
    }

    const existingKingSecret = await tx.kingSecret.findFirst({
      where: {
        spaceId: request.spaceId,
        folderPath: proposedFolderPath,
        keyName: proposedKeyName,
      },
      select: { id: true },
    });
    if (existingKingSecret) {
      return tx.mergeRequest.update({
        where: { id: request.id },
        data: { status: 'REJECTED' },
      });
    }

    await ensureSpaceFolderPath(tx, {
      spaceId: request.spaceId,
      visibility: 'KING',
      domain: 'SECRET',
      folderPath: proposedFolderPath,
    });

    const kingSecret = await tx.kingSecret.create({
      data: {
        spaceId: request.spaceId,
        keyName: proposedKeyName,
        valueEncrypted: request.proposedData,
        iv: request.iv,
        folderPath: proposedFolderPath,
      },
    });

    await tx.kingSecretHistory.create({
      data: {
        kingSecretId: kingSecret.id,
        valueEncrypted: kingSecret.valueEncrypted,
        iv: kingSecret.iv,
        revisionNumber: 1,
        previousHistoryId: null,
      },
    });

    const requesterDraft = await tx.userSecret.findFirst({
      where: {
        memberId: request.requesterId,
        kingSecretId: null,
        keyName: proposedKeyName,
        folderPath: proposedFolderPath,
      },
      select: { id: true },
    });

    if (requesterDraft) {
      await tx.userSecret.update({
        where: { id: requesterDraft.id },
        data: {
          kingSecretId: kingSecret.id,
          workspaceMode: 'FORK',
          keyName: kingSecret.keyName,
          valueEncrypted: kingSecret.valueEncrypted,
          iv: kingSecret.iv,
          folderPath: kingSecret.folderPath,
        },
      });
    }
  } else {
    return null;
  }

  return tx.mergeRequest.update({
    where: { id: request.id },
    data: { status: 'MERGED' },
  });
}

export async function propagateKingFileToMembers(
  tx: Prisma.TransactionClient,
  kingFile: {
    id: string;
    name: string;
    contentEncrypted: string;
    iv: string;
    folderPath: string;
  },
  memberIds: string[]
) {
  if (memberIds.length === 0) return;

  await tx.userFile.createMany({
    data: memberIds.map((memberId) => ({
      kingFileId: kingFile.id,
      memberId,
      name: kingFile.name,
      contentEncrypted: kingFile.contentEncrypted,
      iv: kingFile.iv,
      folderPath: kingFile.folderPath,
    })),
  });
}

export async function propagateKingSecretToMembers(
  tx: Prisma.TransactionClient,
  kingSecret: {
    id: string;
    keyName: string;
    valueEncrypted: string;
    iv: string;
    folderPath: string;
  },
  memberIds: string[]
) {
  if (memberIds.length === 0) return;

  await tx.userSecret.createMany({
    data: memberIds.map((memberId) => ({
      kingSecretId: kingSecret.id,
      memberId,
      keyName: kingSecret.keyName,
      valueEncrypted: kingSecret.valueEncrypted,
      iv: kingSecret.iv,
      folderPath: kingSecret.folderPath,
    })),
  });
}
