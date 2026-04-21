import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function getDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return raw;

  const isServerlessProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  if (!isServerlessProd) return raw;

  try {
    const url = new URL(raw);

    // Prevent exhausting pooled sessions on serverless cold starts.
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1');
    }

    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '20');
    }

    return url.toString();
  } catch {
    return raw;
  }
}

export const db = globalForPrisma.prisma || new PrismaClient({
  datasources: {
    db: {
      url: getDatabaseUrl(),
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
