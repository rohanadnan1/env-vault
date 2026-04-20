"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, FileUp, FilePlus, Copy, Loader2 } from 'lucide-react';
import { SecretEditor } from '@/components/vault/SecretEditor';
import { ImportModal } from '@/components/vault/ImportModal';
import { FileEditor } from '@/components/vault/FileEditor';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ENV_FOLDER_NAME, isSystemFolderName } from '@/lib/system-folder';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { useVaultStore } from '@/lib/store/vaultStore';

export function ClientSecretActions({ 
  projectId,
  environmentId, 
  folderId,
  currentFolderName,
  currentFolderDepth,
  secretsForCopy,
}: { 
  projectId: string;
  environmentId: string;
  folderId: string | null;
  currentFolderName: string | null;
  currentFolderDepth: number;
  secretsForCopy: { id: string; keyName: string; valueEncrypted: string; iv: string }[];
}) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFileEditorOpen, setIsFileEditorOpen] = useState(false);
  const [isNestedSecretPromptOpen, setIsNestedSecretPromptOpen] = useState(false);
  const [isCopyingAll, setIsCopyingAll] = useState(false);
  const router = useRouter();
  const isVariablesFolder = isSystemFolderName(currentFolderName || '');
  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  const handleAddSecretClick = () => {
    if (!folderId) {
      setIsEditorOpen(true);
      return;
    }

    if (isVariablesFolder) {
      setIsEditorOpen(true);
      return;
    }

    if (currentFolderDepth > 1) {
      setIsNestedSecretPromptOpen(true);
      return;
    }

    setIsEditorOpen(true);
  };

  const handleNewFileClick = () => {
    if (isVariablesFolder) {
      toast.error(`Files are not allowed inside an ${ENV_FOLDER_NAME} folder.`);
      return;
    }
    setIsFileEditorOpen(true);
  };

  const handleCopyAllVariables = async () => {
    if (!derivedKey) {
      toast.error('Vault is locked. Re-enter master password.');
      return;
    }

    if (secretsForCopy.length === 0) {
      toast.error('No variables to copy in this folder.');
      return;
    }

    setIsCopyingAll(true);
    touchActivity();

    try {
      const entries = await Promise.all(
        secretsForCopy.map(async (secret) => {
          const aad = `${secret.keyName}:${environmentId}`;
          const decryptedValue = await decryptSecret(secret.valueEncrypted, secret.iv, derivedKey, aad);
          return {
            keyName: secret.keyName,
            value: decryptedValue,
          };
        })
      );

      const envText = entries
        .map((entry) => `${entry.keyName}=${entry.value}`)
        .join('\n');

      await navigator.clipboard.writeText(envText);
      toast.success(
        `Copied ${entries.length} variable${entries.length === 1 ? '' : 's'} in .env format.`
      );
    } catch {
      toast.error('Failed to copy variables.');
    } finally {
      setIsCopyingAll(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button 
          variant="outline"
          size="sm" 
          className="shadow-sm border-slate-200"
          onClick={() => setIsImportOpen(true)}
        >
          <FileUp className="w-4 h-4 mr-2" /> Import
        </Button>
        <Button 
          variant="outline"
          size="sm" 
          className="shadow-sm border-slate-200"
          onClick={isVariablesFolder ? handleCopyAllVariables : handleNewFileClick}
          disabled={isCopyingAll}
        >
          {isVariablesFolder ? (
            <>
              {isCopyingAll ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Copy className="w-4 h-4 mr-2" />
              )}
              Copy .env
            </>
          ) : (
            <>
              <FilePlus className="w-4 h-4 mr-2" /> New File
            </>
          )}
        </Button>
        <Button 
          size="sm" 
          className="shadow-sm bg-indigo-600 hover:bg-indigo-700"
          onClick={handleAddSecretClick}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Secret
        </Button>
      </div>

      <SecretEditor 
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        environmentId={environmentId}
        folderId={folderId}
        onSuccess={(savedSecret) => {
          if (!savedSecret) {
            router.refresh();
            return;
          }

          if (savedSecret.folderId && savedSecret.folderId !== folderId) {
            if (!folderId) {
              if (savedSecret.autoCreatedVariablesFolder) {
                toast.success(`Created a root ${ENV_FOLDER_NAME} folder and stored your secret there.`);
              } else {
                toast.success(`Secret stored in the root ${ENV_FOLDER_NAME} folder.`);
              }
            } else if (savedSecret.autoCreatedVariablesFolder) {
              toast.success(`Created a new ${ENV_FOLDER_NAME} subfolder and stored your secret there.`);
            } else if (savedSecret.migratedToVariablesFolder) {
              toast.success(`Secret stored in the ${ENV_FOLDER_NAME} subfolder for better organization.`);
            }
            router.push(`/projects/${projectId}/${environmentId}/${savedSecret.folderId}`);
            return;
          }

          router.refresh();
        }}
      />

      <ImportModal
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        environmentId={environmentId}
        folderId={folderId}
        onSuccess={() => {
          router.refresh();
        }}
      />

      <FileEditor
        open={isFileEditorOpen}
        onOpenChange={setIsFileEditorOpen}
        folderId={folderId}
        environmentId={environmentId}
        onSuccess={() => {
          router.refresh();
        }}
      />

      <Dialog open={isNestedSecretPromptOpen} onOpenChange={setIsNestedSecretPromptOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Keep Env Variables Organized?</DialogTitle>
            <DialogDescription>
              To avoid clutter, an <span className="font-mono font-semibold">{ENV_FOLDER_NAME}</span> subfolder will be used inside this folder.
              Your new variable will be stored there automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <Button variant="ghost" onClick={() => setIsNestedSecretPromptOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setIsNestedSecretPromptOpen(false);
                setIsEditorOpen(true);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
