"use client";

import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useVaultStore } from '@/lib/store/vaultStore';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { toast } from 'sonner';

interface ExportButtonProps {
  environmentId: string;
  folderId: string | null;
  envName: string;
}

export function ExportButton({ environmentId, folderId, envName }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  const handleEnvExport = async () => {
    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }

    setIsExporting(true);
    touchActivity();

    try {
      // 1. Fetch encrypted secrets for the scope
      const query = new URLSearchParams({ envId: environmentId });
      if (folderId) query.set('folderId', folderId);
      
      const res = await fetch(`/api/secrets?${query.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch secrets');
      
      const secrets = await res.json();
      
      if (!secrets || secrets.length === 0) {
        toast.error('No secrets to export');
        setIsExporting(false);
        return;
      }

      // 2. Decrypt each secret
      let envContent = `# EnVault Export: ${envName}\n# Date: ${new Date().toLocaleString()}\n\n`;
      
      for (const secret of secrets) {
        try {
          const aad = `${secret.keyName}:${environmentId}`;
          const plaintext = await decryptSecret(secret.valueEncrypted, secret.iv, derivedKey, aad);
          envContent += `${secret.keyName}=${plaintext}\n`;
        } catch (err) {
          envContent += `# ERROR DECRYPTING ${secret.keyName}\n`;
        }
      }

      // 3. Trigger download
      const blob = new Blob([envContent], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${envName}${folderId ? '-folder' : ''}.env`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Secrets exported successfully');
    } catch (err) {
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger 
        render={
          <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-indigo-600" disabled={isExporting}>
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={handleEnvExport} className="cursor-pointer">
          <FileText className="w-4 h-4 mr-2 text-slate-400" />
          Export as .env
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="text-slate-400 cursor-not-allowed">
          Export as .zip (Coming Soon)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
