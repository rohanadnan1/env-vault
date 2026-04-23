-- CreateEnum
CREATE TYPE "BundleType" AS ENUM ('EXTENSION', 'NAME', 'CUSTOM');

-- CreateTable
CREATE TABLE "FileBundle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bundleType" "BundleType" NOT NULL,
    "matchRule" TEXT,
    "folderId" TEXT,
    "environmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileBundleMember" (
    "fileId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileBundleMember_pkey" PRIMARY KEY ("fileId","bundleId")
);

-- CreateIndex
CREATE INDEX "FileBundle_environmentId_folderId_idx" ON "FileBundle"("environmentId", "folderId");

-- CreateIndex
CREATE INDEX "FileBundleMember_bundleId_idx" ON "FileBundleMember"("bundleId");

-- AddForeignKey
ALTER TABLE "FileBundle" ADD CONSTRAINT "FileBundle_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileBundle" ADD CONSTRAINT "FileBundle_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileBundleMember" ADD CONSTRAINT "FileBundleMember_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "VaultFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileBundleMember" ADD CONSTRAINT "FileBundleMember_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "FileBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
