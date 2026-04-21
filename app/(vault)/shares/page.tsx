import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Share2,
  Trash2,
  Clock,
  ExternalLink,
  History,
  ShieldAlert,
  Calendar,
  MousePointer2,
  UserPlus,
  Link as LinkIcon
} from 'lucide-react';
import Link from 'next/link';
import ClientShareManager from './ClientShareManager';

async function getShares(userId: string) {
  try {
    const shares = await db.share.findMany({
      where: { sharedById: userId },
      include: {
        accessLog: {
          orderBy: { accessedAt: 'desc' },
          take: 5
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return { shares, loadError: false } as const;
  } catch (error) {
    console.error('[SHARES_PAGE]', error);
    return { shares: [], loadError: true } as const;
  }
}

export default async function SharesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { shares, loadError } = await getShares(session.user.id);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {loadError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          Share data is temporarily unavailable. Please retry shortly.
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <Share2 className="w-8 h-8 text-indigo-600" />
            Active Shares
          </h1>
          <p className="text-slate-500 mt-1">Manage and audit your externally shared secret bundles.</p>
        </div>
      </div>

      {shares.length === 0 ? (
        <Card className="border-dashed border-2 bg-slate-50/50">
          <CardContent className="py-24 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-slate-100 flex items-center justify-center mb-4">
              <Share2 className="w-8 h-8 text-slate-200" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">No active shares</h3>
            <p className="text-slate-500 max-w-sm mt-1 mb-6">You haven't shared any secrets yet. Use the 'Share' action within any environment to create secure links.</p>
            <Link href="/dashboard">
              <Button size="sm">Go to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {shares.map((share) => {
            const isExpired = share.expiresAt && new Date(share.expiresAt) < new Date();
            const isActive = !share.isRevoked && !isExpired;

            return (
              <Card key={share.id} className="overflow-hidden border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  <div className="flex-1 p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <Badge 
                          variant={isActive ? "default" : "secondary"}
                          className={isActive ? "bg-emerald-500 hover:bg-emerald-600" : "bg-slate-200 text-slate-500"}
                        >
                          {isActive ? 'Active' : share.isRevoked ? 'Revoked' : 'Expired'}
                        </Badge>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <History className="w-3 h-3" />
                          Created {new Date(share.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-mono border-slate-200 text-slate-500">
                        {share.scopeType}
                      </Badge>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <LinkIcon className="w-4 h-4 text-slate-400" />
                        <span className="font-mono text-xs text-indigo-600 truncate max-w-md">
                          /share/{share.accessToken.slice(0, 12)}...
                        </span>
                      </div>
                      
                      {share.recipientEmail && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <UserPlus className="w-4 h-4 text-slate-400" />
                          Recipient: <span className="font-medium">{share.recipientEmail}</span>
                        </div>
                      )}

                      {share.note && (
                        <p className="text-sm text-slate-500 line-clamp-1 italic">"{share.note}"</p>
                      )}
                    </div>

                    <div className="mt-6 flex items-center gap-6 text-xs font-medium border-t border-slate-50 pt-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        Expires: {share.expiresAt ? new Date(share.expiresAt).toLocaleString() : 'Never'}
                      </div>
                      <div className="flex items-center gap-2 text-slate-500">
                        <MousePointer2 className="w-3.5 h-3.5" />
                        Mode: {share.singleUse ? 'Single Use' : 'Multi Access'}
                      </div>
                    </div>
                  </div>

                  <div className="w-full md:w-80 p-6 bg-slate-50/50 flex flex-col justify-between">
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" /> Recent Access
                      </h4>
                      {share.accessLog.length > 0 ? (
                        <div className="space-y-2">
                          {share.accessLog.map((log) => (
                            <div key={log.id} className="text-[10px] flex justify-between items-center text-slate-500">
                              <span className="font-mono">{log.ipAddress?.slice(0, 15) || 'Unknown IP'}</span>
                              <span>{new Date(log.accessedAt).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">No access recorded yet.</p>
                      )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-slate-100 flex gap-2">
                      <ClientShareManager id={share.id} accessToken={share.accessToken} isRevoked={share.isRevoked} />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

