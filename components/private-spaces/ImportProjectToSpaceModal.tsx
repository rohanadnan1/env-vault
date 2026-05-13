"use client";

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, FolderGit2, ShieldCheck, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useVaultStore } from '@/lib/store/vaultStore';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { encryptSecret } from '@/lib/crypto/encrypt';

type ProjectOption = {
  id: string;
  name: string;
  _count?: {
    environments?: number;
  };
  environments?: Array<{
    id: string;
    name: string;
    _count?: {
      secrets?: number;
    };
  }>;
};

type ProjectImportSnapshot = {
  project: {
    id: string;
    name: string;
  };
  summary: {
    environmentCount: number;
    folderCount: number;
    fileCount: number;
    secretCount: number;
  };
  environments: Array<{
    id: string;
    name: string;
    folders: Array<{
      id: string;
      name: string;
      parentId: string | null;
      relativePath: string;
    }>;
    files: Array<{
      id: string;
      name: string;
      contentEncrypted: string;
      iv: string;
      relativeFolderPath: string;
      aadScopeId: string;
      environmentId: string;
    }>;
    secrets: Array<{
      id: string;
      keyName: string;
      valueEncrypted: string;
      iv: string;
      relativeFolderPath: string;
      aadScopeId: string;
      environmentId: string;
    }>;
  }>;
};

export type ImportProjectResult = {
  rootFolderPath: string;
  projectId: string;
  projectName: string;
  summary: {
    filesImported: number;
    secretsImported: number;
    foldersSynced: number;
  };
  files: Array<{
    id: string;
    kingFileId: string | null;
    workspaceMode: 'DRAFT' | 'FORK' | 'SYNC';
    name: string;
    contentEncrypted: string;
    iv: string;
    folderPath: string;
    createdAt: string;
    updatedAt: string;
    kingFile: null;
    peers: [];
  }>;
  secrets: Array<{
    id: string;
    kingSecretId: string | null;
    workspaceMode: 'DRAFT' | 'FORK' | 'SYNC';
    keyName: string;
    valueEncrypted: string;
    iv: string;
    folderPath: string;
    createdAt: string;
    updatedAt: string;
    kingSecret: null;
  }>;
  folders: Array<{
    id: string;
    visibility: 'PERSONAL' | 'KING';
    domain: 'FILE' | 'SECRET';
    name: string;
    path: string;
    parentId: string | null;
    memberId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
};

export type ImportProjectClientPayload = {
  result: ImportProjectResult;
  decryptedFiles: Record<string, string>;
  decryptedSecrets: Record<string, string>;
};

function normalizeClientPath(folderPath?: string | null) {
  if (!folderPath) return '/';
  const trimmed = folderPath.trim();
  if (!trimmed || trimmed === '/') return '/';
  const segments = trimmed.split('/').map((segment) => segment.trim()).filter(Boolean);
  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function joinImportPath(rootFolderPath: string, relativeFolderPath: string) {
  const normalizedRoot = normalizeClientPath(rootFolderPath);
  const normalizedRelative = normalizeClientPath(relativeFolderPath);
  if (normalizedRelative === '/') {
    return normalizedRoot;
  }
  return normalizeClientPath(
    normalizedRoot === '/' ? normalizedRelative : `${normalizedRoot}${normalizedRelative}`
  );
}

async function decryptProjectFile(
  file: ProjectImportSnapshot['environments'][number]['files'][number],
  derivedKey: CryptoKey
) {
  try {
    return await decryptSecret(file.contentEncrypted, file.iv, derivedKey, `${file.name}:${file.aadScopeId}`);
  } catch {
    try {
      return await decryptSecret(file.contentEncrypted, file.iv, derivedKey, `${file.name}:${file.environmentId}`);
    } catch {
      return decryptSecret(file.contentEncrypted, file.iv, derivedKey);
    }
  }
}

async function decryptProjectSecret(
  secret: ProjectImportSnapshot['environments'][number]['secrets'][number],
  derivedKey: CryptoKey
) {
  try {
    return await decryptSecret(secret.valueEncrypted, secret.iv, derivedKey, `${secret.keyName}:${secret.aadScopeId}`);
  } catch {
    try {
      return await decryptSecret(secret.valueEncrypted, secret.iv, derivedKey, `${secret.keyName}:${secret.environmentId}`);
    } catch {
      return decryptSecret(secret.valueEncrypted, secret.iv, derivedKey);
    }
  }
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spaceId: string;
  spaceKey: CryptoKey | null;
  onImported: (payload: ImportProjectClientPayload) => void;
};

export function ImportProjectToSpaceModal({
  open,
  onOpenChange,
  spaceId,
  spaceKey,
  onImported,
}: Props) {
  const derivedKey = useVaultStore((state) => state.derivedKey);
  const touchActivity = useVaultStore((state) => state.touchActivity);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [snapshot, setSnapshot] = useState<ProjectImportSnapshot | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [targetRootPath, setTargetRootPath] = useState('/');

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setIsLoadingProjects(true);
    fetch('/api/projects', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Could not load projects');
        }
        if (cancelled) return;
        setProjects(payload);
        if (!selectedProjectId && payload.length > 0) {
          setSelectedProjectId(payload[0].id);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Could not load projects');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProjects(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedProjectId]);

  useEffect(() => {
    if (!open || !selectedProjectId) return;

    let cancelled = false;
    setIsLoadingSnapshot(true);
    fetch(`/api/projects/${selectedProjectId}/space-import`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || 'Could not prepare import');
        }
        if (cancelled) return;
        setSnapshot(payload);
        setTargetRootPath((current) => {
          const normalized = normalizeClientPath(current);
          if (normalized !== '/' && normalized !== '') {
            return normalized;
          }
          return normalizeClientPath(`/${payload.project.name}`);
        });
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Could not prepare import');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingSnapshot(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, selectedProjectId]);

  useEffect(() => {
    if (!open) {
      setSnapshot(null);
      setSelectedProjectId('');
      setTargetRootPath('/');
      setIsImporting(false);
    }
  }, [open]);

  async function handleImport() {
    if (!snapshot || !derivedKey || !spaceKey) {
      toast.error(!derivedKey ? 'Unlock your vault to import a project.' : 'Unlock the private space first.');
      return;
    }

    setIsImporting(true);
    try {
      touchActivity();
      const rootFolderPath = normalizeClientPath(targetRootPath || `/${snapshot.project.name}`);
      const decryptedFiles: Record<string, string> = {};
      const decryptedSecrets: Record<string, string> = {};
      const fileFolders = new Set<string>();
      const secretFolders = new Set<string>();

      for (const environment of snapshot.environments) {
        const envRootPath = joinImportPath(rootFolderPath, `/${environment.name}`);
        fileFolders.add(envRootPath);
        secretFolders.add(envRootPath);
        for (const folder of environment.folders) {
          const normalized = joinImportPath(rootFolderPath, folder.relativePath);
          fileFolders.add(normalized);
          secretFolders.add(normalized);
        }
      }

      const files = [] as Array<{
        name: string;
        folderPath: string;
        contentEncrypted: string;
        iv: string;
      }>;
      for (const environment of snapshot.environments) {
        for (const file of environment.files) {
          const plaintext = await decryptProjectFile(file, derivedKey);
          const encrypted = await encryptSecret(plaintext, spaceKey);
          const folderPath = joinImportPath(rootFolderPath, file.relativeFolderPath);
          const key = `${folderPath}::${file.name}`;
          decryptedFiles[key] = plaintext;
          files.push({
            name: file.name,
            folderPath,
            contentEncrypted: encrypted.valueEncrypted,
            iv: encrypted.iv,
          });
        }
      }

      const secrets = [] as Array<{
        keyName: string;
        folderPath: string;
        valueEncrypted: string;
        iv: string;
      }>;
      for (const environment of snapshot.environments) {
        for (const secret of environment.secrets) {
          const plaintext = await decryptProjectSecret(secret, derivedKey);
          const encrypted = await encryptSecret(plaintext, spaceKey);
          const folderPath = joinImportPath(rootFolderPath, secret.relativeFolderPath);
          const key = `${folderPath}::${secret.keyName}`;
          decryptedSecrets[key] = plaintext;
          secrets.push({
            keyName: secret.keyName,
            folderPath,
            valueEncrypted: encrypted.valueEncrypted,
            iv: encrypted.iv,
          });
        }
      }

      const response = await fetch(`/api/spaces/${spaceId}/imports/project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: snapshot.project.id,
          projectName: snapshot.project.name,
          rootFolderPath,
          fileFolders: Array.from(fileFolders),
          secretFolders: Array.from(secretFolders),
          files,
          secrets,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Could not import project');
      }

      onImported({
        result: payload,
        decryptedFiles,
        decryptedSecrets,
      });
      toast.success(`Imported ${snapshot.project.name} into the private space`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not import project');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Project Into Space</DialogTitle>
          <DialogDescription>
            Pull the latest project environments, files, and secrets into your private workspace as local drafts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={selectedProjectId}
                onValueChange={(value) => setSelectedProjectId(value ?? '')}
                disabled={isLoadingProjects || isImporting}
              >
                <SelectTrigger className="w-full h-10">
                  <SelectValue placeholder={isLoadingProjects ? 'Loading projects...' : 'Choose a project'} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="space-import-root">Target root folder</Label>
              <Input
                id="space-import-root"
                value={targetRootPath}
                onChange={(event) => setTargetRootPath(event.target.value)}
                onBlur={() => setTargetRootPath((current) => normalizeClientPath(current))}
                placeholder="/My Project"
                disabled={isImporting}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            {isLoadingSnapshot ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Preparing project snapshot...
              </div>
            ) : snapshot ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-indigo-200 bg-indigo-50 text-indigo-700">
                    <FolderGit2 className="mr-1 h-3 w-3" />
                    {snapshot.project.name}
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                    {snapshot.summary.environmentCount} envs
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                    {snapshot.summary.fileCount} files
                  </Badge>
                  <Badge variant="outline" className="border-slate-200 bg-white text-slate-700">
                    {snapshot.summary.secretCount} secrets
                  </Badge>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Environments</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{snapshot.summary.environmentCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Files</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{snapshot.summary.fileCount}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">Secrets</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900">{snapshot.summary.secretCount}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3">
                  <p className="text-xs font-medium text-slate-700">
                    The import keeps the latest project structure under <span className="font-semibold text-indigo-700">{normalizeClientPath(targetRootPath || `/${snapshot.project.name}`)}</span>.
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Files and secrets land as normal private-space drafts, so you can edit them locally and propose any item to King later.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {snapshot.environments.map((environment) => (
                    <div key={environment.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <p className="text-sm font-semibold text-slate-800">{environment.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {environment.files.length} files · {environment.secrets.length} secrets
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Choose a project to preview what will be imported.</p>
            )}
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
            <div className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Client-side secure import</p>
                <p className="mt-1">
                  Project contents are decrypted with your vault key in this browser tab, then immediately re-encrypted with the private-space key before upload.
                </p>
              </div>
            </div>
          </div>

          {!derivedKey && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Unlock your vault first so the importer can read your project data.
            </div>
          )}
          {!spaceKey && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Unlock the private-space key on this device first so the imported project can be encrypted for the space.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!snapshot || !derivedKey || !spaceKey || isImporting}>
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing project
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Import Project
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
