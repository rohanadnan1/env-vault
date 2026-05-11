-- AlterTable
ALTER TABLE "UserFile"
ALTER COLUMN "kingFileId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "UserSecret"
ALTER COLUMN "kingSecretId" DROP NOT NULL;
