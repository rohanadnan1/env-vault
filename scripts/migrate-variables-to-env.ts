import { Prisma, PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const LEGACY_NAME = 'variables';
const TARGET_NAME = 'env';
const isDryRun = process.argv.includes('--dry-run');

type Stats = {
  legacyFoldersFound: number;
  foldersRenamed: number;
  foldersMerged: number;
  foldersDeleted: number;
  filesMoved: number;
  childFoldersReparented: number;
  secretsMoved: number;
  duplicateSecretsRemoved: number;
  secretConflicts: number;
  foldersNeedingManualCleanup: number;
};

const stats: Stats = {
  legacyFoldersFound: 0,
  foldersRenamed: 0,
  foldersMerged: 0,
  foldersDeleted: 0,
  filesMoved: 0,
  childFoldersReparented: 0,
  secretsMoved: 0,
  duplicateSecretsRemoved: 0,
  secretConflicts: 0,
  foldersNeedingManualCleanup: 0,
};

function log(message: string) {
  console.log(`[migrate:variables->env] ${message}`);
}

function normalize(name: string) {
  return name.trim().toLowerCase();
}

async function moveSecrets(
  tx: Prisma.TransactionClient,
  legacyFolderId: string,
  targetFolderId: string,
  environmentId: string
) {
  const secrets = await tx.secret.findMany({
    where: { folderId: legacyFolderId },
    select: {
      id: true,
      keyName: true,
      valueEncrypted: true,
      iv: true,
    },
  });

  for (const secret of secrets) {
    const conflict = await tx.secret.findFirst({
      where: {
        environmentId,
        folderId: targetFolderId,
        keyName: secret.keyName,
      },
      select: {
        id: true,
        valueEncrypted: true,
        iv: true,
      },
    });

    if (!conflict) {
      if (!isDryRun) {
        await tx.secret.update({
          where: { id: secret.id },
          data: { folderId: targetFolderId },
        });
      }
      stats.secretsMoved += 1;
      continue;
    }

    if (conflict.valueEncrypted === secret.valueEncrypted && conflict.iv === secret.iv) {
      if (!isDryRun) {
        await tx.secret.delete({ where: { id: secret.id } });
      }
      stats.duplicateSecretsRemoved += 1;
      continue;
    }

    stats.secretConflicts += 1;
    log(
      `Conflict for key "${secret.keyName}" in folder ${legacyFolderId}. ` +
      `A different secret with the same key already exists in folder ${targetFolderId}.`
    );
  }
}

async function processLegacyFolder(legacyFolderId: string) {
  await db.$transaction(async (tx) => {
    const legacyFolder = await tx.folder.findUnique({
      where: { id: legacyFolderId },
      select: {
        id: true,
        name: true,
        parentId: true,
        environmentId: true,
      },
    });

    if (!legacyFolder || normalize(legacyFolder.name) !== LEGACY_NAME) {
      return;
    }

    const envFolder = await tx.folder.findFirst({
      where: {
        environmentId: legacyFolder.environmentId,
        parentId: legacyFolder.parentId,
        name: {
          equals: TARGET_NAME,
          mode: 'insensitive',
        },
        NOT: { id: legacyFolder.id },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!envFolder) {
      if (!isDryRun) {
        await tx.folder.update({
          where: { id: legacyFolder.id },
          data: { name: TARGET_NAME },
        });
      }
      stats.foldersRenamed += 1;
      return;
    }

    stats.foldersMerged += 1;

    if (isDryRun) {
      const fileCount = await tx.vaultFile.count({ where: { folderId: legacyFolder.id } });
      const childCount = await tx.folder.count({ where: { parentId: legacyFolder.id } });
      stats.filesMoved += fileCount;
      stats.childFoldersReparented += childCount;
    } else {
      const movedFiles = await tx.vaultFile.updateMany({
        where: { folderId: legacyFolder.id },
        data: { folderId: envFolder.id },
      });
      stats.filesMoved += movedFiles.count;

      // Child folders under a legacy system folder are reparented to the legacy folder's parent.
      const reparentedChildren = await tx.folder.updateMany({
        where: { parentId: legacyFolder.id },
        data: { parentId: legacyFolder.parentId },
      });
      stats.childFoldersReparented += reparentedChildren.count;
    }

    await moveSecrets(tx, legacyFolder.id, envFolder.id, legacyFolder.environmentId);

    const remaining = await tx.folder.findUnique({
      where: { id: legacyFolder.id },
      select: {
        _count: {
          select: {
            secrets: true,
            vaultFiles: true,
            children: true,
          },
        },
      },
    });

    const hasRemainingData =
      (remaining?._count.secrets ?? 0) > 0 ||
      (remaining?._count.vaultFiles ?? 0) > 0 ||
      (remaining?._count.children ?? 0) > 0;

    if (hasRemainingData) {
      stats.foldersNeedingManualCleanup += 1;
      log(`Manual cleanup needed for legacy folder ${legacyFolder.id}. Remaining references were not auto-resolved.`);
      return;
    }

    if (!isDryRun) {
      await tx.folder.delete({ where: { id: legacyFolder.id } });
    }
    stats.foldersDeleted += 1;
  });
}

async function run() {
  log(`Starting one-time migration (${isDryRun ? 'dry-run' : 'apply'})`);

  const legacyFolders = await db.folder.findMany({
    where: {
      name: {
        equals: LEGACY_NAME,
        mode: 'insensitive',
      },
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  stats.legacyFoldersFound = legacyFolders.length;

  if (legacyFolders.length === 0) {
    log('No legacy "variables" folders found. Nothing to do.');
    return;
  }

  for (const folder of legacyFolders) {
    await processLegacyFolder(folder.id);
  }

  log('Migration complete. Summary:');
  log(`- legacy folders found: ${stats.legacyFoldersFound}`);
  log(`- folders renamed to env: ${stats.foldersRenamed}`);
  log(`- folders merged into existing env: ${stats.foldersMerged}`);
  log(`- legacy folders deleted after merge: ${stats.foldersDeleted}`);
  log(`- files moved: ${stats.filesMoved}`);
  log(`- child folders reparented: ${stats.childFoldersReparented}`);
  log(`- secrets moved: ${stats.secretsMoved}`);
  log(`- duplicate secrets removed: ${stats.duplicateSecretsRemoved}`);
  log(`- conflicting secrets requiring manual resolution: ${stats.secretConflicts}`);
  log(`- folders needing manual cleanup: ${stats.foldersNeedingManualCleanup}`);
}

run()
  .catch((error) => {
    console.error('[migrate:variables->env] Migration failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });