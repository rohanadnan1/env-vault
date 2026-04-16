"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Plus, FileUp, FilePlus } from 'lucide-react';
import { SecretEditor } from '@/components/vault/SecretEditor';
import { ImportModal } from '@/components/vault/ImportModal';
import { FileEditor } from '@/components/vault/FileEditor';

export function ClientSecretActions({ 
  environmentId, 
  folderId 
}: { 
  environmentId: string;
  folderId: string | null;
}) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFileEditorOpen, setIsFileEditorOpen] = useState(false);
  const router = useRouter();

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
          onClick={() => setIsFileEditorOpen(true)}
          disabled={!folderId}
          title={!folderId ? "Select a folder to add files" : ""}
        >
          <FilePlus className="w-4 h-4 mr-2" /> New File
        </Button>
        <Button 
          size="sm" 
          className="shadow-sm bg-indigo-600 hover:bg-indigo-700"
          onClick={() => setIsEditorOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" /> Add Secret
        </Button>
      </div>

      <SecretEditor 
        open={isEditorOpen}
        onOpenChange={setIsEditorOpen}
        environmentId={environmentId}
        folderId={folderId}
        onSuccess={() => {
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

      {folderId && (
        <FileEditor
          open={isFileEditorOpen}
          onOpenChange={setIsFileEditorOpen}
          folderId={folderId}
          environmentId={environmentId}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </>
  );
}
