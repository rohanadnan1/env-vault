-- AlterTable
ALTER TABLE "SecretHistory"
ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "previousHistoryId" TEXT;

-- Backfill existing secret history rows into a linked revision chain per secret.
WITH ordered AS (
    SELECT
        "id",
        "secretId",
        ROW_NUMBER() OVER (PARTITION BY "secretId" ORDER BY "createdAt" ASC, "id" ASC) AS rev,
        LAG("id") OVER (PARTITION BY "secretId" ORDER BY "createdAt" ASC, "id" ASC) AS prev_id
    FROM "SecretHistory"
)
UPDATE "SecretHistory" h
SET
    "revisionNumber" = o.rev,
    "previousHistoryId" = o.prev_id
FROM ordered o
WHERE h."id" = o."id";

-- CreateIndex
CREATE INDEX "SecretHistory_secretId_createdAt_idx" ON "SecretHistory"("secretId", "createdAt");

-- AddForeignKey
ALTER TABLE "SecretHistory" ADD CONSTRAINT "SecretHistory_previousHistoryId_fkey"
FOREIGN KEY ("previousHistoryId") REFERENCES "SecretHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "FileHistory" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "previousHistoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileHistory_fileId_createdAt_idx" ON "FileHistory"("fileId", "createdAt");

-- AddForeignKey
ALTER TABLE "FileHistory" ADD CONSTRAINT "FileHistory_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "VaultFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileHistory" ADD CONSTRAINT "FileHistory_previousHistoryId_fkey"
FOREIGN KEY ("previousHistoryId") REFERENCES "FileHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
