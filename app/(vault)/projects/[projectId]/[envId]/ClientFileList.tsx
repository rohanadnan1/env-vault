"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, MoreHorizontal, Trash2, Edit3, Download, GripVertical, FileCode2, FileJson, FileImage, ShieldAlert, BookText, Code2, Database } from 'lucide-react';
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

const getFileTypeConfig = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch(ext) {
    case 'js': case 'jsx': case 'ts': case 'tsx': 
      return { icon: FileCode2, textColor: 'text-yellow-600', bgColor: 'bg-yellow-100 group-hover:bg-yellow-200', label: 'JavaScript / TS' };
    case 'py': 
      return { icon: FileCode2, textColor: 'text-blue-600', bgColor: 'bg-blue-100 group-hover:bg-blue-200', label: 'Python' };
    case 'json': 
      return { icon: FileJson, textColor: 'text-emerald-600', bgColor: 'bg-emerald-100 group-hover:bg-emerald-200', label: 'JSON Data' };
    case 'md': case 'mdx': 
      return { icon: BookText, textColor: 'text-slate-600', bgColor: 'bg-slate-100 group-hover:bg-slate-200', label: 'Markdown Document' };
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': 
      return { icon: FileImage, textColor: 'text-pink-600', bgColor: 'bg-pink-100 group-hover:bg-pink-200', label: 'Image Asset' };
    case 'env': 
      return { icon: ShieldAlert, textColor: 'text-red-600', bgColor: 'bg-red-100 group-hover:bg-red-200', label: 'Environment Variables' };
    case 'css': case 'scss': case 'less': 
      return { icon: Code2, textColor: 'text-cyan-600', bgColor: 'bg-cyan-100 group-hover:bg-cyan-200', label: 'Cascading Styles' };
    case 'sql': case 'db': 
      return { icon: Database, textColor: 'text-indigo-600', bgColor: 'bg-indigo-100 group-hover:bg-indigo-200', label: 'Database / SQL' };
    default: 
      return { icon: FileText, textColor: 'text-slate-500', bgColor: 'bg-slate-100 group-hover:bg-slate-200', label: 'Plain Text' };
  }
};

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

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/envvault', JSON.stringify({ type: 'file', id, sourceId: folderId }));
  };

  if (!files || files.length === 0) return null;

  return (
    <>
      <div className="divide-y divide-slate-50">
        {files.map((file) => {
          const config = getFileTypeConfig(file.name);
          const Icon = config.icon;
          
          return (
          <div 
            key={file.id} 
            draggable
            onDragStart={(e) => handleDragStart(e, file.id)}
            className="flex items-center justify-between p-4 hover:bg-slate-50 cursor-pointer group transition-colors"
            onClick={() => handleEdit(file)}
          >
            <div className="flex items-center gap-3">
              <GripVertical className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 cursor-grab shrink-0 -ml-2" />
              <div className={`p-2 rounded-lg transition-colors ${config.bgColor} ${config.textColor}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900">{file.name}</span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wider">
                  {config.label} &bull; {new Date(file.createdAt).toLocaleDateString()}
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
        )})}
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
