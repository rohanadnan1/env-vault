"use client";

import { useState, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, MoreVertical, Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { type FolderNode } from '@/lib/db';

export type DragPayload =
  | { type: 'folder'; id: string }
  | { type: 'secret'; id: string; sourceId?: string | null }
  | { type: 'file'; id: string; sourceId?: string | null };

interface FolderTreeProps {
  folders: FolderNode[];
  activeFolderId?: string;
  onSelect: (id: string) => void;
  onCreateSubfolder?: (parentId: string) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string, name: string) => void;
  onDrop?: (payload: DragPayload, targetFolderId: string | null) => void;
  onPrefetch?: (id: string) => void;
}

export function FolderTree({ 
  folders, 
  activeFolderId, 
  onSelect, 
  onCreateSubfolder,
  onRename,
  onDelete,
  onDrop,
  onPrefetch,
}: FolderTreeProps) {
  return (
    <div className="space-y-0.5">
      {folders.map((folder) => (
        <FolderItem 
          key={folder.id} 
          folder={folder} 
          activeFolderId={activeFolderId} 
          onSelect={onSelect}
          onCreateSubfolder={onCreateSubfolder}
          onRename={onRename}
          onDelete={onDelete}
          onDrop={onDrop}
          onPrefetch={onPrefetch}
        />
      ))}
    </div>
  );
}

function FolderItem({ 
  folder, 
  activeFolderId, 
  onSelect,
  onCreateSubfolder,
  onRename,
  onDelete,
  onDrop,
  onPrefetch,
}: { 
  folder: FolderNode; 
  activeFolderId?: string; 
  onSelect: (id: string) => void;
  onCreateSubfolder?: (parentId: string) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string, name: string) => void;
  onDrop?: (payload: DragPayload, targetFolderId: string | null) => void;
  onPrefetch?: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);
  const isActive = activeFolderId === folder.id;
  const hasChildren = folder.children && folder.children.length > 0;

  // ── Drag SOURCE (this folder being dragged) ──
  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/envvault', JSON.stringify({ type: 'folder', id: folder.id }));
  };

  // ── Drag TARGET (items dropped onto this folder) ──
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);

    try {
      const raw = e.dataTransfer.getData('application/envvault');
      if (!raw) return;
      const payload = JSON.parse(raw) as DragPayload;
      // Don't drop a folder onto itself
      if (payload.type === 'folder' && payload.id === folder.id) return;
      // Don't drop an item into the folder it's already in
      if ((payload.type === 'file' || payload.type === 'secret') && payload.sourceId === folder.id) return;
      onDrop?.(payload, folder.id);
    } catch {
      // ignore malformed data
    }
  };

  return (
    <div className="select-none">
      <div 
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onMouseEnter={() => onPrefetch?.(folder.id)}
        className={cn(
          "group flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-all",
          isActive 
            ? "bg-indigo-50 text-indigo-700" 
            : "hover:bg-slate-100 text-slate-600",
          isDragOver && "ring-2 ring-indigo-400 ring-inset bg-indigo-50/60"
        )}
        onClick={() => onSelect(folder.id)}
      >
        <div className="flex items-center min-w-0 flex-1">
          {/* Expand/collapse toggle */}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(!isOpen);
            }}
            className={cn(
              "p-0.5 mr-1 rounded-sm hover:bg-slate-200/50 transition-colors",
              !hasChildren && "invisible"
            )}
          >
            {isOpen 
              ? <ChevronDown className="w-3.5 h-3.5" /> 
              : <ChevronRight className="w-3.5 h-3.5" />
            }
          </button>
          
          {isOpen 
            ? <FolderOpen className={cn("w-4 h-4 mr-2 shrink-0", isActive ? "text-indigo-600" : "text-slate-400")} /> 
            : <Folder className={cn("w-4 h-4 mr-2 shrink-0", isActive ? "text-indigo-600" : "text-slate-400")} />
          }
          
          <span className="text-sm font-medium truncate">{folder.name}</span>
        </div>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          {/* Drag handle visual affordance */}
          <GripVertical className="w-3 h-3 text-slate-300 cursor-grab" />

          <DropdownMenu>
            <DropdownMenuTrigger 
              render={
                <button 
                  className="p-1 hover:bg-slate-200 rounded-sm text-slate-400 hover:text-slate-600 outline-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSubfolder?.(folder.id);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Subfolder
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={(e) => {
                  e.stopPropagation();
                  onRename?.(folder.id, folder.name);
                }}
              >
                <Pencil className="w-4 h-4 mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem 
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(folder.id, folder.name);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isOpen && hasChildren && (
        <div className="ml-4 pl-2 border-l border-slate-200/60 mt-0.5">
          <FolderTree 
            folders={folder.children} 
            activeFolderId={activeFolderId} 
            onSelect={onSelect}
            onCreateSubfolder={onCreateSubfolder}
            onRename={onRename}
            onDelete={onDelete}
            onDrop={onDrop}
            onPrefetch={onPrefetch}
          />
        </div>
      )}
    </div>
  );
}
