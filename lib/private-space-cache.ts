import { revalidateTag, unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import { getGovernanceSnapshot } from '@/lib/private-space-governance';

export function privateSpaceWorkspaceTag(spaceId: string, userId: string) {
  return `private-space-workspace:${spaceId}:${userId}`;
}

export function privateSpaceRequestsTag(spaceId: string, userId: string) {
  return `private-space-requests:${spaceId}:${userId}`;
}

export function privateSpacesHubTag(userId: string) {
  return `private-spaces-hub:${userId}`;
}

export function privateSpaceSharedTag(spaceId: string) {
  return `private-space-shared:${spaceId}`;
}

export async function revalidatePrivateSpaceForMembers(spaceId: string) {
  const members = await db.spaceMember.findMany({
    where: { spaceId },
    select: { userId: true },
  });

  revalidateTag(privateSpaceSharedTag(spaceId), 'max');
  for (const member of members) {
    revalidateTag(privateSpaceWorkspaceTag(spaceId, member.userId), 'max');
    revalidateTag(privateSpaceRequestsTag(spaceId, member.userId), 'max');
    revalidateTag(privateSpacesHubTag(member.userId), 'max');
  }
}

export const getCachedPrivateSpacesForUser = (userId: string) =>
  unstable_cache(
    async () =>
      db.spaceMember.findMany({
        where: { userId },
        include: {
          space: {
            include: {
              _count: {
                select: {
                  members: true,
                  kingFiles: true,
                  kingSecrets: true,
                  invitations: true,
                },
              },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
      }),
    ['private-spaces-hub', userId],
    {
      tags: [privateSpacesHubTag(userId)],
      revalidate: 60,
    }
  )();

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.toISOString();
}

async function loadPrivateSpaceWorkspace(spaceId: string, userId: string) {
  const membership = await db.spaceMember.findFirst({
    where: { spaceId, userId },
    include: {
      user: {
        select: { id: true, email: true, name: true },
      },
    },
  });

  if (!membership) {
    return null;
  }

  const [space, myMemberRecord, governance, folders] = await Promise.all([
    db.privateSpace.findUnique({
      where: { id: spaceId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        kingFiles: {
          orderBy: [{ folderPath: 'asc' }, { name: 'asc' }],
        },
        kingSecrets: {
          orderBy: [{ folderPath: 'asc' }, { keyName: 'asc' }],
        },
        invitations: {
          where: { status: 'PENDING' },
          select: {
            id: true,
            recipientEmail: true,
            createdAt: true,
            inviteToken: true,
            encryptedSpaceKey: true,
          },
        },
      },
    }),
    db.spaceMember.findUnique({
      where: { id: membership.id },
      include: {
        userFiles: {
          include: {
            kingFile: {
              select: { id: true, name: true, folderPath: true, updatedAt: true },
            },
          },
          orderBy: [{ folderPath: 'asc' }, { name: 'asc' }],
        },
        userSecrets: {
          include: {
            kingSecret: {
              select: { id: true, keyName: true, folderPath: true, updatedAt: true },
            },
          },
          orderBy: [{ folderPath: 'asc' }, { keyName: 'asc' }, { createdAt: 'asc' }],
        },
        bundles: {
          include: {
            members: {
              select: {
                userFileId: true,
                addedAt: true,
              },
              orderBy: { addedAt: 'asc' },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
      },
    }),
    getGovernanceSnapshot(db, spaceId),
    db.spaceFolder.findMany({
      where: {
        spaceId,
        OR: [
          { visibility: 'KING' },
          { visibility: 'PERSONAL', member: { userId } },
        ],
      },
      orderBy: [{ visibility: 'asc' }, { domain: 'asc' }, { path: 'asc' }],
    }),
  ]);

  if (!space || !myMemberRecord) {
    return null;
  }

  const kingFileIds = myMemberRecord.userFiles
    .map((file) => file.kingFileId)
    .filter((fileId): fileId is string => !!fileId);

  const peerFiles = kingFileIds.length
    ? await db.userFile.findMany({
        where: {
          kingFileId: { in: kingFileIds },
          member: {
            spaceId,
            id: { not: membership.id },
          },
        },
        select: {
          id: true,
          kingFileId: true,
          folderPath: true,
          updatedAt: true,
          member: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ folderPath: 'asc' }, { updatedAt: 'desc' }],
      })
    : [];

  const peerFilesByKingFileId = new Map<string, typeof peerFiles>();
  for (const file of peerFiles) {
    if (!file.kingFileId) continue;
    const files = peerFilesByKingFileId.get(file.kingFileId) ?? [];
    files.push(file);
    peerFilesByKingFileId.set(file.kingFileId, files);
  }

  return {
    id: space.id,
    name: space.name,
    createdAt: space.createdAt.toISOString(),
    updatedAt: space.updatedAt.toISOString(),
    myMembership: {
      id: membership.id,
      encryptedSpaceKey: membership.encryptedSpaceKey,
      isCouncilMember: membership.isCouncilMember,
      joinedAt: membership.joinedAt.toISOString(),
      user: membership.user,
    },
    members: space.members.map((member) => ({
      id: member.id,
      joinedAt: member.joinedAt.toISOString(),
      isCouncilMember: member.isCouncilMember,
      user: member.user,
    })),
    files: myMemberRecord.userFiles.map((file) => ({
      id: file.id,
      kingFileId: file.kingFileId,
      workspaceMode: file.workspaceMode,
      name: file.name,
      contentEncrypted: file.contentEncrypted,
      iv: file.iv,
      folderPath: file.folderPath,
      createdAt: file.createdAt.toISOString(),
      updatedAt: file.updatedAt.toISOString(),
      kingFile: file.kingFile
        ? {
            id: file.kingFile.id,
            name: file.kingFile.name,
            folderPath: file.kingFile.folderPath,
            updatedAt: file.kingFile.updatedAt.toISOString(),
          }
        : null,
      peers: file.kingFileId
        ? (peerFilesByKingFileId.get(file.kingFileId) ?? []).map((peerFile) => ({
        memberId: peerFile.member.id,
        userId: peerFile.member.user.id,
        name: peerFile.member.user.name,
        email: peerFile.member.user.email,
        userFileId: peerFile.id,
        folderPath: peerFile.folderPath,
        updatedAt: peerFile.updatedAt.toISOString(),
          }))
        : [],
    })),
    secrets: myMemberRecord.userSecrets.map((secret) => ({
      id: secret.id,
      kingSecretId: secret.kingSecretId,
      workspaceMode: secret.workspaceMode,
      keyName: secret.keyName ?? secret.kingSecret?.keyName ?? 'Draft secret',
      valueEncrypted: secret.valueEncrypted,
      iv: secret.iv,
      folderPath: secret.folderPath,
      createdAt: secret.createdAt.toISOString(),
      updatedAt: secret.updatedAt.toISOString(),
      kingSecret: secret.kingSecret
        ? {
            id: secret.kingSecret.id,
            keyName: secret.kingSecret.keyName,
            folderPath: secret.kingSecret.folderPath,
            updatedAt: secret.kingSecret.updatedAt.toISOString(),
          }
        : null,
    })),
    officialFiles: space.kingFiles.map((file) => ({
      id: file.id,
      name: file.name,
      contentEncrypted: file.contentEncrypted,
      iv: file.iv,
      folderPath: file.folderPath,
      updatedAt: file.updatedAt.toISOString(),
    })),
    officialSecrets: space.kingSecrets.map((secret) => ({
      id: secret.id,
      keyName: secret.keyName,
      valueEncrypted: secret.valueEncrypted,
      iv: secret.iv,
      folderPath: secret.folderPath,
      updatedAt: secret.updatedAt.toISOString(),
    })),
    folders: folders.map((folder) => ({
      id: folder.id,
      visibility: folder.visibility,
      domain: folder.domain,
      name: folder.name,
      path: folder.path,
      parentId: folder.parentId,
      memberId: folder.memberId,
      createdAt: folder.createdAt.toISOString(),
      updatedAt: folder.updatedAt.toISOString(),
    })),
    bundles: myMemberRecord.bundles.map((bundle) => ({
      id: bundle.id,
      name: bundle.name,
      bundleType: bundle.bundleType,
      matchRule: bundle.matchRule,
      sortOrder: bundle.sortOrder,
      createdAt: bundle.createdAt.toISOString(),
      updatedAt: bundle.updatedAt.toISOString(),
      members: bundle.members.map((member) => ({
        userFileId: member.userFileId,
        addedAt: member.addedAt.toISOString(),
      })),
    })),
    pendingInvites: space.invitations.map((invite) => ({
      id: invite.id,
      recipientEmail: invite.recipientEmail,
      inviteToken: invite.inviteToken,
      createdAt: invite.createdAt.toISOString(),
      hasEncryptedSpaceKey: !!invite.encryptedSpaceKey,
    })),
    governance: {
      isCouncilMode: governance.isCouncilMode,
      isLockedDown: governance.isLockedDown,
      memberCount: governance.memberCount,
      petitionCount: governance.petitionCount,
      councilMemberIds: governance.councilMembers.map((member) => member.id),
      activeElection: governance.activeElection
        ? {
            id: governance.activeElection.id,
            createdAt: governance.activeElection.createdAt.toISOString(),
            totalVotes: governance.activeElection.votes.length,
            hasCurrentUserVoted: governance.activeElection.votes.some((vote) => vote.voterId === membership.id),
          }
        : null,
    },
  };
}

export async function getPrivateSpaceWorkspaceUncached(spaceId: string, userId: string) {
  return loadPrivateSpaceWorkspace(spaceId, userId);
}

async function loadPrivateSpaceMergeRequests(spaceId: string, userId: string) {
  const membership = await db.spaceMember.findFirst({
    where: { spaceId, userId },
    select: { id: true },
  });

  if (!membership) {
    return null;
  }

  const [governance, requests] = await Promise.all([
    getGovernanceSnapshot(db, spaceId),
    db.mergeRequest.findMany({
      where: { spaceId },
      include: {
        requester: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        },
        approvals: {
          include: {
            member: {
              include: {
                user: {
                  select: { id: true, email: true, name: true },
                },
              },
            },
          },
        },
        kingFile: true,
        kingSecret: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return requests.map((request) => ({
    id: request.id,
    spaceId: request.spaceId,
    resourceType: request.resourceType,
    status: request.status,
    proposedData: request.proposedData,
    iv: request.iv,
    proposedName: request.proposedName,
    proposedFolderPath: request.proposedFolderPath,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
    requester: {
      id: request.requester.id,
      user: request.requester.user,
    },
    approvals: request.approvals.map((approval) => ({
      id: approval.id,
      approvedAt: approval.approvedAt.toISOString(),
      preserveFolderStructure: approval.preserveFolderStructure,
      member: {
        id: approval.member.id,
        user: approval.member.user,
      },
    })),
    memberCount: governance.memberCount,
    requiredApprovals: governance.isCouncilMode ? 2 : Math.max(0, governance.memberCount - 1),
    governance: {
      isCouncilMode: governance.isCouncilMode,
      isLockedDown: governance.isLockedDown,
    },
    currentKing:
      request.resourceType === 'FILE' && request.kingFile
        ? {
            id: request.kingFile.id,
            name: request.kingFile.name,
            contentEncrypted: request.kingFile.contentEncrypted,
            iv: request.kingFile.iv,
            folderPath: request.kingFile.folderPath,
            updatedAt: request.kingFile.updatedAt.toISOString(),
          }
        : request.kingSecret
          ? {
              id: request.kingSecret.id,
              keyName: request.kingSecret.keyName,
              folderPath: request.kingSecret.folderPath,
              valueEncrypted: request.kingSecret.valueEncrypted,
              iv: request.kingSecret.iv,
              updatedAt: request.kingSecret.updatedAt.toISOString(),
            }
          : null,
    canApprove:
      request.status === 'PENDING' &&
      !governance.isLockedDown &&
      request.requesterId !== membership.id &&
      (!governance.isCouncilMode || governance.councilMembers.some((member) => member.id === membership.id)) &&
      !request.approvals.some((approval) => approval.memberId === membership.id),
    canReject: request.status === 'PENDING' && !governance.isLockedDown && request.requesterId !== membership.id,
    isRequester: request.requesterId === membership.id,
  }));
}

export async function getPrivateSpaceMergeRequestsUncached(spaceId: string, userId: string) {
  return loadPrivateSpaceMergeRequests(spaceId, userId);
}

export const getCachedPrivateSpaceWorkspace = (spaceId: string, userId: string) =>
  unstable_cache(
    () => loadPrivateSpaceWorkspace(spaceId, userId),
    ['private-space-workspace', spaceId, userId],
    {
      tags: [privateSpaceWorkspaceTag(spaceId, userId), privateSpaceSharedTag(spaceId)],
      revalidate: 60,
    }
  )();

export const getCachedPrivateSpaceMergeRequests = (spaceId: string, userId: string) =>
  unstable_cache(
    () => loadPrivateSpaceMergeRequests(spaceId, userId),
    ['private-space-merge-requests', spaceId, userId],
    {
      tags: [privateSpaceRequestsTag(spaceId, userId), privateSpaceSharedTag(spaceId)],
      revalidate: 60,
    }
  )();
