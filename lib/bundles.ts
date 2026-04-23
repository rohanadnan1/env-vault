import { BundleType } from '@prisma/client';

// ─── Auto-naming ──────────────────────────────────────────────────────────────

const EXT_LABELS: Record<string, string> = {
  '.js': 'JavaScript', '.jsx': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.py': 'Python',
  '.md': 'Markdown', '.mdx': 'Markdown',
  '.json': 'JSON',
  '.css': 'Stylesheet', '.scss': 'Stylesheet', '.less': 'Stylesheet',
  '.env': 'Environment',
  '.sql': 'Database', '.db': 'Database',
  '.html': 'HTML', '.htm': 'HTML',
  '.sh': 'Shell Script',
  '.yml': 'YAML', '.yaml': 'YAML',
  '.go': 'Go',
  '.rs': 'Rust',
  '.rb': 'Ruby',
  '.php': 'PHP',
};

export function autoNameBundle(type: BundleType, matchRule: string | null): string {
  if (type === BundleType.EXTENSION && matchRule) {
    const label = EXT_LABELS[matchRule.toLowerCase()] ?? matchRule.replace('.', '').toUpperCase();
    return `${label} Bundle`;
  }
  if (type === BundleType.NAME && matchRule) {
    const name = matchRule.charAt(0).toUpperCase() + matchRule.slice(1);
    return `${name} (Named) Bundle`;
  }
  return 'Custom Bundle';
}

// ─── Match validation ─────────────────────────────────────────────────────────

/** Returns true if a filename is allowed inside the given bundle */
export function fileMatchesBundle(
  filename: string,
  bundleType: BundleType,
  matchRule: string | null
): boolean {
  if (bundleType === BundleType.CUSTOM || !matchRule) return true;
  if (bundleType === BundleType.EXTENSION) {
    return filename.toLowerCase().endsWith(matchRule.toLowerCase());
  }
  if (bundleType === BundleType.NAME) {
    // strip extension, check base name starts with matchRule (case-insensitive)
    const base = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename;
    return base.toLowerCase().startsWith(matchRule.toLowerCase());
  }
  return false;
}

/** Derive the extension match rule from a filename */
export function extensionOf(filename: string): string | null {
  const idx = filename.lastIndexOf('.');
  if (idx <= 0) return null; // dotfiles have no extension
  return filename.slice(idx).toLowerCase();
}

/** Derive the base-name match rule (strips trailing digits) */
export function baseNameOf(filename: string): string {
  const base = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename;
  return base.replace(/\d+$/, '');
}

// ─── Candidate detector (for the "Create Bundle" dropdown) ────────────────────

export interface BundleCandidate {
  bundleType: BundleType;
  matchRule: string;
  name: string;
  fileIds: string[];
  fileNames: string[];
}

export function detectBundleCandidates(
  files: { id: string; name: string }[],
  existingMatchRules: string[] // matchRules of bundles already in this folder
): BundleCandidate[] {
  const candidates: BundleCandidate[] = [];
  const existingSet = new Set(existingMatchRules.map(r => r.toLowerCase()));

  // ── Extension candidates ──────────────────────────────────────────────────
  const extGroups = new Map<string, { id: string; name: string }[]>();
  for (const f of files) {
    const ext = extensionOf(f.name);
    if (!ext) continue;
    if (!extGroups.has(ext)) extGroups.set(ext, []);
    extGroups.get(ext)!.push(f);
  }
  for (const [ext, group] of extGroups) {
    if (group.length >= 2 && !existingSet.has(ext)) {
      candidates.push({
        bundleType: BundleType.EXTENSION,
        matchRule: ext,
        name: autoNameBundle(BundleType.EXTENSION, ext),
        fileIds: group.map(f => f.id),
        fileNames: group.map(f => f.name),
      });
    }
  }

  // ── Name candidates ───────────────────────────────────────────────────────
  const nameGroups = new Map<string, { id: string; name: string }[]>();
  for (const f of files) {
    const base = baseNameOf(f.name);
    if (!base || base.length < 2) continue;
    if (!nameGroups.has(base)) nameGroups.set(base, []);
    nameGroups.get(base)!.push(f);
  }
  for (const [base, group] of nameGroups) {
    if (group.length >= 2 && !existingSet.has(base.toLowerCase())) {
      candidates.push({
        bundleType: BundleType.NAME,
        matchRule: base,
        name: autoNameBundle(BundleType.NAME, base),
        fileIds: group.map(f => f.id),
        fileNames: group.map(f => f.name),
      });
    }
  }

  return candidates;
}
