import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateProjectModal } from '@/components/vault/CreateProjectModal';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, ShieldCheck, Clock } from 'lucide-react';

async function getProjects(userId: string) {
  return await db.project.findMany({
    where: { userId },
    include: {
      _count: {
        select: { environments: true }
      },
      environments: {
        include: {
          _count: {
            select: { secrets: true }
          }
        }
      }
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const projects = await getProjects(session.user.id);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-indigo-600" />
            My Vault
          </h1>
          <p className="text-slate-500 mt-1">Manage and secure your project secrets.</p>
        </div>
        <CreateProjectModal />
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
            <FolderKanban className="w-8 h-8 text-slate-300" />
          </div>
          <h2 className="text-xl font-semibold text-slate-800">No projects yet</h2>
          <p className="text-slate-500 mt-1 mb-6 text-center max-w-xs px-4">
            Create your first project to start organizing your environment variables securely.
          </p>
          <CreateProjectModal />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => {
            const secretCount = project.environments.reduce(
              (acc, env) => acc + env._count.secrets, 
              0
            );

            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="group hover:shadow-lg hover:border-indigo-200 transition-all duration-300 h-full border-slate-200/60 overflow-hidden relative">
                  <div 
                    className="h-1.5 w-full absolute top-0 left-0" 
                    style={{ backgroundColor: project.color }} 
                  />
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="p-2.5 bg-slate-50 rounded-xl group-hover:bg-indigo-50 transition-colors border border-slate-100 group-hover:border-indigo-100">
                        <span className="text-2xl leading-none">{project.emoji}</span>
                      </div>
                      <Badge variant="outline" className="bg-slate-50/50 border-slate-200 font-medium text-slate-600">
                        {project._count.environments} envs
                      </Badge>
                    </div>
                    <CardTitle className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {project.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2 mt-1 min-h-[40px]">
                      {project.description || "No description provided."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 pb-6 border-t border-slate-50 mt-2">
                    <div className="flex items-center justify-between text-sm mt-4">
                      <div className="flex items-center text-slate-500 font-medium">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
                        {secretCount} secrets
                      </div>
                      <div className="flex items-center text-slate-400">
                        <Clock className="w-3.5 h-3.5 mr-1.5" />
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
