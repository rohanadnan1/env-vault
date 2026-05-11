-- AlterTable
ALTER TABLE "UserSecret"
ADD COLUMN "keyName" TEXT;

-- Backfill from existing king-linked secrets
UPDATE "UserSecret" AS us
SET "keyName" = ks."keyName"
FROM "KingSecret" AS ks
WHERE us."kingSecretId" = ks."id"
  AND us."keyName" IS NULL;

-- Make the column required after backfill
ALTER TABLE "UserSecret"
ALTER COLUMN "keyName" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "UserSecret_memberId_keyName_key" ON "UserSecret"("memberId", "keyName");
