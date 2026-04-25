"use client";

import { useState, useRef, useEffect, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FolderTree, type DragPayload } from '@/components/vault/FolderTree';
import { type FolderNode } from '@/lib/db';
import { CreateFolderModal } from '@/components/vault/CreateFolderModal';
import { RenameFolderModal } from '@/components/vault/RenameFolderModal';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Database, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ENV_FOLDER_NAME, isSystemFolderName } from '@/lib/system-folder';
import { useVaultStore } from '@/lib/store/vaultStore';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { encryptSecret } from '@/lib/crypto/encrypt';

export function ClientFolderSelector({ 
  folderTree, 
  activeFolderId, 
  projectId, 
  envId 
}: { 
  folderTree: FolderNode[];
  activeFolderId?: string;
  projectId: string;
  envId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const derivedKey = useVaultStore((s) => s.derivedKey);

  const [optimisticTree, setOptimisticTree] = useState(folderTree);

  const sortedRootFolders = useMemo(() => {
    const canonicalSystemFolders = optimisticTree.filter(
      (folder) => folder.name.trim().toLowerCase() === ENV_FOLDER_NAME
    );
    const legacySystemFolders = optimisticTree.filter(
      (folder) => isSystemFolderName(folder.name) && folder.name.trim().toLowerCase() !== ENV_FOLDER_NAME
    );
    const nonSystemFolders = optimisticTree.filter(
      (folder) => !isSystemFolderName(folder.name)
    );

    return [...canonicalSystemFolders, ...legacySystemFolders, ...nonSystemFolders];
  }, [optimisticTree]);

  const pinnedRootFolderIds = useMemo(
    () => sortedRootFolders.filter((folder) => isSystemFolderName(folder.name)).map((folder) => folder.id),
    [sortedRootFolders]
  );

  // Sync with server props
  useEffect(() => {
    setOptimisticTree(folderTree);
  }, [folderTree]);
  
  // Create / Create Sub
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  // Rename
  const [selectedFolderForAction, setSelectedFolderForAction] = useState<{ id: string, name: string } | null>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  
  // Delete
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Root drop zone state
  const [isRootDragOver, setIsRootDragOver] = useState(false);
  const rootDragCounter = useRef(0);
  const isRootActive = !activeFolderId;

  const handleDelete = async () => {
    if (!selectedFolderForAction) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/folders/${selectedFolderForAction.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete folder');

      toast.success('Folder deleted successfully');
      setIsDeleteOpen(false);
      
      if (activeFolderId === selectedFolderForAction.id) {
        router.push(`/projects/${projectId}/${envId}`);
      } else {
        router.refresh();
      }
    } catch {
      toast.error('Failed to delete folder');
    } finally {
      setIsDeleting(false);
    }
  };

  // Recursive utility to detach a node from its current branch, returning [newTree, detachedNode]
  const removeNode = (nodes: FolderNode[], idToRemove: string): [FolderNode[], FolderNode | null] => {
    let detached: FolderNode | null = null;
    const newNodes = nodes.reduce((acc, n) => {
      if (n.id === idToRemove) {
        detached = n;
        return acc;
      }
      const [newChildren, childDetached] = removeNode(n.children, idToRemove);
      if (childDetached) detached = childDetached;
      acc.push({ ...n, children: newChildren });
      return acc;
    }, [] as FolderNode[]);
    return [newNodes, detached];
  };

  // Recursive utility to attach a node to a target parent
  const insertNode = (nodes: FolderNode[], targetParentId: string | null, nodeToInsert: FolderNode): FolderNode[] => {
    if (!targetParentId) {
      // Root level insertion
      return [...nodes, { ...nodeToInsert, parentId: null }];
    }
    return nodes.map(n => {
      if (n.id === targetParentId) {
        return { ...n, children: [...n.children, { ...nodeToInsert, parentId: targetParentId }] };
      }
      return { ...n, children: insertNode(n.children, targetParentId, nodeToInsert) };
    });
  };

  const findFolderById = (nodes: FolderNode[], id: string): FolderNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const childMatch = findFolderById(node.children, id);
      if (childMatch) return childMatch;
    }
    return null;
  };

  /** Called by FolderItem or root drop zone when something is dropped */
  const handleDrop = async (payload: DragPayload, targetFolderId: string | null) => {
    if (payload.type === 'file' && targetFolderId) {
      const targetFolder = findFolderById(optimisticTree, targetFolderId);
      if (targetFolder && isSystemFolderName(targetFolder.name)) {
        toast.error(`Files cannot be moved into an ${ENV_FOLDER_NAME} folder.`);
        return;
      }
    }

    try {
      // OPTIMISTIC UPDATE: Instant UI feedback
      if (payload.type === 'folder') {
        setOptimisticTree(prev => {
          const [treeWithoutNode, node] = removeNode(prev, payload.id);
          if (!node) return prev;
          return insertNode(treeWithoutNode, targetFolderId, node);
        });
      } else if (payload.type === 'secret' || payload.type === 'file') {
        // Dispatch instant event for VaultStructureView to update
        window.dispatchEvent(new CustomEvent('optimistic-move', { detail: payload }));
      }

      // BACKGROUND API CALL
      if (payload.type === 'folder') {
        const res = await fetch(`/api/folders/${payload.id}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parentId: targetFolderId, environmentId: envId }),
        });
        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error || 'Failed to move folder');
          startTransition(() => router.refresh()); // rollback on error
          return;
        }
      } else if (payload.type === 'secret') {
        const res = await fetch(`/api/secrets/${payload.id}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: targetFolderId }),
        });
        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error || 'Failed to move secret');
          window.dispatchEvent(new CustomEvent('optimistic-move', { detail: { type: 'secret-revert' } }));
          startTransition(() => router.refresh()); // rollback on error
          return;
        }
      } else if (payload.type === 'file') {
        // Re-encrypt the file content with the canonical `${name}:${environmentId}` AAD
        // so that moves never cause AAD drift (which makes files permanently unreadable
        // in the rekey flow and in the vault after future master-key changes).
        let reEncrypted: { contentEncrypted: string; iv: string } | undefined;
        if (derivedKey) {
          try {
            const fileRes = await fetch(`/api/vault-files/${payload.id}`);
            if (fileRes.ok) {
              const file = await fileRes.json() as { name: string; contentEncrypted: string; iv: string };
              // Try decrypting in priority order: env-scoped (new files), old-folder-scoped
              // (using sourceId = the folder the file is being dragged FROM), then no AAD.
              let plaintext: string | null = null;
              for (const aad of [
                `${file.name}:${envId}`,
                payload.sourceId ? `${file.name}:${payload.sourceId}` : null,
                undefined,
              ]) {
                if (aad === null) continue;
                try {
                  plaintext = await decryptSecret(file.contentEncrypted, file.iv, derivedKey, aad);
                  break;
                } catch { /* try next */ }
              }
              if (plaintext !== null) {
                // Always re-encrypt with environmentId-scoped AAD going forward
                const enc = await encryptSecret(plaintext, derivedKey, `${file.name}:${envId}`);
                reEncrypted = { contentEncrypted: enc.valueEncrypted, iv: enc.iv };
              }
            }
          } catch { /* vault locked or fetch failed — proceed without re-encryption */ }
        }

        const res = await fetch(`/api/vault-files/${payload.id}/move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderId: targetFolderId, ...reEncrypted }),
        });
        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error || 'Failed to move file');
          window.dispatchEvent(new CustomEvent('optimistic-move', { detail: { type: 'file-revert' } }));
          startTransition(() => router.refresh()); // rollback on error
          return;
        }
      }

      // BACKGROUND REFRESH: Fetch true server state silently
      startTransition(() => {
        router.refresh();
      });
    } catch {
      toast.error('Move failed — please try again');
      startTransition(() => {
        router.refresh(); // rollback
      });
    }
  };

  // ── Root drop zone handlers ──
  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleRootDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    rootDragCounter.current++;
    setIsRootDragOver(true);
  };
  const handleRootDragLeave = () => {
    rootDragCounter.current--;
    if (rootDragCounter.current === 0) setIsRootDragOver(false);
  };
  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    rootDragCounter.current = 0;
    setIsRootDragOver(false);
    try {
      const raw = e.dataTransfer.getData('application/envvault');
      if (!raw) return;
      const payload = JSON.parse(raw) as DragPayload;
      handleDrop(payload, null);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="min-h-full flex flex-col">
        {/* Root-level drop zone (move to env root) */}
        <div
          role="button"
          tabIndex={0}
          onDragOver={handleRootDragOver}
          onDragEnter={handleRootDragEnter}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
          onClick={() => {
            router.push(`/projects/${projectId}/${envId}`);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(`/projects/${projectId}/${envId}`);
            }
          }}
          onMouseEnter={() => {
            router.prefetch(`/projects/${projectId}/${envId}`);
          }}
          className={cn(
            "mb-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 transition-all cursor-pointer select-none hover:text-indigo-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1",
            isRootActive && "text-indigo-600 bg-indigo-50/70",
            isRootDragOver && "bg-indigo-50 ring-2 ring-indigo-400 ring-inset text-indigo-500"
          )}
          aria-label="Go to root folder"
        >
          <Database className="w-3 h-3" />
          {isRootDragOver ? "Drop to move to root" : "Root"}
        </div>

        {pinnedRootFolderIds.length > 0 && (
          <div className="mt-1.5 mb-1 px-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
              <span>System</span>
              <span className="h-px flex-1 bg-indigo-100" />
            </div>
          </div>
        )}

        <FolderTree 
          folders={sortedRootFolders} 
          pinnedRootFolderIds={pinnedRootFolderIds}
          activeFolderId={activeFolderId}
          onSelect={(id) => {
            router.push(`/projects/${projectId}/${envId}/${id}`);
          }}
          onPrefetch={(id) => {
            router.prefetch(`/projects/${projectId}/${envId}/${id}`);
          }}
          onCreateSubfolder={(id) => {
            setSelectedParentId(id);
            setIsCreateOpen(true);
          }}
          onRename={(id, name) => {
            setSelectedFolderForAction({ id, name });
            setIsRenameOpen(true);
          }}
          onDelete={(id, name) => {
            setSelectedFolderForAction({ id, name });
            setIsDeleteOpen(true);
          }}
          onDrop={handleDrop}
        />

        {/* Empty space below folders behaves as root drop target */}
        <div
          className={cn(
            "flex-1 min-h-10 mt-1 rounded-md transition-all",
            isRootDragOver && "bg-indigo-50 ring-2 ring-indigo-400 ring-inset flex items-center justify-center"
          )}
          onDragOver={handleRootDragOver}
          onDragEnter={handleRootDragEnter}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
          aria-hidden={!isRootDragOver}
        >
          {isRootDragOver && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-500">
              Drop to move to root
            </span>
          )}
        </div>
      </div>

      <CreateFolderModal 
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        environmentId={envId}
        parentId={selectedParentId}
      />

      <RenameFolderModal 
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
        folderId={selectedFolderForAction?.id || ""}
        initialName={selectedFolderForAction?.name || ""}
      />

      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600 font-bold">
              <AlertTriangle className="w-5 h-5" />
              Delete Folder?
            </DialogTitle>
            <DialogDescription className="pt-2 text-slate-600 font-medium">
              Are you sure you want to delete <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 rounded">{selectedFolderForAction?.name}</span>?
            </DialogDescription>
            <p className="text-xs text-slate-400 pt-2 italic leading-relaxed">
              This will permanently delete the folder and all nested secrets and subfolders. This action cannot be undone.
            </p>
          </DialogHeader>
          <DialogFooter className="pt-6 sm:justify-between gap-3">
            <Button 
              variant="ghost" 
              onClick={() => setIsDeleteOpen(false)}
              disabled={isDeleting}
              className="rounded-xl flex-1 border border-slate-200"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded-xl flex-1 font-bold shadow-lg shadow-rose-200"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
