import { VaultLockButton } from './VaultLockButton';
import { SearchBar } from '@/components/vault/SearchBar';
import { UserMenu } from './UserMenu';

export function Navbar() {
  return (
    <header className="h-14 border-b border-slate-200 flex items-center justify-between px-6 bg-white shrink-0 shadow-sm z-10 w-full hover:shadow-md transition-shadow">
      <div className="font-semibold text-slate-800 md:hidden">
        env-vault
      </div>
      <div className="font-medium text-slate-500 hidden md:flex items-center gap-4">
       
        <SearchBar />
      </div>
      
      <div className="md:hidden">
        <SearchBar />
      </div>
      
      <div className="flex items-center space-x-4">
        <VaultLockButton />
        <UserMenu />
      </div>
    </header>
  );
}
