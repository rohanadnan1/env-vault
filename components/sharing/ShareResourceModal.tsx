'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  FolderOpen,
  FileText,
  Share2,
  Lock,
  Mail,
  MessageSquare,
  ShieldCheck,
  CheckCircle,
  Calendar,
  Eye,
  Pencil,
  ArrowRight,
  ArrowLeft,
  UserPlus,
  History,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVaultStore } from '@/lib/store/vaultStore';
import {
  generateShareKey,
  wrapShareKey,
  reEncryptContent,
} from '@/lib/crypto/collaborative-share';
import { decryptSecret } from '@/lib/crypto/decrypt';
import { SharePermissionBadge } from '@/components/sharing/SharePermissionBadge';
import { TTLSelector } from '@/components/sharing/TTLSelector';
import { VersionModeSelector } from '@/components/sharing/VersionModeSelector';
import { toast } from 'sonner';

type Permission = 'READ_ONLY' | 'COMMENT' | 'EDIT';
type VersionMode = 'LATEST' | 'SPECIFIC' | 'ALL';

interface ShareResourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceType: 'PROJECT' | 'ENVIRONMENT' | 'FOLDER' | 'FILE' | 'BUNDLE' | 'SECRET';
  resourceId: string;
  resourceName: string;
  projectId?: string;
  envId?: string;
}

interface SecretRow {
  id: string;
  keyName: string;
  environmentId: string;
  valueEncrypted: string;
  iv: string;
  folderId?: string | null;
}

interface FileRow {
  id: string;
  name: string;
  environmentId: string;
  contentEncrypted: string;
  iv: string;
  mimeType?: string | null;
  folderId?: string | null;
}

type ShareBundleEntry =
  | { kind: 'SECRET'; resourceId: string; name: string; plaintext: string }
  | { kind: 'FILE'; resourceId: string; name: string; plaintext: string; mimeType: string };

const STEPS = ['Resources', 'Permission', 'Expiry', 'Recipient', 'Confirm'] as const;

const TYPE_BADGE: Record<ShareResourceModalProps['resourceType'], string> = {
  PROJECT: 'Project',
  ENVIRONMENT: 'Environment',
  FOLDER: 'Folder',
  FILE: 'File',
  BUNDLE: 'Bundle',
  SECRET: 'Secret',
};

const TYPE_ICON: Record<ShareResourceModalProps['resourceType'], typeof FolderOpen> = {
  PROJECT: FolderOpen,
  ENVIRONMENT: FolderOpen,
  FOLDER: FolderOpen,
  FILE: FileText,
  BUNDLE: FolderOpen,
  SECRET: FileText,
};

const PERMISSION_OPTIONS: {
  value: Permission;
  Icon: typeof Eye;
  title: string;
  description: string;
}[] = [
  {
    value: 'READ_ONLY',
    Icon: Eye,
    title: 'Read only',
    description: 'Recipients can view but not edit or comment on the shared resource.',
  },
  {
    value: 'COMMENT',
    Icon: MessageSquare,
    title: 'Comment',
    description: 'Recipients can view and leave comments, but cannot modify the resource.',
  },
  {
    value: 'EDIT',
    Icon: Pencil,
    title: 'Edit',
    description: 'Recipients have full edit access to the shared resource.',
  },
];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-1">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-1">
          {i > 0 && <span className="h-px w-4 bg-slate-200" />}
          <span
            className={cn(
              'text-[10px] font-bold uppercase tracking-widest',
              step === i ? 'text-indigo-600' : 'text-slate-400'
            )}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ShareResourceModal({
  open,
  onOpenChange,
  resourceType,
  resourceId,
  resourceName,
  projectId,
  envId,
}: ShareResourceModalProps) {
  const [step, setStep] = useState(0);
  const [permission, setPermission] = useState<Permission>('READ_ONLY');
  const [ttl, setTtl] = useState<{ ttlDays: number | null; expiresAt: string | null }>({
    ttlDays: 7,
    expiresAt: (() => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString();
    })(),
  });
  const [versionMode, setVersionMode] = useState<VersionMode>('LATEST');
  const [specificVersionId, setSpecificVersionId] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [note, setNote] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [previousEmails, setPreviousEmails] = useState<string[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [recipientState, setRecipientState] = useState<{
    hasSharedBefore: boolean;
    existingSalt: string | null;
  } | null>(null);
  const [reusePassphrase, setReusePassphrase] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const derivedKey = useVaultStore((s) => s.derivedKey);
  const touchActivity = useVaultStore((s) => s.touchActivity);

  const visibleVersionModes =
    resourceType === 'FILE' || resourceType === 'SECRET';

  useEffect(() => {
    if (!open) return;
    fetch('/api/sharing/previous-recipients')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data?.emails) setPreviousEmails(data.emails); })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    const email = recipientEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setRecipientState(null);
      setReusePassphrase(false);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/sharing/recipient-state?email=${encodeURIComponent(email)}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data) {
            setRecipientState(data);
            if (data.hasSharedBefore) setReusePassphrase(true);
            else setReusePassphrase(false);
          }
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [recipientEmail]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        emailInputRef.current &&
        !emailInputRef.current.contains(e.target as Node)
      ) {
        setShowEmailSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNext = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const handlePrev = () => setStep((s) => Math.max(s - 1, 0));

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (isProcessing) return;
      onOpenChange(open);
      if (!open) {
        setStep(0);
        setPermission('READ_ONLY');
        setTtl({
          ttlDays: 7,
          expiresAt: (() => {
            const d = new Date();
            d.setDate(d.getDate() + 7);
            return d.toISOString();
          })(),
        });
        setVersionMode('LATEST');
        setSpecificVersionId('');
        setRecipientEmail('');
        setNote('');
        setPassphrase('');
        setShareSuccess(false);
        setRecipientState(null);
        setReusePassphrase(false);
        setShowEmailSuggestions(false);
      }
    },
    [isProcessing, onOpenChange]
  );

  const handleSubmit = async () => {
    if (!derivedKey) {
      toast.error('Vault is locked');
      return;
    }
    if (passphrase.length < 8) {
      toast.error('Passphrase must be at least 8 characters');
      return;
    }
    if (!recipientEmail) {
      toast.error('Recipient email is required');
      return;
    }

    setIsProcessing(true);
    touchActivity();

    try {
      let secrets: SecretRow[] = [];
      let files: FileRow[] = [];

      const fetchSecretsForScope = async (environmentId: string, folderId?: string | null) => {
        const params = new URLSearchParams({ envId: environmentId });
        if (folderId) params.set('folderId', folderId);
        const res = await fetch(`/api/secrets?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch secrets');
        return res.json() as Promise<SecretRow[]>;
      };

      const fetchFilesForScope = async (environmentId: string, folderId?: string | null) => {
        const params = new URLSearchParams({ envId: environmentId });
        if (folderId) params.set('folderId', folderId);
        const res = await fetch(`/api/vault-files?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch files');
        const rows = await res.json() as Array<{ id: string }>;
        return Promise.all(
          rows.map(async (row) => {
            const fileRes = await fetch(`/api/vault-files/${row.id}`);
            if (!fileRes.ok) throw new Error('Failed to fetch file');
            return fileRes.json() as Promise<FileRow>;
          })
        );
      };

      if (resourceType === 'SECRET') {
        if (!envId) throw new Error('Environment context is required to share this secret');
        secrets = await fetchSecretsForScope(envId);
        secrets = secrets.filter((s) => s.id === resourceId);
      } else if (resourceType === 'FILE') {
        const res = await fetch(`/api/vault-files/${resourceId}`);
        if (res.ok) {
          const file = await res.json();
          if (file) {
            files = [file];
          }
        }
      } else if (resourceType === 'ENVIRONMENT') {
        secrets = await fetchSecretsForScope(resourceId);
        files = await fetchFilesForScope(resourceId);
      } else if (resourceType === 'FOLDER') {
        if (!envId) throw new Error('Environment context is required to share this folder');
        secrets = await fetchSecretsForScope(envId, resourceId);
        files = await fetchFilesForScope(envId, resourceId);
      } else if (resourceType === 'PROJECT') {
        const projectsRes = await fetch('/api/projects');
        if (!projectsRes.ok) throw new Error('Failed to fetch projects');
        const projects = await projectsRes.json();
        const project = projects.find(
          (p: { id: string; environments?: { id: string }[] }) => p.id === resourceId
        );
        if (!project) throw new Error('Project not found');
        for (const env of project.environments ?? []) {
          secrets.push(...await fetchSecretsForScope(env.id));
          files.push(...await fetchFilesForScope(env.id));
        }
      } else if (resourceType === 'BUNDLE') {
        const res = await fetch(`/api/vault-bundles/${resourceId}`);
        if (!res.ok) throw new Error('Failed to fetch bundle');
        const bundle = await res.json() as { members?: Array<{ fileId: string }> };
        files = await Promise.all(
          (bundle.members ?? []).map(async (member) => {
            const fileRes = await fetch(`/api/vault-files/${member.fileId}`);
            if (!fileRes.ok) throw new Error('Failed to fetch file');
            return fileRes.json() as Promise<FileRow>;
          })
        );
      }

      if (secrets.length === 0 && files.length === 0) {
        toast.error('No content found to share');
        setIsProcessing(false);
        return;
      }

      const plaintextEntries: ShareBundleEntry[] = [];

      for (const s of secrets) {
        try {
          const aad = `${s.keyName}:${s.environmentId ?? ''}`;
          const plaintext = await decryptSecret(s.valueEncrypted, s.iv, derivedKey, aad);
          plaintextEntries.push({ kind: 'SECRET', resourceId: s.id, name: s.keyName, plaintext });
        } catch {
          if (s.folderId) {
            const fallbackAad = `${s.keyName}:${s.folderId}`;
            const plaintext = await decryptSecret(s.valueEncrypted, s.iv, derivedKey, fallbackAad);
            plaintextEntries.push({ kind: 'SECRET', resourceId: s.id, name: s.keyName, plaintext });
          } else {
            throw new Error(`Failed to decrypt ${s.keyName}`);
          }
        }
      }

      for (const file of files) {
        const fileAad = `${file.name ?? resourceName}:${file.environmentId ?? ''}`;
        let fileContent: string;
        try {
          fileContent = await decryptSecret(file.contentEncrypted, file.iv, derivedKey, fileAad);
        } catch {
          if (file.folderId) {
            fileContent = await decryptSecret(file.contentEncrypted, file.iv, derivedKey, `${file.name ?? resourceName}:${file.folderId}`);
          } else {
            throw new Error(`Failed to decrypt ${file.name ?? resourceName}`);
          }
        }
        plaintextEntries.push({
          kind: 'FILE',
          resourceId: file.id,
          name: file.name ?? resourceName,
          plaintext: fileContent,
          mimeType: file.mimeType || 'text/plain',
        });
      }

      if (plaintextEntries.length === 0) {
        toast.error('No content to share');
        setIsProcessing(false);
        return;
      }

      const bundleStr = JSON.stringify(plaintextEntries);

      const saltToUse = reusePassphrase && recipientState?.existingSalt
        ? recipientState.existingSalt
        : undefined;
      const { shareKey, shareEncryptionSalt } = await generateShareKey(saltToUse);
      const pwd = passphrase || '';
      const { encryptedShareKey, shareKeyIv } = await wrapShareKey(
        shareKey,
        pwd,
        shareEncryptionSalt
      );
      const { encrypted: contentEncrypted, iv: contentIv } = await reEncryptContent(
        bundleStr,
        shareKey
      );

      const normalizedRecipientEmail = recipientEmail.trim();
      const normalizedNote = note.trim();
      const body = {
        resourceType,
        resourceId,
        permission,
        ttlDays: ttl.ttlDays,
        recipientEmail: normalizedRecipientEmail,
        ...(normalizedNote ? { note: normalizedNote } : {}),
        versionMode: visibleVersionModes ? versionMode : 'LATEST',
        ...(visibleVersionModes && versionMode === 'SPECIFIC' && specificVersionId
          ? { specificVersionId }
          : {}),
        ...(projectId ? { projectId } : {}),
        shareEncryptionSalt,
        encryptedShareKey,
        shareKeyIv,
        bundleEncrypted: contentEncrypted,
        bundleIv: contentIv,
        ...(ttl.expiresAt ? { expiresAt: ttl.expiresAt } : {}),
      };

      const shareRes = await fetch('/api/sharing/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!shareRes.ok) {
        const errData = await shareRes.json().catch(() => null);
        throw new Error(errData?.error ?? 'Invitation failed');
      }

      setShareSuccess(true);
      toast.success('Share invitation created');
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Could not create share invitation');
    } finally {
      setIsProcessing(false);
    }
  };

  const ResourceIcon = TYPE_ICON[resourceType];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[520px]"
        showCloseButton={!isProcessing}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-5 text-indigo-600" />
            Share {TYPE_BADGE[resourceType]}
          </DialogTitle>
          <DialogDescription>
            Create a collaborative share with fine-grained access control.
          </DialogDescription>
        </DialogHeader>

        {!shareSuccess && <StepIndicator step={step} />}

        {!shareSuccess ? (
          <div className="space-y-4">
            {step === 0 && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    <ResourceIcon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">{resourceName}</p>
                    <div className="mt-1">
                      <Badge variant="secondary">{TYPE_BADGE[resourceType]}</Badge>
                    </div>
                  </div>
                </div>

                <VersionModeSelector
                  value={versionMode}
                  onChange={setVersionMode}
                  onSpecificVersionChange={setSpecificVersionId}
                  visible={visibleVersionModes}
                />
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Permission level
                </Label>
                {PERMISSION_OPTIONS.map(({ value: permValue, Icon, title, description }) => (
                  <button
                    key={permValue}
                    type="button"
                    onClick={() => setPermission(permValue)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                      permission === permValue
                        ? 'border-indigo-600 bg-indigo-50/50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-lg',
                        permission === permValue
                          ? 'bg-indigo-100 text-indigo-600'
                          : 'bg-slate-100 text-slate-500'
                      )}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'text-sm font-medium',
                          permission === permValue ? 'text-indigo-700' : 'text-slate-700'
                        )}
                      >
                        {title}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <TTLSelector value={ttl} onChange={setTtl} />
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="recipient-email"
                    className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"
                  >
                    Recipient email
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      ref={emailInputRef}
                      id="recipient-email"
                      className="pl-9 pr-8"
                      placeholder="hello@example.com"
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => {
                        setRecipientEmail(e.target.value);
                        setShowEmailSuggestions(true);
                      }}
                      onFocus={() => { if (previousEmails.length > 0) setShowEmailSuggestions(true); }}
                      autoComplete="off"
                    />
                    {previousEmails.length > 0 && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        onClick={() => setShowEmailSuggestions(v => !v)}
                      >
                        <ChevronDown className={cn('size-4 transition-transform', showEmailSuggestions && 'rotate-180')} />
                      </button>
                    )}
                    {showEmailSuggestions && previousEmails.length > 0 && (
                      <div
                        ref={suggestionsRef}
                        className="absolute top-full mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg z-50 py-1 max-h-48 overflow-y-auto"
                      >
                        <div className="px-3 py-1.5">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Recent recipients</span>
                        </div>
                        {previousEmails
                          .filter(e => !recipientEmail || e.toLowerCase().includes(recipientEmail.toLowerCase()))
                          .map(email => (
                            <button
                              key={email}
                              type="button"
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors text-left"
                              onClick={() => {
                                setRecipientEmail(email);
                                setShowEmailSuggestions(false);
                              }}
                            >
                              <History className="size-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{email}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="invite-note"
                    className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"
                  >
                    Note (optional)
                  </Label>
                  <div className="relative">
                    <MessageSquare className="pointer-events-none absolute left-3 top-3 size-4 text-slate-400" />
                    <Textarea
                      id="invite-note"
                      className="min-h-20 pl-9"
                      placeholder="Add a personal note for the recipient..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </div>
                </div>

                {recipientState?.hasSharedBefore && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <label className="flex items-center gap-2 cursor-pointer select-none flex-1">
                      <input
                        type="checkbox"
                        checked={reusePassphrase}
                        onChange={(e) => setReusePassphrase(e.target.checked)}
                        className="size-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-emerald-800">Use existing shared passphrase</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setReusePassphrase(false)}
                      className={cn(
                        'text-xs font-medium px-2 py-1 rounded-lg transition-colors',
                        !reusePassphrase
                          ? 'bg-emerald-600 text-white'
                          : 'text-emerald-600 hover:bg-emerald-100'
                      )}
                    >
                      <RefreshCw className="size-3 inline mr-1" />
                      New
                    </button>
                  </div>
                )}

                {!recipientState?.hasSharedBefore && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="share-passphrase"
                      className="text-[10px] font-bold text-slate-400 uppercase tracking-widest"
                    >
                      Protection passphrase
                    </Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                      <PasswordInput
                        id="share-passphrase"
                        placeholder="Set a passphrase (min 8 chars)"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400">
                      You must share this passphrase with the recipient separately.
                    </p>
                  </div>
                )}

                {recipientState?.hasSharedBefore && !reusePassphrase && (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="share-passphrase"
                      className="text-[10px] font-bold text-amber-600 uppercase tracking-widest"
                    >
                      New shared passphrase
                    </Label>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-amber-400" />
                      <PasswordInput
                        id="share-passphrase"
                        placeholder="Enter a new shared passphrase"
                        value={passphrase}
                        onChange={(e) => setPassphrase(e.target.value)}
                      />
                    </div>
                    <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                      <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                      <p className="text-[10px] leading-relaxed text-amber-700">
                        Setting a new passphrase will only apply to new shares. Previous shares will still use the old passphrase.
                      </p>
                    </div>
                  </div>
                )}

                {recipientState?.hasSharedBefore && reusePassphrase && (
                  <>
                    <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                      <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <div>
                        <p className="text-[11px] leading-relaxed text-emerald-700 font-medium">
                          Existing shared passphrase will be reused
                        </p>
                        <p className="text-[10px] leading-relaxed text-emerald-600 mt-0.5">
                          Enter your shared passphrase below to confirm it still works for your recipient.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label
                        htmlFor="share-passphrase"
                        className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest"
                      >
                        Confirm shared passphrase
                      </Label>
                      <div className="relative">
                        <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-emerald-400" />
                        <PasswordInput
                          id="share-passphrase"
                          placeholder="Enter your existing shared passphrase"
                          value={passphrase}
                          onChange={(e) => setPassphrase(e.target.value)}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">
                        You must share this passphrase with the recipient separately.
                      </p>
                    </div>
                  </>
                )}

                <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-indigo-600" />
                  <p className="text-[11px] leading-relaxed text-indigo-700">
                    The resource is re-encrypted with a new share key. The server never sees your
                    vault key or the passphrase.
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Confirmation
                </Label>

                <div className="rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <ResourceIcon className="size-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-900">{resourceName}</span>
                    <Badge variant="secondary">{TYPE_BADGE[resourceType]}</Badge>
                  </div>

                  <div className="flex items-center gap-2">
                    <SharePermissionBadge permission={permission} />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-600">
                    <Calendar className="size-3.5" />
                    {ttl.ttlDays !== null
                      ? `Expires in ${ttl.ttlDays} day${ttl.ttlDays === 1 ? '' : 's'}`
                      : 'No expiry'}
                  </div>

                  {visibleVersionModes && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <FileText className="size-3.5" />
                      {versionMode === 'LATEST'
                        ? 'Latest version only'
                        : versionMode === 'SPECIFIC'
                          ? `Specific version: ${specificVersionId || '(none)'}`
                          : 'All versions'}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <UserPlus className="size-3.5 text-slate-400" />
                    <span className="text-xs text-slate-600">{recipientEmail}</span>
                  </div>

                  {note && (
                    <div className="flex items-start gap-2">
                      <MessageSquare className="mt-0.5 size-3.5 text-slate-400" />
                      <span className="text-xs text-slate-500">{note}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3">
                  <Lock className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <p className="text-[11px] leading-relaxed text-amber-800">
                    <strong>Important:</strong> You must provide the passphrase to the recipient
                    separately. It will not be included in the invitation.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center py-6 text-center space-y-5">
            <div className="flex size-16 items-center justify-center rounded-full border border-emerald-100 bg-emerald-50">
              <CheckCircle className="size-8 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Invitation Sent</h3>
              <p className="mt-1 text-sm text-slate-500">
                An email invitation has been sent to{' '}
                <span className="font-medium text-slate-700">{recipientEmail}</span>.
              </p>
            </div>

            <div className="flex w-full items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-left">
              <Lock className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="text-[11px] leading-relaxed text-amber-800">
                <strong>Remember:</strong> You must also share the passphrase with the recipient via
                a different channel. We do not include it in the invitation email for security
                reasons.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          {shareSuccess ? (
            <Button className="w-full" onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          ) : step === 0 ? (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isProcessing}>
                Cancel
              </Button>
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="size-4" />
              </Button>
            </>
          ) : step === STEPS.length - 1 ? (
            <>
              <Button variant="ghost" onClick={handlePrev} disabled={isProcessing}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={isProcessing || passphrase.length < 8 || !recipientEmail}>
                {isProcessing ? 'Creating Invitation…' : 'Send Invitation'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={handlePrev} disabled={isProcessing}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={handleNext}>
                Next
                <ArrowRight className="size-4" />
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
