"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FolderTree } from '@/components/vault/FolderTree';
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
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ClientFolderSelector({ 
  folderTree, 
  activeFolderId, 
  projectId, 
  envId 
}: { 
  folderTree: unknown[];
  activeFolderId?: string;
  projectId: string;
  envId: string;
}) {
  const router = useRouter();
  
  // Create / Create Sub
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  
  // Rename
  const [selectedFolderForAction, setSelectedFolderForAction] = useState<{ id: string, name: string } | null>(null);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  
  // Delete
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
      
      // If we are currently in that folder, navigate up
      if (activeFolderId === selectedFolderForAction.id) {
        router.push(`/projects/${projectId}/${envId}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error('Failed to delete folder');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <FolderTree 
        folders={folderTree} 
        activeFolderId={activeFolderId}
        onSelect={(id) => {
          router.push(`/projects/${projectId}/${envId}/${id}`);
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
      />

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
              This will permanently delete the folder and **all nested secrets and subfolders**. This action cannot be undone.
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
