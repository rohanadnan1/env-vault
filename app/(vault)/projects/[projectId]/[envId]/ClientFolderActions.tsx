"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CreateFolderModal } from '@/components/vault/CreateFolderModal';

export function ClientFolderActions({ environmentId }: { environmentId: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-6 w-6 text-slate-400"
        onClick={() => setIsModalOpen(true)}
      >
        <Plus className="w-4 h-4" />
      </Button>

      <CreateFolderModal 
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        environmentId={environmentId}
      />
    </>
  );
}
