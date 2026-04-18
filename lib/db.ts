import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export interface FolderNode {
  id: string;
  name: string;
  environmentId: string;
  parentId: string | null;
  children: FolderNode[];
}

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
  const folderMap = new Map<string, FolderNode>();
  const roots: FolderNode[] = [];

  allFolders.forEach(folder => {
    folderMap.set(folder.id, { ...folder, children: [] });
  });

  allFolders.forEach(folder => {
    const folderWithChildren = folderMap.get(folder.id)!;
    if (folder.parentId && folderMap.has(folder.parentId)) {
      folderMap.get(folder.parentId)!.children.push(folderWithChildren);
    } else {
      roots.push(folderWithChildren);
    }
  });

  return roots;
}
