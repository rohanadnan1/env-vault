import { Database, Loader2 } from 'lucide-react';

export default function EnvLoading() {
  return (
    <div className="h-[calc(100vh-140px)] flex bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-pulse">
      {/* Pane 1: Folders Sidebar Skeleton */}
      <aside className="w-64 border-r border-slate-100 bg-slate-50/30 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Database className="w-3.5 h-3.5" />
            Structure
          </span>
          <div className="h-8 w-8 bg-slate-200 rounded-md" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          <div className="h-6 w-3/4 bg-slate-200 rounded" />
          <div className="pl-4 space-y-3">
            <div className="h-6 w-2/3 bg-slate-200 rounded" />
            <div className="h-6 w-5/6 bg-slate-200 rounded" />
          </div>
          <div className="h-6 w-1/2 bg-slate-200 rounded" />
        </div>
      </aside>

      {/* Pane 2: Main Content Skeleton */}
      <main className="flex-1 flex flex-col min-w-0 bg-white">
        <div className="h-14 border-b border-slate-50 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-4 w-20 bg-slate-200 rounded" />
            <div className="h-4 w-4 bg-slate-100 rounded" />
            <div className="h-4 w-24 bg-slate-200 rounded" />
            <div className="h-4 w-4 bg-slate-100 rounded" />
            <div className="h-4 w-32 bg-slate-200 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-48 lg:w-64 bg-slate-100 rounded-md" />
            <div className="h-9 w-24 bg-slate-200 rounded-md" />
            <div className="h-9 w-32 bg-slate-indigo-100 rounded-md bg-indigo-50" />
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          </div>
        </div>
      </main>
    </div>
  );
}
