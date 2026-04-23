-- AlterTable
ALTER TABLE "FileComment" ADD COLUMN     "isEncrypted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "iv" TEXT;
