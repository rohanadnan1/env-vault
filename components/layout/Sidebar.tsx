"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderGit2, Users, Share2, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CreateProjectModal } from '@/components/vault/CreateProjectModal';

interface Project {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

interface SidebarProps {
  projects: Project[];
  sharedCount?: number;
}

export function Sidebar({ projects, sharedCount }: SidebarProps) {
  const pathname = usePathname();

  const navLinks = [
    {
      href: '/shared',
      label: 'Shared With Me',
      icon: Users,
      isActive: pathname.startsWith('/shared'),
      showCount: true,
    },
    {
      href: '/sharing',
      label: 'Sharing',
      icon: Share2,
      isActive: pathname.startsWith('/sharing'),
      showCount: false,
    },
    {
      href: '/settings',
      label: 'Settings',
      icon: Settings,
      isActive: pathname.startsWith('/settings'),
      showCount: false,
    },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0 hidden md:flex h-full">
      <div className="h-14 border-b border-slate-200 flex items-center px-4 font-bold text-xl text-indigo-600 bg-white shrink-0">
        <Link href="/" className="hover:opacity-80 transition-opacity">env-vault</Link>
      </div>
      
      <div className="p-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest flex items-center">
            <FolderGit2 className="w-4 h-4 mr-2" /> Projects
          </h3>
        </div>

        <div className="space-y-1 mb-6">
          {projects.length === 0 ? (
            <div className="text-sm text-slate-500 italic px-2 py-1">No projects yet</div>
          ) : (
            projects.map((project) => {
              const isActive = pathname.startsWith(`/projects/${project.id}`);
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                    isActive 
                      ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200" 
                      : "text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm"
                  )}
                >
                  <span 
                    className="w-6 h-6 flex items-center justify-center rounded-md text-xs shrink-0 group-hover:scale-110 transition-transform"
                    style={{ backgroundColor: `${project.color}15`, color: project.color }}
                  >
                    {project.emoji}
                  </span>
                  <span className="truncate">{project.name}</span>
                </Link>
              );
            })
          )}
        </div>

        <div className="pt-4 border-t border-slate-200 mb-4">
          <CreateProjectModal />
        </div>

        <div className="border-t border-slate-200 pt-4 space-y-1">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">
            Navigation
          </h3>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
                link.isActive
                  ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200"
                  : "text-slate-600 hover:bg-white hover:text-indigo-600 hover:shadow-sm"
              )}
            >
              <link.icon className="w-4 h-4 shrink-0" />
              <span className="truncate flex-1">{link.label}</span>
              {link.showCount && sharedCount !== undefined && sharedCount > 0 && (
                <span className="text-[10px] font-bold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">
                  {sharedCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
