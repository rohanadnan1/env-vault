-- CreateEnum
CREATE TYPE "MergeResourceType" AS ENUM ('FILE', 'SECRET');

-- CreateEnum
CREATE TYPE "MergeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'MERGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SpaceInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "vaultPublicKey" TEXT,
ADD COLUMN     "vaultPublicKeyAlgorithm" TEXT;

-- CreateTable
CREATE TABLE "PrivateSpace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateSpace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceMember" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedSpaceKey" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isCouncilMember" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SpaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KingFile" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL DEFAULT '/',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KingFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KingSecret" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "keyName" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KingSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KingFileHistory" (
    "id" TEXT NOT NULL,
    "kingFileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL DEFAULT '/',
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "previousHistoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KingFileHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KingSecretHistory" (
    "id" TEXT NOT NULL,
    "kingSecretId" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "previousHistoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KingSecretHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserFile" (
    "id" TEXT NOT NULL,
    "kingFileId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSecret" (
    "id" TEXT NOT NULL,
    "kingSecretId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "valueEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSecret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceBundle" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bundleType" "BundleType" NOT NULL,
    "matchRule" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceBundleMember" (
    "userFileId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceBundleMember_pkey" PRIMARY KEY ("userFileId","bundleId")
);

-- CreateTable
CREATE TABLE "MergeRequest" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "resourceType" "MergeResourceType" NOT NULL,
    "kingFileId" TEXT,
    "kingSecretId" TEXT,
    "proposedData" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "proposedName" TEXT,
    "proposedFolderPath" TEXT,
    "status" "MergeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MergeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MergeApproval" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MergeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Election" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "status" "ElectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Election_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectionVote" (
    "id" TEXT NOT NULL,
    "electionId" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "candidate1Id" TEXT NOT NULL,
    "candidate2Id" TEXT NOT NULL,
    "candidate3Id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectionVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelectionPetition" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelectionPetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceInvitation" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientId" TEXT,
    "inviteToken" TEXT NOT NULL,
    "encryptedSpaceKey" TEXT,
    "encryptedSpaceKeyAlgorithm" TEXT,
    "status" "SpaceInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpaceMember_userId_idx" ON "SpaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceMember_spaceId_userId_key" ON "SpaceMember"("spaceId", "userId");

-- CreateIndex
CREATE INDEX "KingFile_spaceId_idx" ON "KingFile"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "KingFile_spaceId_folderPath_name_key" ON "KingFile"("spaceId", "folderPath", "name");

-- CreateIndex
CREATE INDEX "KingSecret_spaceId_idx" ON "KingSecret"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "KingSecret_spaceId_keyName_key" ON "KingSecret"("spaceId", "keyName");

-- CreateIndex
CREATE INDEX "KingFileHistory_kingFileId_createdAt_idx" ON "KingFileHistory"("kingFileId", "createdAt");

-- CreateIndex
CREATE INDEX "KingSecretHistory_kingSecretId_createdAt_idx" ON "KingSecretHistory"("kingSecretId", "createdAt");

-- CreateIndex
CREATE INDEX "UserFile_memberId_idx" ON "UserFile"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFile_kingFileId_memberId_key" ON "UserFile"("kingFileId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "UserFile_memberId_folderPath_name_key" ON "UserFile"("memberId", "folderPath", "name");

-- CreateIndex
CREATE INDEX "UserSecret_memberId_idx" ON "UserSecret"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSecret_kingSecretId_memberId_key" ON "UserSecret"("kingSecretId", "memberId");

-- CreateIndex
CREATE INDEX "SpaceBundle_memberId_idx" ON "SpaceBundle"("memberId");

-- CreateIndex
CREATE INDEX "SpaceBundleMember_bundleId_idx" ON "SpaceBundleMember"("bundleId");

-- CreateIndex
CREATE INDEX "MergeRequest_spaceId_status_idx" ON "MergeRequest"("spaceId", "status");

-- CreateIndex
CREATE INDEX "MergeRequest_requesterId_idx" ON "MergeRequest"("requesterId");

-- CreateIndex
CREATE INDEX "MergeApproval_memberId_idx" ON "MergeApproval"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MergeApproval_requestId_memberId_key" ON "MergeApproval"("requestId", "memberId");

-- CreateIndex
CREATE INDEX "Election_spaceId_status_idx" ON "Election"("spaceId", "status");

-- CreateIndex
CREATE INDEX "ElectionVote_voterId_idx" ON "ElectionVote"("voterId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectionVote_electionId_voterId_key" ON "ElectionVote"("electionId", "voterId");

-- CreateIndex
CREATE INDEX "ReelectionPetition_memberId_idx" ON "ReelectionPetition"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelectionPetition_spaceId_memberId_key" ON "ReelectionPetition"("spaceId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "SpaceInvitation_inviteToken_key" ON "SpaceInvitation"("inviteToken");

-- CreateIndex
CREATE INDEX "SpaceInvitation_spaceId_status_idx" ON "SpaceInvitation"("spaceId", "status");

-- CreateIndex
CREATE INDEX "SpaceInvitation_recipientEmail_idx" ON "SpaceInvitation"("recipientEmail");

-- CreateIndex
CREATE INDEX "SpaceInvitation_recipientId_idx" ON "SpaceInvitation"("recipientId");

-- AddForeignKey
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PrivateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceMember" ADD CONSTRAINT "SpaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KingFile" ADD CONSTRAINT "KingFile_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PrivateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KingSecret" ADD CONSTRAINT "KingSecret_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PrivateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KingFileHistory" ADD CONSTRAINT "KingFileHistory_kingFileId_fkey" FOREIGN KEY ("kingFileId") REFERENCES "KingFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KingFileHistory" ADD CONSTRAINT "KingFileHistory_previousHistoryId_fkey" FOREIGN KEY ("previousHistoryId") REFERENCES "KingFileHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KingSecretHistory" ADD CONSTRAINT "KingSecretHistory_kingSecretId_fkey" FOREIGN KEY ("kingSecretId") REFERENCES "KingSecret"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KingSecretHistory" ADD CONSTRAINT "KingSecretHistory_previousHistoryId_fkey" FOREIGN KEY ("previousHistoryId") REFERENCES "KingSecretHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFile" ADD CONSTRAINT "UserFile_kingFileId_fkey" FOREIGN KEY ("kingFileId") REFERENCES "KingFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFile" ADD CONSTRAINT "UserFile_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSecret" ADD CONSTRAINT "UserSecret_kingSecretId_fkey" FOREIGN KEY ("kingSecretId") REFERENCES "KingSecret"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSecret" ADD CONSTRAINT "UserSecret_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceBundle" ADD CONSTRAINT "SpaceBundle_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceBundleMember" ADD CONSTRAINT "SpaceBundleMember_userFileId_fkey" FOREIGN KEY ("userFileId") REFERENCES "UserFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceBundleMember" ADD CONSTRAINT "SpaceBundleMember_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "SpaceBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeRequest" ADD CONSTRAINT "MergeRequest_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PrivateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeRequest" ADD CONSTRAINT "MergeRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeRequest" ADD CONSTRAINT "MergeRequest_kingFileId_fkey" FOREIGN KEY ("kingFileId") REFERENCES "KingFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeRequest" ADD CONSTRAINT "MergeRequest_kingSecretId_fkey" FOREIGN KEY ("kingSecretId") REFERENCES "KingSecret"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeApproval" ADD CONSTRAINT "MergeApproval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MergeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MergeApproval" ADD CONSTRAINT "MergeApproval_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Election" ADD CONSTRAINT "Election_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PrivateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionVote" ADD CONSTRAINT "ElectionVote_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectionVote" ADD CONSTRAINT "ElectionVote_voterId_fkey" FOREIGN KEY ("voterId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelectionPetition" ADD CONSTRAINT "ReelectionPetition_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PrivateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelectionPetition" ADD CONSTRAINT "ReelectionPetition_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceInvitation" ADD CONSTRAINT "SpaceInvitation_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "PrivateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceInvitation" ADD CONSTRAINT "SpaceInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceInvitation" ADD CONSTRAINT "SpaceInvitation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

