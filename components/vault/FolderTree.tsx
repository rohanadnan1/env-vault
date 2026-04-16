"use client";

import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, FolderOpen, MoreVertical, Plus, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

interface FolderNode {
  id: string;
  name: string;
  environmentId: string;
  parentId: string | null;
  children: FolderNode[];
}

interface FolderTreeProps {
  folders: FolderNode[];
  activeFolderId?: string;
  onSelect: (id: string) => void;
  onCreateSubfolder?: (parentId: string) => void;
  onRename?: (id: string, currentName: string) => void;
  onDelete?: (id: string, name: string) => void;
}

export function FolderTree({ 
  folders, 
  activeFolderId, 
  onSelect, 
  onCreateSubfolder,
  onRename,
  onDelete
}: FolderTreeProps) {
  return (
    <div className="space-y-1">
      {folders.map((folder) => (
        <FolderItem 
          key={folder.id} 
          folder={folder} 
          activeFolderId={activeFolderId} 
          onSelect={onSelect}
          onCreateSubfolder={onCreateSubfolder}
          onRename={onRename}
          onDelete={onDelete}
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
  onDelete
}: { 
  folder: FolderNode, 
  activeFolderId?: string, 
  onSelect: (id: string) => void 
  onCreateSubfolder?: (parentId: string) => void;
  onRename?: (id: string, currentName: string) => void;
  onDelete?: (id: string, name: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const isActive = activeFolderId === folder.id;
  const hasChildren = folder.children && folder.children.length > 0;

  return (
    <div className="select-none">
      <div 
        className={cn(
          "group flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-colors",
          isActive ? "bg-indigo-50 text-indigo-700" : "hover:bg-slate-100 text-slate-600"
        )}
        onClick={(e) => {
          onSelect(folder.id);
        }}
      >
        <div className="flex items-center min-w-0 flex-1">
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
            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          
          {isOpen ? (
            <FolderOpen className={cn("w-4 h-4 mr-2 shrink-0", isActive ? "text-indigo-600" : "text-slate-400")} />
          ) : (
            <Folder className={cn("w-4 h-4 mr-2 shrink-0", isActive ? "text-indigo-600" : "text-slate-400")} />
          )}
          
          <span className="text-sm font-medium truncate">{folder.name}</span>
        </div>

        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
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
          />
        </div>
      )}
    </div>
  );
}
