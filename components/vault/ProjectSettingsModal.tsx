"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Trash2, AlertTriangle } from 'lucide-react';

const PRESET_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981', 
  '#3B82F6', '#8B5CF6', '#EF4444', '#64748B'
];

const PRESET_EMOJIS = ['📁', '🚀', '🔒', '🛡️', '⚡', '🌐', '📊', '🔧'];

interface ProjectSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    emoji: string;
  };
}

export function ProjectSettingsModal({ 
  open, 
  onOpenChange,
  initialData 
}: ProjectSettingsModalProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: initialData.name,
    description: initialData.description || '',
    color: initialData.color,
    emoji: initialData.emoji,
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState('');

  // Update form if initialData changes
  useEffect(() => {
    setFormData({
      name: initialData.name,
      description: initialData.description || '',
      color: initialData.color,
      emoji: initialData.emoji,
    });
  }, [initialData]);

  async function onUpdate(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch(`/api/projects/${initialData.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed to update project');

      toast.success('Project updated successfully');
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error('Could not update project');
    } finally {
      setIsLoading(false);
    }
  }

  async function onDelete() {
    if (confirmDelete !== initialData.name) {
      toast.error('Project name does not match');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${initialData.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete project');

      toast.success('Project deleted successfully');
      onOpenChange(false);
      router.push('/dashboard');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete project');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Project Settings</DialogTitle>
          <DialogDescription>
            Manage project details and preferences.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onUpdate} className="space-y-6 pt-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isLoading}
                rows={2}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Icon & Color</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {PRESET_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setFormData({ ...formData, emoji })}
                    className={`w-8 h-8 flex items-center justify-center rounded-md border text-lg transition-all ${
                      formData.emoji === emoji ? 'border-indigo-600 ring-2 ring-indigo-600/20 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-6 h-6 rounded-full border border-white/20 transition-all ${
                      formData.color === color ? 'ring-2 ring-offset-2 ring-indigo-600 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button 
              type="button" 
              variant="ghost" 
              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              onClick={() => setIsDeleting(true)}
              disabled={isLoading}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete Project
            </Button>
            <Button type="submit" disabled={isLoading || !formData.name}>
              {isLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>

        {/* Delete Confirmation Sub-Dialog */}
        {isDeleting && (
          <div className="absolute inset-0 z-50 bg-white p-6 rounded-xl animate-in fade-in zoom-in-95">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div className="space-y-2">
                <h3 className="font-bold text-slate-900">Delete {initialData.name}?</h3>
                <p className="text-sm text-slate-500">
                  This action is permanent and will delete all environments and secrets in this project.
                </p>
              </div>
              <div className="w-full space-y-3 pt-2">
                <div className="text-left space-y-1.5">
                  <Label className="text-xs text-slate-400 font-medium">Type project name to confirm</Label>
                  <Input 
                    value={confirmDelete}
                    onChange={(e) => setConfirmDelete(e.target.value)}
                    placeholder={initialData.name}
                    className="border-rose-100 focus:border-rose-400 focus:ring-rose-400/20"
                  />
                </div>
                <div className="flex gap-3">
                  <Button 
                    variant="ghost" 
                    className="flex-1" 
                    onClick={() => setIsDeleting(false)}
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="flex-1" 
                    onClick={onDelete}
                    disabled={isLoading || confirmDelete !== initialData.name}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
