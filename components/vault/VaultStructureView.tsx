"use client";

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { 
  Search, 
  ChevronRight,
  Hash,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { SecretRow } from '@/components/vault/SecretRow';
import { ClientFileList } from '@/app/(vault)/projects/[projectId]/[envId]/ClientFileList';
import { ClientSecretActions } from '@/app/(vault)/projects/[projectId]/[envId]/ClientSecretActions';
import { ExportButton } from '@/components/vault/ExportButton';

interface VaultStructureViewProps {
  project: { id: string; name: string };
  projectId: string;
  environment: { id?: string; name: string };
  envId: string;
  /** All ancestors from root folder down to (and including) the current folder */
  breadcrumbs: { id: string; name: string }[];
  currentFolder: { name: string } | null;
  secrets: { id: string; keyName: string; valueEncrypted: string; iv: string; tags: string }[];
  files: { id: string; name: string }[];
  folderId: string | null;
}

export function VaultStructureView({
  project,
  projectId,
  environment,
  envId,
  breadcrumbs,
  currentFolder,
  secrets,
  files,
  folderId
}: VaultStructureViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [optimisticSecrets, setOptimisticSecrets] = useState(secrets);
  const [optimisticFiles, setOptimisticFiles] = useState(files);

  // Sync with server props when they change
  useEffect(() => {
    setOptimisticSecrets(secrets);
    setOptimisticFiles(files);
  }, [secrets, files]);

  // Listen for drop events from sidebar to instantly remove moved secrets
  useEffect(() => {
    const handleOptimisticMove = (e: CustomEvent<{ type: string; id: string }>) => {
      if (e.detail.type === 'secret') {
        setOptimisticSecrets(prev => prev.filter(s => s.id !== e.detail.id));
      } else if (e.detail.type === 'file') {
        setOptimisticFiles(prev => prev.filter(f => f.id !== e.detail.id));
      }
    };
    window.addEventListener('optimistic-move', handleOptimisticMove as EventListener);
    return () => window.removeEventListener('optimistic-move', handleOptimisticMove as EventListener);
  }, []);

  const filteredSecrets = useMemo(() => {
    if (!searchQuery) return optimisticSecrets;
    const q = searchQuery.toLowerCase();
    return optimisticSecrets.filter(s => 
      s.keyName.toLowerCase().includes(q) || 
      (s.tags && s.tags.toLowerCase().includes(q))
    );
  }, [optimisticSecrets, searchQuery]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return optimisticFiles;
    const q = searchQuery.toLowerCase();
    return optimisticFiles.filter(f => f.name.toLowerCase().includes(q));
  }, [optimisticFiles, searchQuery]);

  const isEmpty = filteredSecrets.length === 0 && filteredFiles.length === 0;

  // Ancestors excluding the last one (current folder is non-clickable)
  const clickableAncestors = breadcrumbs.slice(0, -1);
  const isInFolder = breadcrumbs.length > 0;

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-white">
      {/* Toolbar */}
      <div className="h-14 border-b border-slate-50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium overflow-hidden min-w-0">
          {/* Project */}
          <Link
            href={`/projects/${projectId}`}
            className="truncate hover:text-indigo-600 transition-colors shrink-0"
          >
            {project.name}
          </Link>

          <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

          {/* Environment — clickable only when inside a folder */}
          {isInFolder ? (
            <Link
              href={`/projects/${projectId}/${envId}`}
              className="capitalize hover:text-indigo-600 transition-colors shrink-0"
            >
              {environment.name}
            </Link>
          ) : (
            <span className="capitalize text-slate-900 font-semibold truncate">
              {environment.name}
            </span>
          )}

          {/* Clickable ancestor folders (all except the last = current) */}
          {clickableAncestors.map((ancestor) => (
            <span key={ancestor.id} className="contents">
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <Link
                href={`/projects/${projectId}/${envId}/${ancestor.id}`}
                className="truncate hover:text-indigo-600 transition-colors shrink-0 max-w-[120px]"
              >
                {ancestor.name}
              </Link>
            </span>
          ))}

          {/* Current folder — non-clickable */}
          {currentFolder && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span className="truncate text-slate-900 font-bold max-w-[140px]">
                {currentFolder.name}
              </span>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2 shrink-0 ml-4">
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
            projectId={project.id || ''}
            projectName={project.name}
            environmentId={envId}
            environmentName={environment.name}
            folderId={folderId || null}
            folderName={currentFolder?.name || null}
            scopedSecretsCount={filteredSecrets.length}
            scopedFiles={filteredFiles}
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
                folderId={folderId}
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

