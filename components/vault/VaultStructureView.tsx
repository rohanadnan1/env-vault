"use client";

import { useState, useMemo } from 'react';
import { 
  Search, 
  ChevronRight,
  Hash,
  Database
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SecretRow } from '@/components/vault/SecretRow';
import { ClientFileList } from '@/app/(vault)/projects/[projectId]/[envId]/ClientFileList';
import { ClientSecretActions } from '@/app/(vault)/projects/[projectId]/[envId]/ClientSecretActions';
import { ExportButton } from '@/components/vault/ExportButton';

interface VaultStructureViewProps {
  project: unknown;
  environment: unknown;
  currentFolder: unknown;
  secrets: unknown[];
  files: unknown[];
  envId: string;
  folderId: string | null;
}

export function VaultStructureView({
  project,
  environment,
  currentFolder,
  secrets,
  files,
  envId,
  folderId
}: VaultStructureViewProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSecrets = useMemo(() => {
    if (!searchQuery) return secrets;
    const q = searchQuery.toLowerCase();
    return secrets.filter(s => 
      s.keyName.toLowerCase().includes(q) || 
      (s.tags && s.tags.toLowerCase().includes(q))
    );
  }, [secrets, searchQuery]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    const q = searchQuery.toLowerCase();
    return files.filter(f => f.name.toLowerCase().includes(q));
  }, [files, searchQuery]);

  const isEmpty = filteredSecrets.length === 0 && filteredFiles.length === 0;

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-white">
      {/* Toolbar */}
      <div className="h-14 border-b border-slate-50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-2 text-sm text-slate-500 font-medium overflow-hidden">
          <span className="truncate hover:text-indigo-600 cursor-pointer">{project.name}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span className="capitalize hover:text-indigo-600 cursor-pointer">{environment.name}</span>
          {currentFolder && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
              <span className="truncate text-slate-900 font-bold">{currentFolder.name}</span>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input 
              placeholder="Search keys..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 w-48 lg:w-64 border-slate-200 bg-slate-50/50 focus:bg-white transition-all focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <ExportButton 
            environmentId={envId} 
            folderId={folderId || null} 
            envName={environment.name} 
          />
          <ClientSecretActions environmentId={envId} folderId={folderId || null} />
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center p-12 text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Hash className="w-6 h-6 text-slate-300" />
            </div>
            <h3 className="text-slate-900 font-semibold text-lg">
              {searchQuery ? "No matches found" : "Empty scope"}
            </h3>
            <p className="text-slate-500 mt-1 max-w-xs text-sm">
              {searchQuery 
                ? `We couldn't find anything matching "${searchQuery}" in this folder.`
                : "This folder has no secrets or files yet. Use the buttons above to get started."}
            </p>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")}
                className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700 underline underline-offset-4"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {filteredSecrets.map((secret) => (
              <SecretRow 
                key={secret.id}
                id={secret.id}
                keyName={secret.keyName}
                valueEncrypted={secret.valueEncrypted}
                iv={secret.iv}
                tags={secret.tags}
                environmentId={envId}
              />
            ))}
            {filteredFiles.length > 0 && (
              <ClientFileList
                files={filteredFiles as any}
                folderId={folderId || ""}
                environmentId={envId}
              />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
