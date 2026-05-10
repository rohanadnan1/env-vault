import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#6366F1'),
  emoji: z.string().max(5).optional().default('📁'),
});

export const CreateEnvironmentSchema = z.object({
  name: z.string().min(1).max(30),
  projectId: z.string().cuid(),
});

export const CreateFolderSchema = z.object({
  name: z.string().min(1).max(100),
  environmentId: z.string().cuid(),
  parentId: z.string().cuid().optional().nullable(),
});

export const CreateSecretSchema = z.object({
  keyName: z.string().regex(/^[A-Za-z0-9_]+$/, 'Only letters, numbers, and underscores').max(200),
  valueEncrypted: z.string().min(1),
  iv: z.string().min(1),
  environmentId: z.string().cuid(),
  folderId: z.string().cuid().optional().nullable(),
  tags: z.array(z.string()).max(5).optional(),
});

export const UpdateSecretSchema = z.object({
  valueEncrypted: z.string().min(1),
  iv: z.string().min(1),
});

export const CreateVaultFileSchema = z.object({
  name: z.string().min(1).max(255),
  contentEncrypted: z.string().min(1),
  iv: z.string().min(1),
  mimeType: z.string().optional().default('text/plain'),
  environmentId: z.string().cuid(),
  folderId: z.string().cuid().optional().nullable(),
});

export const CreateShareSchema = z.object({
  bundleEncrypted: z.string().min(1),
  bundleIv: z.string().min(1),
  shareSalt: z.string().min(1),
  scopeType: z.enum(['PROJECT', 'ENVIRONMENT', 'SECRET']),
  scopeId: z.string().cuid(),
  expiresIn: z.enum(['1h', '24h', '7d', '30d', 'never']).optional(),
  singleUse: z.boolean().default(false),
  recipientEmail: z.string().email().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

// ── Collaborative Sharing Schemas ──────────────────────────────────

export const ShareResourceTypeEnum = z.enum([
  'PROJECT', 'ENVIRONMENT', 'FOLDER', 'FILE', 'BUNDLE', 'SECRET'
]);

export const SharePermissionEnum = z.enum([
  'READ_ONLY', 'COMMENT', 'EDIT'
]);

export const ShareVersionModeEnum = z.enum([
  'LATEST', 'SPECIFIC', 'ALL'
]);

export const InviteStatusEnum = z.enum([
  'PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'
]);

export const EditRequestStatusEnum = z.enum([
  'PENDING', 'APPROVED', 'REJECTED', 'MERGED'
]);

export const CreateShareInvitationSchema = z.object({
  resourceType: ShareResourceTypeEnum,
  resourceId: z.string().min(1),
  projectId: z.string().optional(),
  permission: SharePermissionEnum.default('READ_ONLY'),
  versionMode: ShareVersionModeEnum.default('LATEST'),
  specificVersionId: z.string().optional(),
  recipientEmail: z.string().email('Invalid email address'),
  ttlDays: z.number().int().min(1).max(3650).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  shareEncryptionSalt: z.string().min(1),
  encryptedShareKey: z.string().min(1),
  shareKeyIv: z.string().optional(),
  bundleEncrypted: z.string().optional(),
  bundleIv: z.string().optional(),
});

export const UpdateShareInvitationSchema = z.object({
  permission: SharePermissionEnum.optional(),
  expiresAt: z.string().optional().nullable(),
  ttlDays: z.number().int().min(1).max(3650).optional().nullable(),
});

export const AcceptShareInvitationSchema = z.object({
  encryptedShareKey: z.string().min(1).optional(),
  shareKeyIv: z.string().optional(),
});

export const CreateShareCommentSchema = z.object({
  invitationId: z.string().min(1),
  content: z.string().min(1).max(5000),
  iv: z.string().optional(),
  isEncrypted: z.boolean().optional().default(true),
  parentId: z.string().optional(),
});

export const CreateShareEditRequestSchema = z.object({
  invitationId: z.string().min(1),
  resourceType: ShareResourceTypeEnum,
  resourceId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  proposedEncrypted: z.string().min(1),
  proposedIv: z.string().min(1),
  previousVersionId: z.string().optional(),
});

export const ReviewShareEditRequestSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'MERGE']),
  reviewNote: z.string().max(1000).optional(),
  mergedEncrypted: z.string().min(1).optional(),
  mergedIv: z.string().min(1).optional(),
});

export const ShareDownloadNotifySchema = z.object({
  invitationId: z.string().min(1),
  fileName: z.string().min(1),
  fileType: z.enum(['SECRET', 'FILE', 'BUNDLE', 'ENV_EXPORT']),
});
