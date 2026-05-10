-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "codesGeneratedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFAEncryptedMaster" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFAMasterIv" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFAUnlockToken" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "encryptedMaster" TEXT NOT NULL,
    "masterIv" TEXT NOT NULL,
    "codeSalt" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");
CREATE INDEX IF NOT EXISTS "RecoveryCode_userId_codeHash_idx" ON "RecoveryCode"("userId", "codeHash");

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
