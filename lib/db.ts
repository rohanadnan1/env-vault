import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
const isProduction = process.env.NODE_ENV === "production";

function getDatabaseUrl() {
  const isServerlessProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const raw = isServerlessProd
    ? process.env.DATABASE_URL
    : process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!raw) return raw;

  try {
    const url = new URL(raw);

    if (!url.searchParams.has('connect_timeout')) {
      url.searchParams.set('connect_timeout', '5');
    }

    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '8');
    }

    if (isServerlessProd && !url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1');
    }

    if (!isServerlessProd && !url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '5');
    }

    return url.toString();
  } catch {
    return raw;
  }
}

function createPrismaClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
  });
}

// Always cache PrismaClient on globalThis to prevent connection-pool exhaustion
// from Turbopack evaluating this module fresh for every route handler.
export const db = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = db;

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
