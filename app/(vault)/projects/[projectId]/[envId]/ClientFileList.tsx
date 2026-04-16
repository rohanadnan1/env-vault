"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, MoreHorizontal, Trash2, Edit3, Download } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FileEditor } from '@/components/vault/FileEditor';
import { toast } from 'sonner';

interface VaultFile {
  id: string;
  name: string;
  contentEncrypted: string;
  iv: string;
  mimeType: string;
  createdAt: string;
}

export function ClientFileList({
  files,
  folderId,
  environmentId
}: {
  files: VaultFile[];
  folderId: string;
  environmentId: string;
}) {
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const router = useRouter();

  const handleEdit = (file: VaultFile) => {
    setSelectedFile(file);
    setIsEditorOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;

    try {
      const res = await fetch(`/api/vault-files/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('File deleted');
      router.refresh();
    } catch (err) {
      toast.error('Could not delete file');
    }
  };

  return (
    <>
      <div className="divide-y divide-slate-50">
        {files.map((file) => (
          <div 
            key={file.id} 
            className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer group transition-colors"
            onClick={() => handleEdit(file)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 group-hover:bg-indigo-100 transition-colors">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900">{file.name}</span>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  {new Date(file.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger 
                render={
                  <button 
                    className="p-2 hover:bg-slate-200/50 rounded-full text-slate-400 opacity-0 group-hover:opacity-100 transition-all outline-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => handleEdit(file)}>
                  <Edit3 className="w-3.5 h-3.5 mr-2" /> Edit Content
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {}}>
                  <Download className="w-3.5 h-3.5 mr-2" /> Download
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-rose-600 focus:text-rose-600" 
                  onClick={() => handleDelete(file.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ))}
      </div>

      {selectedFile && (
        <FileEditor
          open={isEditorOpen}
          onOpenChange={setIsEditorOpen}
          folderId={folderId}
          environmentId={environmentId}
          initialData={selectedFile}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </>
  );
}
