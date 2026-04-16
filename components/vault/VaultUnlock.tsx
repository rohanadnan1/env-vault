"use client";

import { useState, useEffect } from 'react';
import { useVaultStore } from '@/lib/store/vaultStore';
import { deriveVaultKey } from '@/lib/crypto/vault';
import { 
  isBiometricSupported, 
  isBiometricEnrolled, 
  enrollBiometrics, 
  unlockWithBiometrics 
} from '@/lib/crypto/biometric';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Fingerprint, Monitor, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function VaultUnlock() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [enrollBio, setEnrollBio] = useState(false);
  const [error, setError] = useState(false);
  
  const unlock = useVaultStore((s) => s.unlock);
  const { 
    isBiometricSupported: supported, 
    isBiometricEnrolled: enrolled,
    setBiometricSupport,
    setBiometricEnrolled
  } = useVaultStore();

  // Detect biometric support on mount
  useEffect(() => {
    isBiometricSupported().then(isSupported => {
      console.log('Biometric Support Check:', isSupported);
      setBiometricSupport(isSupported);
      // Auto-check enrollment box if supported but not yet enabled
      if (isSupported && !isBiometricEnrolled()) {
        setEnrollBio(true);
      }
    });
    const isEnrolled = isBiometricEnrolled();
    console.log('Biometric Enrollment Check:', isEnrolled);
    setBiometricEnrolled(isEnrolled);
  }, [setBiometricSupport, setBiometricEnrolled]);

  const handleBiometricUnlock = async () => {
    setIsScanning(true);
    setError(false);
    try {
      const decryptedPw = await unlockWithBiometrics();
      
      const res = await fetch('/api/vault/salt');
      if (!res.ok) throw new Error('Failed to fetch salt');
      const { salt } = await res.json();
      
      const key = await deriveVaultKey(decryptedPw, salt);
      unlock(key);
      toast.success('Vault unlocked with Touch ID');
    } catch (_err) {
      console.error('Biometric unlock failed:', err);
      if (err.name !== 'NotAllowedError') { // Ignore user cancel
        toast.error('Biometric unlock failed. Please use your password.');
      }
    } finally {
      setIsScanning(false);
    }
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setError(false);

    try {
      const res = await fetch('/api/vault/salt');
      if (!res.ok) throw new Error('Failed to fetch salt');
      const { salt } = await res.json();
      
      // PBKDF2 blocks the UI thread, defer with setTimeout
      setTimeout(async () => {
        try {
          const key = await deriveVaultKey(password, salt);
          
          if (enrollBio) {
            try {
              await enrollBiometrics(password);
              setBiometricEnrolled(true);
              toast.success('Biometric unlock enabled');
            } catch (_err) {
              console.error('Failed to enroll biometrics:', err);
              toast.error('Failed to enable biometric unlock');
            }
          }
          
          unlock(key);
        } catch (_err) {
          setError(true);
          setIsLoading(false);
        }
      }, 10);
      
    } catch (_err) {
      setError(true);
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px]">
      <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 border border-slate-100 ring-1 ring-slate-900/5">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-100 shadow-sm">
            <ShieldCheck className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Unlock Vault</h2>
          <p className="text-slate-500 text-sm mt-1">Unlock your environment variables</p>
        </div>
        
        {enrolled && supported && (
          <div className="mb-6">
            <Button 
              type="button" 
              variant="outline" 
              className={cn(
                "w-full h-14 rounded-xl border-2 border-indigo-100 bg-indigo-50/30 text-indigo-700 hover:bg-indigo-50 hover:border-indigo-200 transition-all font-bold gap-3 group",
                isScanning && "animate-pulse"
              )}
              onClick={handleBiometricUnlock}
              disabled={isScanning || isLoading}
            >
              {isScanning ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Fingerprint className="w-6 h-6 group-hover:scale-110 transition-transform" />
              )}
              {isScanning ? "Scanning..." : "Unlock with Touch ID"}
            </Button>
            
            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-100" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-slate-400 font-medium">Or use password</span>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="master-password" className="text-slate-700 font-medium flex items-center gap-2">
              <Monitor className="w-3.5 h-3.5 text-slate-400" />
              Master Password
            </Label>
            <Input 
              id="master-password"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading || isScanning}
              className="h-12 rounded-xl border-slate-200 focus:ring-indigo-500 bg-slate-50/50"
              autoFocus={!enrolled}
            />
          </div>

          {supported && !enrolled && (
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-4 bg-indigo-50/50 rounded-xl border-2 border-indigo-100 cursor-pointer hover:bg-indigo-50 transition-all ring-1 ring-indigo-500/5">
                <input 
                  type="checkbox" 
                  checked={enrollBio}
                  onChange={(e) => setEnrollBio(e.target.checked)}
                  className="w-5 h-5 rounded-md border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Fingerprint className="w-4 h-4 text-indigo-600" />
                    Link Touch ID
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">Auto-unlock on this device from now on</span>
                </div>
              </label>
              <p className="text-[10px] text-center text-slate-400 px-2 italic">
                Note: You only need to type your password **once** to link your fingerprint. After this, your biometric scan will handle it.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
              <p className="text-rose-600 text-xs font-bold text-center">Incorrect password. Please try again.</p>
            </div>
          )}

          <Button 
            type="submit" 
            className="w-full h-12 rounded-xl text-md font-bold shadow-lg shadow-indigo-100 hover:shadow-indigo-200 transition-all bg-indigo-600 hover:bg-indigo-700 text-white" 
            disabled={isLoading || isScanning || !password}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Unlocking...
              </span>
            ) : "Unlock Vault"}
          </Button>
        </form>
      </div>
    </div>
  );
}
