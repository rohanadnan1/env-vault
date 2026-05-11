CREATE TYPE "SpaceFolderVisibility" AS ENUM ('PERSONAL', 'KING');
CREATE TYPE "SpaceFolderDomain" AS ENUM ('FILE', 'SECRET');

ALTER TABLE "KingSecret"
ADD COLUMN "folderPath" TEXT NOT NULL DEFAULT '/';

ALTER TABLE "UserSecret"
ADD COLUMN "folderPath" TEXT NOT NULL DEFAULT '/';

ALTER TABLE "KingSecret"
DROP CONSTRAINT IF EXISTS "KingSecret_spaceId_keyName_key";

ALTER TABLE "UserSecret"
DROP CONSTRAINT IF EXISTS "UserSecret_memberId_keyName_key";

CREATE TABLE "SpaceFolder" (
  "id" TEXT NOT NULL,
  "spaceId" TEXT NOT NULL,
  "memberId" TEXT,
  "visibility" "SpaceFolderVisibility" NOT NULL,
  "domain" "SpaceFolderDomain" NOT NULL,
  "name" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "parentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SpaceFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpaceFolderVote" (
  "folderId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SpaceFolderVote_pkey" PRIMARY KEY ("folderId","memberId")
);

CREATE UNIQUE INDEX "KingSecret_spaceId_folderPath_keyName_key"
ON "KingSecret"("spaceId", "folderPath", "keyName");

CREATE UNIQUE INDEX "UserSecret_memberId_folderPath_keyName_key"
ON "UserSecret"("memberId", "folderPath", "keyName");

CREATE UNIQUE INDEX "SpaceFolder_spaceId_memberId_visibility_domain_path_key"
ON "SpaceFolder"("spaceId", "memberId", "visibility", "domain", "path");

CREATE INDEX "SpaceFolder_spaceId_visibility_domain_idx"
ON "SpaceFolder"("spaceId", "visibility", "domain");

CREATE INDEX "SpaceFolder_memberId_visibility_domain_idx"
ON "SpaceFolder"("memberId", "visibility", "domain");

CREATE INDEX "SpaceFolderVote_memberId_idx"
ON "SpaceFolderVote"("memberId");

ALTER TABLE "SpaceFolder"
ADD CONSTRAINT "SpaceFolder_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "PrivateSpace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpaceFolder"
ADD CONSTRAINT "SpaceFolder_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpaceFolder"
ADD CONSTRAINT "SpaceFolder_parentId_fkey"
FOREIGN KEY ("parentId") REFERENCES "SpaceFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpaceFolderVote"
ADD CONSTRAINT "SpaceFolderVote_folderId_fkey"
FOREIGN KEY ("folderId") REFERENCES "SpaceFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SpaceFolderVote"
ADD CONSTRAINT "SpaceFolderVote_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "SpaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
