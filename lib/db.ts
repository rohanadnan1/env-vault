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

export function buildFolderTree(allFolders: { id: string; name: string; parentId: string | null; environmentId: string }[]): FolderNode[] {
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

/** Walk the parent chain of a folder and return ancestors ordered root → current */
export function buildFolderAncestors(
  folderId: string, 
  allFolders: { id: string; name: string; parentId: string | null }[]
): { id: string; name: string }[] {
  const ancestors: { id: string; name: string }[] = [];
  const folderMap = new Map(allFolders.map(f => [f.id, f]));

  let id: string | null = folderId;
  while (id) {
    const f = folderMap.get(id);
    if (!f) break;
    ancestors.unshift({ id: f.id, name: f.name });
    id = f.parentId;
  }

  return ancestors;
}
