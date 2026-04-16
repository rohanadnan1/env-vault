import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export type FolderWithChildren = any; // Type defined in usage or below

export async function getFolderTree(environmentId: string, userId: string) {
  // Verify ownership via environment -> project -> user
  const env = await db.environment.findUnique({
    where: { id: environmentId },
    include: {
      project: {
        select: { userId: true }
      }
    }
  });

  if (!env || env.project.userId !== userId) {
    throw new Error("Unauthorized or Environment not found");
  }

  const allFolders = await db.folder.findMany({
    where: { environmentId },
    orderBy: { createdAt: 'asc' }
  });

  // Transform flat list to tree
  const folderMap = new Map();
  const roots: unknown[] = [];

  allFolders.forEach(folder => {
    folderMap.set(folder.id, { ...folder, children: [] });
  });

  allFolders.forEach(folder => {
    const folderWithChildren = folderMap.get(folder.id);
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId).children.push(folderWithChildren);
    } else {
      roots.push(folderWithChildren);
    }
  });

  return roots;
}
