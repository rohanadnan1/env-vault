"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

const PRESET_COLORS = [
  '#6366F1', '#EC4899', '#F59E0B', '#10B981', 
  '#3B82F6', '#8B5CF6', '#EF4444', '#64748B'
];

const PRESET_EMOJIS = ['📁', '🚀', '🔒', '🛡️', '⚡', '🌐', '📊', '🔧'];

export function CreateProjectModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#6366F1',
    emoji: '📁',
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error('Failed to create project');

      toast.success('Project created successfully');
      setOpen(false);
      setFormData({ name: '', description: '', color: '#6366F1', emoji: '📁' });
      router.refresh();
    } catch (_err) {
      toast.error('Could not create project');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger 
        render={
          <Button className="font-semibold shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> New Project
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Project</DialogTitle>
          <DialogDescription>
            Organize your secrets by project.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              placeholder="e.g. My Awesome API"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              placeholder="What is this project about?"
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
                    formData.emoji === emoji ? 'border-primary ring-2 ring-primary/20 bg-primary/5' : 'border-slate-200 hover:border-slate-300'
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
                    formData.color === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={isLoading || !formData.name}>
              {isLoading ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
