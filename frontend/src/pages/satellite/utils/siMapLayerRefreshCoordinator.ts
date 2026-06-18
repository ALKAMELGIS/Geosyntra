import type { SiCustomLayerRegistryFields } from './siMapCustomLayerRegistry';

type RefreshJob = {
  jobId: string;
  layerId: string;
  startedAt: number;
  promise: Promise<unknown>;
};

const activeJobs = new Map<string, RefreshJob>();

/**
 * Run one background refresh job per layer — never restarted by camera / React re-renders.
 * A new job replaces the previous only when jobId changes (explicit new refresh).
 */
export function runSiCustomLayerBackgroundJob<T>(
  layerId: string,
  jobId: string,
  task: () => Promise<T>,
): Promise<T> {
  const existing = activeJobs.get(layerId);
  if (existing?.jobId === jobId) return existing.promise as Promise<T>;

  const promise = task().finally(() => {
    const current = activeJobs.get(layerId);
    if (current?.jobId === jobId) activeJobs.delete(layerId);
  });

  activeJobs.set(layerId, { jobId, layerId, startedAt: Date.now(), promise });
  return promise;
}

export function isSiCustomLayerBackgroundJobRunning(layerId: string): boolean {
  return activeJobs.has(layerId);
}

export function getSiCustomLayerBackgroundJobId(layerId: string): string | null {
  return activeJobs.get(layerId)?.jobId ?? null;
}

/** Build a stable job id from layer revision inputs (not camera / zoom). */
export function buildSiCustomLayerRefreshJobId(
  layer: SiCustomLayerRegistryFields,
  sourceToken?: string,
): string {
  return `${layer.id}:${sourceToken ?? 'local'}:${layer.mapRenderRevision ?? 0}`;
}
