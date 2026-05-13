import { normalizeSpacePath } from '@/lib/private-space';

type ProjectFolderLike = {
  id: string;
  name: string;
  parentId: string | null;
};

export function buildProjectFolderPathMap(folders: ProjectFolderLike[]) {
  const folderMap = new Map(folders.map((folder) => [folder.id, folder]));
  const pathMap = new Map<string, string>();

  const resolvePath = (folderId: string): string => {
    const cached = pathMap.get(folderId);
    if (cached) {
      return cached;
    }

    const folder = folderMap.get(folderId);
    if (!folder) {
      return '/';
    }

    const parentPath = folder.parentId ? resolvePath(folder.parentId) : '/';
    const nextPath = normalizeSpacePath(
      parentPath === '/' ? `/${folder.name}` : `${parentPath}/${folder.name}`
    );
    pathMap.set(folderId, nextPath);
    return nextPath;
  };

  for (const folder of folders) {
    resolvePath(folder.id);
  }

  return pathMap;
}

export function buildProjectImportRelativePath(
  environmentName: string,
  folderPathWithinEnvironment?: string | null
) {
  const envPath = normalizeSpacePath(`/${environmentName}`);
  const nestedPath = normalizeSpacePath(folderPathWithinEnvironment);
  if (nestedPath === '/') {
    return envPath;
  }
  return normalizeSpacePath(`${envPath}${nestedPath}`);
}

export function joinSpaceImportPath(rootFolderPath: string, relativeFolderPath: string) {
  const normalizedRoot = normalizeSpacePath(rootFolderPath);
  const normalizedRelative = normalizeSpacePath(relativeFolderPath);
  if (normalizedRelative === '/') {
    return normalizedRoot;
  }
  return normalizeSpacePath(
    normalizedRoot === '/' ? normalizedRelative : `${normalizedRoot}${normalizedRelative}`
  );
}
