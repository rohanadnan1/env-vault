import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { CreateProjectModal } from '@/components/vault/CreateProjectModal';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderKanban, ShieldCheck, Clock, AlertTriangle, ShieldOff } from 'lucide-react';

async function getProjects(userId: string) {
  try {
    const projects = await db.project.findMany({
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

    return { projects, loadError: false } as const;
  } catch (error) {
    console.error('[DASHBOARD_PROJECTS]', error);
    return { projects: [], loadError: true } as const;
  }
}

async function getAccountSecurityStatus(userId: string) {
  try {
    const [user, recoveryCodesRemaining] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { totpSecret: true, twoFAEncryptedMaster: true },
      }),
      db.recoveryCode.count({
        where: { userId, usedAt: null },
      }),
    ]);

    return {
      hasTotp: !!user?.totpSecret,
      has2FAVaultUnlock: !!user?.twoFAEncryptedMaster,
      hasRecoveryCodes: recoveryCodesRemaining > 0,
      loadError: false,
    } as const;
  } catch (error) {
    console.error('[DASHBOARD_SECURITY_STATUS]', error);
    return {
      hasTotp: false,
      has2FAVaultUnlock: false,
      hasRecoveryCodes: false,
      loadError: true,
    } as const;
  }
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [{ projects, loadError }, security] = await Promise.all([
    getProjects(session.user.id),
    getAccountSecurityStatus(session.user.id),
  ]);

  // Show warning whenever the user has NO vault recovery path:
  // neither recovery codes nor 2FA vault unlock is configured.
  // This is always true right after a master key reset (both are cleared then).
  const showRecoveryWarning = !security.loadError && !security.hasRecoveryCodes && !security.has2FAVaultUnlock;

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Some data is temporarily unavailable. Your vault session is still active; retry in a moment.
        </div>
      )}

      {showRecoveryWarning && (
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50 p-4 flex items-start gap-4">
          <div className="p-2 rounded-lg bg-rose-100 shrink-0 mt-0.5">
            <ShieldOff className="w-5 h-5 text-rose-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-rose-900 text-sm">Your vault has no recovery method</p>
            <p className="text-rose-700 text-xs mt-1 leading-relaxed">
              If you forget your master password you will permanently lose access to your vault.
              Set up at least one of the following to protect your account:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-rose-700">
              <li className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-rose-400 shrink-0" />
                <strong>Recovery codes</strong> — 30 one-time backup codes
              </li>
              <li className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-rose-400 shrink-0" />
                <strong>2FA vault unlock</strong> — unlock with your authenticator app instead of your master password
              </li>
            </ul>
            <Link
              href="/settings?tab=security"
              className="inline-flex items-center gap-1 mt-3 text-xs font-bold text-rose-800 bg-rose-100 hover:bg-rose-200 border border-rose-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Go to Security Settings
            </Link>
          </div>
        </div>
      )}

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
              (acc: number, env) => acc + env._count.secrets, 
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
