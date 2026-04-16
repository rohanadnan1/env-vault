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
