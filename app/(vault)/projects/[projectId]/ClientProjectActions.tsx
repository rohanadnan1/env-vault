"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Settings, Share2 } from 'lucide-react';
import { CreateEnvironmentModal } from '@/components/vault/CreateEnvironmentModal';
import { ProjectSettingsModal } from '@/components/vault/ProjectSettingsModal';
import { ShareResourceModal } from '@/components/sharing/ShareResourceModal';

interface ClientProjectActionsProps {
  projectId: string;
  initialData: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    emoji: string;
  };
}

export function ClientProjectActions({ projectId, initialData }: ClientProjectActionsProps) {
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);

  return (
    <>
      <div className="flex gap-3">
        <Button
          variant="outline"
          size="sm"
          className="shadow-sm border-slate-200"
          onClick={() => setIsShareOpen(true)}
        >
          <Share2 className="w-4 h-4 mr-2 text-slate-500" /> Share
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="shadow-sm border-slate-200"
          onClick={() => setIsSettingsOpen(true)}
        >
          <Settings className="w-4 h-4 mr-2 text-slate-500" /> Settings
        </Button>
        <Button 
          size="sm" 
          className="shadow-sm bg-indigo-600 hover:bg-indigo-700"
          onClick={() => setIsEnvModalOpen(true)}
        >
          <Plus className="w-4 h-4 mr-2" /> New Env
        </Button>
      </div>

      <CreateEnvironmentModal 
        open={isEnvModalOpen}
        onOpenChange={setIsEnvModalOpen}
        projectId={projectId}
      />

      <ProjectSettingsModal 
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        initialData={initialData}
      />

      <ShareResourceModal
        open={isShareOpen}
        onOpenChange={setIsShareOpen}
        resourceType="PROJECT"
        resourceId={projectId}
        resourceName={initialData.name}
        projectId={projectId}
      />
    </>
  );
}

export function EmptyStateActions({ projectId }: { projectId: string }) {
  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);

  return (
    <>
      <Button 
        size="sm"
        onClick={() => setIsEnvModalOpen(true)}
      >
        Add Development Env
      </Button>

      <CreateEnvironmentModal 
        open={isEnvModalOpen}
        onOpenChange={setIsEnvModalOpen}
        projectId={projectId}
      />
    </>
  );
}
