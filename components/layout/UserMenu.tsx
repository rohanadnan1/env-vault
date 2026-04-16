"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { 
  User, 
  Settings, 
  LogOut, 
  LockKeyhole, 
  Monitor,
  ExternalLink
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useVaultStore } from "@/lib/store/vaultStore";

export function UserMenu() {
  const { data: session } = useSession();
  const router = useRouter();
  const lock = useVaultStore((s) => s.lock);
  const isUnlocked = useVaultStore((s) => s.isUnlocked);

  if (!session?.user) return null;

  const user = session.user;
  const initial = user.name 
    ? user.name.charAt(0).toUpperCase() 
    : user.email?.charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold border-2 border-white shadow-md cursor-pointer hover:scale-105 transition-all ring-1 ring-slate-200 outline-none">
            {initial}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-64 p-2 rounded-xl shadow-xl border-slate-200">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-3">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-bold text-slate-900 leading-none truncate">
                {user.name || "User"}
              </p>
              <p className="text-xs text-slate-500 leading-none truncate">
                {user.email}
              </p>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        
        <DropdownMenuSeparator className="bg-slate-100" />
        
        <DropdownMenuItem 
          onClick={() => router.push('/settings')}
          className="flex items-center gap-3 p-2.5 cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Settings className="w-4 h-4 text-slate-500" />
          <span className="font-medium text-slate-700">Account Settings</span>
        </DropdownMenuItem>
        
        {isUnlocked && (
          <DropdownMenuItem 
            onClick={() => {
              lock();
              router.refresh();
            }}
            className="flex items-center gap-3 p-2.5 cursor-pointer rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
          >
            <LockKeyhole className="w-4 h-4" />
            <span className="font-medium">Force Lock Vault</span>
          </DropdownMenuItem>
        )}
        
        <DropdownMenuItem 
          onClick={() => window.open('https://github.com/settings/tokens', '_blank')}
          className="flex items-center gap-3 p-2.5 cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
        >
          <ExternalLink className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-500 text-sm">External Tokens</span>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-slate-100" />
        
        <DropdownMenuItem 
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 p-2.5 cursor-pointer rounded-lg hover:bg-rose-50 text-rose-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="font-medium font-bold">Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
