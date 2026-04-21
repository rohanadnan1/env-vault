'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function VaultError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error('[VAULT_SEGMENT_ERROR]', error);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-amber-900">Temporary server issue</h2>
            <p className="mt-1 text-sm text-amber-800">
              We could not load part of your vault right now. Your session is still active.
            </p>
            <div className="mt-4">
              <Button size="sm" onClick={reset}>Try Again</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
