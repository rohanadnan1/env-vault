import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Settings, ChevronRight, LayoutGrid, Layers, Database } from 'lucide-react';
import Link from 'next/link';
import { ClientProjectActions, EmptyStateActions } from './ClientProjectActions';

async function getProject(id: string, userId: string) {
  const project = await db.project.findUnique({
    where: { id },
    include: {
      environments: {
        include: {
          _count: {
            select: { secrets: true, folders: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      }
    }
  });

  if (!project || project.userId !== userId) return null;
  return project;
}

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { projectId } = await params;
  const project = await getProject(projectId, session.user.id);

  if (!project) notFound();

  // If project has no environments, we could automatically create 'development' or show a setup state
  // For now, let's just render the list.

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3.5 bg-white rounded-2xl shadow-sm border border-slate-100 text-3xl">
            {project.emoji}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">{project.name}</h1>
              <Badge variant="outline" className="bg-indigo-50 border-indigo-100 text-indigo-700 hover:bg-indigo-100 transition-colors">
                Project
              </Badge>
            </div>
            <p className="text-slate-500 mt-1 max-w-xl">{project.description || "Manage environments and secrets for this project."}</p>
          </div>
        </div>
        <ClientProjectActions 
          projectId={projectId} 
          initialData={project}
        />
      </div>

      {/* Main Content: Environments */}
      <Card className="border-slate-200/60 shadow-sm overflow-hidden bg-white">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100">
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-500" />
            Environments
          </CardTitle>
          <CardDescription>Select an environment to manage its secrets and folders.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {project.environments.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Database className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="font-semibold text-slate-800">No environments found</h3>
              <p className="text-slate-500 text-sm mt-1 mb-4">You need at least one environment (e.g., Development) to store secrets.</p>
              <EmptyStateActions projectId={projectId} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {project.environments.map((env) => (
                <Link key={env.id} href={`/projects/${project.id}/${env.id}`}>
                  <Card className="hover:border-indigo-400 transition-all group hover:bg-slate-50/50 cursor-pointer border-slate-200">
                    <CardContent className="p-5">
                      <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${
                            env.name.toLowerCase() === 'production' ? 'bg-rose-500' : 
                            env.name.toLowerCase() === 'staging' ? 'bg-amber-500' : 'bg-emerald-500'
                          }`} />
                          <span className="font-bold text-slate-900 capitalize">{env.name}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-400 transition-colors" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Secrets</p>
                          <p className="text-lg font-bold text-slate-700">{env._count.secrets}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Folders</p>
                          <p className="text-lg font-bold text-slate-700">{env._count.folders}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
