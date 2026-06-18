/**
 * Central persistent store for AOI live raster analysis used by report export.
 * Never read popup/UI state at export time — only this store + frozen snapshots on SiAoiReportModel.
 */
import type { SiAoiReportLiveAnalysisSnapshot } from '../utils/siAoiReportLiveAnalysisSnapshot';

export type SiAoiReportAnalysisStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';

export type SiAoiReportAnalysisEntry = {
  aoiId: string;
  aoiName: string;
  status: SiAoiReportAnalysisStatus;
  snapshot: SiAoiReportLiveAnalysisSnapshot | null;
  errorMessage: string | null;
  updatedAt: number;
  /** Geometry + date fingerprint — skip stale ready rows after AOI/date change */
  fingerprint: string;
};

type Listener = () => void;

const entries = new Map<string, SiAoiReportAnalysisEntry>();
const listeners = new Set<Listener>();

export function subscribeSiAoiReportAnalysisStore(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export function getSiAoiReportAnalysisEntry(aoiId: string): SiAoiReportAnalysisEntry | undefined {
  return entries.get(aoiId);
}

export function setSiAoiReportAnalysisEntry(
  aoiId: string,
  patch: Partial<Omit<SiAoiReportAnalysisEntry, 'aoiId'>> & { aoiName?: string },
): void {
  const prev = entries.get(aoiId);
  const next: SiAoiReportAnalysisEntry = {
    aoiId,
    aoiName: patch.aoiName ?? prev?.aoiName ?? aoiId,
    status: patch.status ?? prev?.status ?? 'idle',
    snapshot: patch.snapshot !== undefined ? patch.snapshot : (prev?.snapshot ?? null),
    errorMessage: patch.errorMessage !== undefined ? patch.errorMessage : (prev?.errorMessage ?? null),
    updatedAt: Date.now(),
    fingerprint: patch.fingerprint ?? prev?.fingerprint ?? '',
  };
  entries.set(aoiId, next);
  emit();
}

export function clearSiAoiReportAnalysisStore(): void {
  entries.clear();
  emit();
}

export function awaitSiAoiReportLiveAnalysis(
  aoiId: string,
  opts?: { timeoutMs?: number; pollMs?: number; fingerprint?: string },
): Promise<SiAoiReportLiveAnalysisSnapshot | null> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const pollMs = opts?.pollMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  const fp = opts?.fingerprint;

  return new Promise(resolve => {
    const tick = () => {
      const entry = entries.get(aoiId);
      if (entry && fp && entry.fingerprint && entry.fingerprint !== fp) {
        if (entry.status === 'loading') {
          if (Date.now() > deadline) {
            resolve(null);
            return;
          }
          window.setTimeout(tick, pollMs);
          return;
        }
      }
      if (entry?.status === 'ready' && entry.snapshot) {
        resolve(entry.snapshot);
        return;
      }
      if (entry?.status === 'error' || entry?.status === 'unavailable') {
        resolve(null);
        return;
      }
      if (Date.now() > deadline) {
        resolve(entry?.snapshot ?? null);
        return;
      }
      window.setTimeout(tick, pollMs);
    };
    tick();
  });
}
