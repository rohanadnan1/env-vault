-- CreateEnum
CREATE TYPE "ShareResourceType" AS ENUM ('PROJECT', 'ENVIRONMENT', 'FOLDER', 'FILE', 'BUNDLE', 'SECRET');
CREATE TYPE "SharePermission" AS ENUM ('READ_ONLY', 'COMMENT', 'EDIT');
CREATE TYPE "ShareVersionMode" AS ENUM ('LATEST', 'SPECIFIC', 'ALL');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "EditRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'MERGED');

-- CreateTable
CREATE TABLE "ShareInvitation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientId" TEXT,
    "resourceType" "ShareResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "projectId" TEXT,
    "permission" "SharePermission" NOT NULL DEFAULT 'READ_ONLY',
    "versionMode" "ShareVersionMode" NOT NULL DEFAULT 'LATEST',
    "specificVersionId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "ttlDays" INTEGER,
    "inviteToken" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "revokedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "firstAccessedAt" TIMESTAMP(3),
    "shareEncryptionSalt" TEXT NOT NULL,
    "encryptedShareKey" TEXT NOT NULL,
    "shareKeyIv" TEXT,
    "bundleEncrypted" TEXT,
    "bundleIv" TEXT,
    "encryptionMode" TEXT NOT NULL DEFAULT 'collaborative',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareAccessLog" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resourceDetail" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareDownloadLog" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "ownerNotified" BOOLEAN NOT NULL DEFAULT false,
    "downloadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareDownloadLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareEditRequest" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "resourceType" "ShareResourceType" NOT NULL,
    "resourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "proposedEncrypted" TEXT NOT NULL,
    "proposedIv" TEXT NOT NULL,
    "previousVersionId" TEXT,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareEditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareComment" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "iv" TEXT,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareInvitation_inviteToken_key" ON "ShareInvitation"("inviteToken");
CREATE INDEX "ShareInvitation_ownerId_idx" ON "ShareInvitation"("ownerId");
CREATE INDEX "ShareInvitation_recipientEmail_idx" ON "ShareInvitation"("recipientEmail");
CREATE INDEX "ShareInvitation_recipientId_idx" ON "ShareInvitation"("recipientId");
CREATE INDEX "ShareInvitation_resourceType_resourceId_idx" ON "ShareInvitation"("resourceType", "resourceId");

CREATE INDEX "ShareAccessLog_invitationId_accessedAt_idx" ON "ShareAccessLog"("invitationId", "accessedAt");
CREATE INDEX "ShareDownloadLog_invitationId_idx" ON "ShareDownloadLog"("invitationId");
CREATE INDEX "ShareEditRequest_invitationId_status_idx" ON "ShareEditRequest"("invitationId", "status");
CREATE INDEX "ShareComment_invitationId_createdAt_idx" ON "ShareComment"("invitationId", "createdAt");

-- AddForeignKey
ALTER TABLE "ShareInvitation" ADD CONSTRAINT "ShareInvitation_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareInvitation" ADD CONSTRAINT "ShareInvitation_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShareInvitation" ADD CONSTRAINT "ShareInvitation_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShareAccessLog" ADD CONSTRAINT "ShareAccessLog_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "ShareInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareAccessLog" ADD CONSTRAINT "ShareAccessLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ShareDownloadLog" ADD CONSTRAINT "ShareDownloadLog_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "ShareInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareDownloadLog" ADD CONSTRAINT "ShareDownloadLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShareEditRequest" ADD CONSTRAINT "ShareEditRequest_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "ShareInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareEditRequest" ADD CONSTRAINT "ShareEditRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShareComment" ADD CONSTRAINT "ShareComment_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "ShareInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareComment" ADD CONSTRAINT "ShareComment_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareComment" ADD CONSTRAINT "ShareComment_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "ShareComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
