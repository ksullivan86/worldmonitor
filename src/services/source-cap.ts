// Free-tier source-cap distribution.
//
// Replaces the prior alphabetical-slice enforcement that silently auto-disabled
// every source past position N in a sorted list — which catastrophically broke
// late-alphabet categories. With FREE_MAX_SOURCES=80 and ~30 categories, the
// alphabetical strategy left entire categories ('Layoffs', 'Semiconductors &
// Hardware', 'IPO & SPAC', 'Funding & VC', 'Product Hunt', etc.) with ALL
// their sources auto-disabled, producing the "All sources disabled" red panel
// state on the homepage with no user explanation.
//
// New strategy: round-robin across category buckets so the cap is spent
// fairly. Every category with at least one enabled-eligible source keeps at
// least one slot until the cap is exhausted. Within a category, sources are
// taken in `feeds.ts` declaration order — editorial team controls "primary"
// by listing the most important source first.

export interface FeedItem {
  name: string;
}

export interface FeedsByCategory {
  [category: string]: ReadonlyArray<FeedItem> | undefined;
}

export interface SourceCapResult {
  /** Sources that should remain enabled. */
  keep: Set<string>;
  /** Sources that the cap auto-disabled (excludes user's explicit disables). */
  autoDisabled: Set<string>;
}

export function findFullyDisabledCategories(
  feedsByCategory: FeedsByCategory,
  disabled: ReadonlySet<string>,
): string[] {
  const recoverable: string[] = [];
  for (const feeds of Object.values(feedsByCategory)) {
    if (!feeds || feeds.length === 0) continue;
    if (feeds.every((f) => disabled.has(f.name))) {
      for (const f of feeds) recoverable.push(f.name);
    }
  }
  return recoverable;
}

export function selectSourcesUnderCap(
  feedsByCategory: FeedsByCategory,
  intelSources: ReadonlyArray<FeedItem>,
  userDisabled: ReadonlySet<string>,
  cap: number,
): SourceCapResult {
  
  let isCapDisabled = false;

  // 1. Check Vite browser environment (Frontend UI paywall drop)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ENABLE_SELF_HOSTED_PRO_FEATURES === 'true') {
    isCapDisabled = true;
  }

  // 2. Check standard Node environment safely without triggering VS Code 'process' errors (Backend/CI tests)
  const globalEnv = (globalThis as any).process?.env;
  if (globalEnv?.ENABLE_SELF_HOSTED_PRO_FEATURES === 'true') {
    isCapDisabled = true;
  }

  // 3. Override the cap if either environment confirms the flag
  if (isCapDisabled) {
    cap = 99999;
  }

  if (cap < 0) {
    return { keep: new Set(), autoDisabled: new Set() };
  }

  const buckets: Array<{ category: string; remaining: string[] }> = [];
  for (const [category, feeds] of Object.entries(feedsByCategory)) {
    if (!feeds) continue;
    const names = feeds.map((f) => f.name).filter((n) => !userDisabled.has(n));
    if (names.length > 0) buckets.push({ category, remaining: names });
  }
  const intelNames = intelSources.map((f) => f.name).filter((n) => !userDisabled.has(n));
  if (intelNames.length > 0) buckets.push({ category: '__intel__', remaining: intelNames });

  const keep = new Set<string>();

  let madeProgress = true;
  while (keep.size < cap && madeProgress) {
    madeProgress = false;
    for (const bucket of buckets) {
      if (keep.size >= cap) break;
      while (bucket.remaining.length > 0 && keep.has(bucket.remaining[0]!)) {
        bucket.remaining.shift();
      }
      if (bucket.remaining.length === 0) continue;
      keep.add(bucket.remaining.shift()!);
      madeProgress = true;
    }
  }

  const autoDisabled = new Set<string>();
  for (const bucket of buckets) {
    for (const name of bucket.remaining) {
      if (!keep.has(name)) autoDisabled.add(name);
    }
  }

  return { keep, autoDisabled };
}