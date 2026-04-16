"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, CommandIcon, Database, Folder, Shield } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useVaultStore } from "@/lib/store/vaultStore";

export function SearchBar() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<any[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const router = useRouter();
  
  const touchActivity = useVaultStore((s) => s.touchActivity);

  // Toggle the menu when ⌘K is pressed
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Search effect
  React.useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const search = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/secrets/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (_err) {
        console.error("Search failed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(search, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const onSelect = (result: unknown) => {
    setOpen(false);
    touchActivity();
    
    // Construct path: /projects/[projectId]/[envId]?folderId=[folderId]
    const projectId = result.environment.project.id;
    const envId = result.environment.id;
    const folderId = result.folder?.id;
    
    let path = `/projects/${projectId}/${envId}`;
    if (folderId) {
      path += `?folderId=${folderId}`;
    }
    
    router.push(path);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-md hover:bg-white hover:border-indigo-300 transition-all shadow-xs group"
      >
        <SearchIcon className="w-4 h-4 group-hover:text-indigo-500 transition-colors" />
        <span className="hidden lg:inline-block">Search secrets...</span>
        <span className="lg:hidden">Search...</span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-white px-1.5 font-mono text-[10px] font-medium text-slate-400 lg:flex ml-2">
          <CommandIcon className="w-2.5 h-2.5" />K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput 
          placeholder="Search all secrets..." 
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {isLoading && (
            <div className="py-6 text-center text-sm text-slate-500 flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
              Searching...
            </div>
          )}
          {!isLoading && query.length >= 2 && results.length === 0 && (
            <CommandEmpty>No secrets found for "{query}"</CommandEmpty>
          )}
          
          {results.length > 0 && (
            <CommandGroup heading="Secret Results">
              {results.map((result) => (
                <CommandItem
                  key={result.id}
                  onSelect={() => onSelect(result)}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <Shield className="w-4 h-4 text-indigo-500" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-mono font-bold text-slate-900">{result.keyName}</span>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate uppercase tracking-tight">
                      <Database className="w-3 h-3" /> {result.environment.project.name}
                      <span className="text-slate-200">/</span>
                      {result.environment.name}
                      {result.folder && (
                        <>
                          <span className="text-slate-200">/</span>
                          <Folder className="w-3 h-3" /> {result.folder.name}
                        </>
                      )}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          
          <CommandSeparator />
          
          <CommandGroup heading="Quick Actions">
            <CommandItem onSelect={() => { setOpen(false); router.push('/dashboard'); }} className="cursor-pointer">
              Dashboard
            </CommandItem>
            <CommandItem onSelect={() => { setOpen(false); router.push('/settings'); }} className="cursor-pointer">
              Account Settings
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
