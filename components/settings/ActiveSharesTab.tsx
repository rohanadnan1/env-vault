"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Share2,
  Clock,
  Users,
  InboxIcon,
  ShieldAlert,
  RefreshCw,
  UserCheck,
  Eye,
  Download,
  MessageSquare,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ActiveLinksData {
  totalActive: number;
  expiringSoon: number;
  totalRecipients: number;
  pendingCount: number;
  recentActivity: Array<{
    id: string;
    action: string;
    resourceDetail: string | null;
    accessedAt: string;
    user: { name: string | null; email: string | null } | null;
    resourceType: string;
  }>;
}

export function ActiveSharesTab() {
  const router = useRouter();
  const [data, setData] = useState<ActiveLinksData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sharing/active-links');
      if (!res.ok) throw new Error('Failed to load data');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError('Could not load sharing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Card className="border-slate-200 shadow-sm rounded-2xl">
        <CardContent className="py-20 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-slate-200 shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle>Active Shares</CardTitle>
          <CardDescription>
            Review and manage your shared resources.
          </CardDescription>
        </CardHeader>
        <CardContent className="py-10 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8 text-rose-400" />
          </div>
          <h3 className="text-slate-900 font-semibold mb-1">{error}</h3>
          <Button variant="outline" size="sm" onClick={fetchData} className="mt-4">
            <RefreshCw className="w-3.5 h-3.5 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'VIEW': return <Eye className="w-3.5 h-3.5" />;
      case 'DECRYPT': return <ShieldAlert className="w-3.5 h-3.5" />;
      case 'COPY': return <Eye className="w-3.5 h-3.5" />;
      case 'EXPORT': return <Download className="w-3.5 h-3.5" />;
      default: return <Eye className="w-3.5 h-3.5" />;
    }
  };

  const actionLabel = (action: string) => {
    switch (action) {
      case 'VIEW': return 'viewed';
      case 'DECRYPT': return 'decrypted';
      case 'COPY': return 'copied';
      case 'EXPORT': return 'exported';
      default: return 'accessed';
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Active Shares</CardTitle>
            <CardDescription>
              Review and manage your shared resources.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/sharing')}>
            <Share2 className="w-3.5 h-3.5 mr-2" />
            Manage All
          </Button>
        </CardHeader>
        <CardContent>
          {data.totalActive === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Share2 className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-slate-900 font-semibold mb-1">No active shares</h3>
              <p className="text-sm text-slate-500">You haven&apos;t shared any content from this vault yet.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <SummaryStat
                  label="Active Shares"
                  value={data.totalActive}
                  icon={<Share2 className="w-4 h-4" />}
                  color="indigo"
                />
                <SummaryStat
                  label="Expiring Soon"
                  value={data.expiringSoon}
                  icon={<Clock className="w-4 h-4" />}
                  color={data.expiringSoon > 0 ? 'amber' : 'slate'}
                />
                <SummaryStat
                  label="Recipients"
                  value={data.totalRecipients}
                  icon={<Users className="w-4 h-4" />}
                  color="slate"
                />
                <SummaryStat
                  label="Pending"
                  value={data.pendingCount}
                  icon={<InboxIcon className="w-4 h-4" />}
                  color={data.pendingCount > 0 ? 'indigo' : 'slate'}
                />
              </div>

              {data.recentActivity.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                    Recent Activity
                  </h4>
                  <div className="space-y-3">
                    {data.recentActivity.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-center gap-3 text-sm py-2 border-b border-slate-50 last:border-0"
                      >
                        <span className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                          activity.action === 'EXPORT'
                            ? "bg-amber-50 text-amber-600"
                            : "bg-indigo-50 text-indigo-600"
                        )}>
                          {getActionIcon(activity.action)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-700 truncate">
                            <span className="font-medium">{activity.user?.name || activity.user?.email || 'Someone'}</span>
                            {' '}{actionLabel(activity.action)}{' '}
                            {activity.resourceDetail?.split(':')[1] || activity.resourceType.toLowerCase()}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(activity.accessedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Bulk operations for your shared links.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" size="sm" className="text-slate-600" disabled>
            <ShieldAlert className="w-3.5 h-3.5 mr-2" />
            Revoke All Expired
          </Button>
          <Button variant="outline" size="sm" className="text-slate-600" disabled>
            <Download className="w-3.5 h-3.5 mr-2" />
            Export Share Report
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: 'indigo' | 'amber' | 'slate';
}) {
  return (
    <div className={cn(
      "rounded-xl border p-4",
      color === 'indigo' ? "border-indigo-100 bg-indigo-50/50" :
      color === 'amber' ? "border-amber-100 bg-amber-50/50" :
      "border-slate-100 bg-slate-50/50"
    )}>
      <div className="flex items-center gap-2 mb-1">
        <span className={cn(
          color === 'indigo' ? "text-indigo-600" :
          color === 'amber' ? "text-amber-600" : "text-slate-500"
        )}>
          {icon}
        </span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <p className={cn(
        "text-2xl font-bold",
        color === 'indigo' ? "text-indigo-700" :
        color === 'amber' ? "text-amber-700" : "text-slate-700"
      )}>
        {value}
      </p>
    </div>
  );
}
