export type DiffLine = {
  type: 'equal' | 'added' | 'removed';
  lineNumber: number;
  content: string;
};

export function computeDiff(original: string, modified: string): {
  added: number;
  removed: number;
  totalChanges: number;
  unified: DiffLine[];
} {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  const lcs = computeLCS(originalLines, modifiedLines);

  const unified: DiffLine[] = [];
  let origIdx = 0;
  let modIdx = 0;
  let added = 0;
  let removed = 0;

  for (const match of lcs) {
    while (origIdx < match.origIndex) {
      unified.push({ type: 'removed', lineNumber: origIdx + 1, content: originalLines[origIdx] });
      origIdx++;
      removed++;
    }
    while (modIdx < match.modIndex) {
      unified.push({ type: 'added', lineNumber: modIdx + 1, content: modifiedLines[modIdx] });
      modIdx++;
      added++;
    }
    unified.push({ type: 'equal', lineNumber: modIdx + 1, content: modifiedLines[modIdx] });
    origIdx++;
    modIdx++;
  }

  while (origIdx < originalLines.length) {
    unified.push({ type: 'removed', lineNumber: origIdx + 1, content: originalLines[origIdx] });
    origIdx++;
    removed++;
  }
  while (modIdx < modifiedLines.length) {
    unified.push({ type: 'added', lineNumber: modIdx + 1, content: modifiedLines[modIdx] });
    modIdx++;
    added++;
  }

  return { added, removed, totalChanges: added + removed, unified };
}

type LCSMatch = { origIndex: number; modIndex: number };

function computeLCS<T>(a: T[], b: T[]): LCSMatch[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matches: LCSMatch[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      matches.unshift({ origIndex: i - 1, modIndex: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return matches;
}

export function applyDiff(base: string, diffLines: DiffLine[]): string {
  const baseLines = base.split('\n');
  const result: string[] = [];
  let baseIdx = 0;

  for (const line of diffLines) {
    if (line.type === 'equal') {
      result.push(baseLines[baseIdx] ?? '');
      baseIdx++;
    } else if (line.type === 'removed') {
      baseIdx++;
    } else if (line.type === 'added') {
      result.push(line.content);
    }
  }

  while (baseIdx < baseLines.length) {
    result.push(baseLines[baseIdx]);
    baseIdx++;
  }

  return result.join('\n');
}

function mergeChunks(chunks: DiffLine[][]): DiffLine[] {
  const merged: DiffLine[] = [];
  for (const chunk of chunks) {
    const removals = chunk.filter(l => l.type === 'removed');
    const additions = chunk.filter(l => l.type === 'added');

    if (removals.length > 0 && additions.length > 0) {
      for (const r of removals) {
        merged.push({ ...r, type: 'removed' });
      }
      for (const a of additions) {
        merged.push({ ...a, type: 'added' });
      }
    } else {
      merged.push(...chunk);
    }
  }
  return merged;
}

export function computeSmartMerge(workspaceText: string, kingText: string): {
  mergedText: string;
  lines: Array<{ type: 'keep' | 'king-add' | 'king-remove' | 'conflict'; lineNumber: number; content: string; originalContent?: string }>;
  hasConflicts: boolean;
} {
  const diff = computeDiff(workspaceText, kingText);

  const resultLines: Array<{ type: 'keep' | 'king-add' | 'king-remove' | 'conflict'; lineNumber: number; content: string; originalContent?: string }> = [];

  let lineNum = 0;
  for (const d of diff.unified) {
    lineNum++;
    if (d.type === 'equal') {
      resultLines.push({ type: 'keep', lineNumber: lineNum, content: d.content });
    } else if (d.type === 'added') {
      resultLines.push({ type: 'king-add', lineNumber: lineNum, content: d.content });
    } else if (d.type === 'removed') {
      resultLines.push({ type: 'king-remove', lineNumber: lineNum, content: d.content });
    }
  }

  const mergedText = resultLines
    .filter(l => l.type !== 'king-remove')
    .map(l => l.content)
    .join('\n');

  return {
    mergedText,
    lines: resultLines,
    hasConflicts: false,
  };
}
