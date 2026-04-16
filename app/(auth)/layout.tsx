import { ReactNode } from 'react';
import { Lock } from 'lucide-react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col justify-center items-center p-4">
      <div className="mb-8 flex items-center space-x-2">
        <div className="p-2 bg-indigo-600 rounded-lg">
          <Lock className="w-6 h-6 text-white" />
        </div>
        <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
          EnVault
        </span>
      </div>
      <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-xl shadow-slate-200/50 border border-slate-200/60">
        {children}
      </div>
    </div>
  );
}
