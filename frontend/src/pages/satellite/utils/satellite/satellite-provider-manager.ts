import { getSatelliteProvider, type SatelliteProviderId } from './provider-capabilities';
import { buildProviderRendererProfile } from './provider-renderer';

const LS_PROVIDER = 'geosyntra-si-satellite-provider-v1';
const LS_COLLECTION = 'geosyntra-si-satellite-collection-v1';

export function loadStoredSatelliteProviderId(): SatelliteProviderId {
  try {
    const v = localStorage.getItem(LS_PROVIDER);
    if (v && getSatelliteProvider(v as SatelliteProviderId)) return v as SatelliteProviderId;
  } catch {
    /* ignore */
  }
  return 'sentinel-hub';
}

export function persistSatelliteProviderId(id: SatelliteProviderId): void {
  try {
    localStorage.setItem(LS_PROVIDER, id);
  } catch {
    /* ignore */
  }
}

export function loadStoredSatelliteCollectionId(providerId: SatelliteProviderId): string {
  try {
    const raw = localStorage.getItem(`${LS_COLLECTION}:${providerId}`);
    if (raw) return raw;
  } catch {
    /* ignore */
  }
  const p = getSatelliteProvider(providerId);
  return p.collections?.[0]?.id ?? '';
}

export function persistSatelliteCollectionId(providerId: SatelliteProviderId, collectionId: string): void {
  try {
    localStorage.setItem(`${LS_COLLECTION}:${providerId}`, collectionId);
  } catch {
    /* ignore */
  }
}

export function defaultTimeSeriesRangeForProvider(providerId: SatelliteProviderId): {
  start: string;
  end: string;
} {
  const end = new Date();
  const start = new Date(end);
  const monthsBack =
    providerId === 'planet-labs' || providerId === 'blacksky' || providerId === 'umbra' ? 3 : 4;
  start.setMonth(start.getMonth() - monthsBack);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export type SatelliteProviderSwitchActions = {
  pauseTimeline: () => void;
  invalidateLayerCache: () => void;
  refreshTimeline: () => void;
  rebuildRenderer: () => void;
  reloadLegend: () => void;
  syncClassification: () => void;
  resetUnavailableTools: () => void;
};

export type ApplySatelliteProviderSwitchOpts = {
  nextProviderId: SatelliteProviderId;
  nextCollectionId?: string;
  actions: SatelliteProviderSwitchActions;
  onDates: (start: string, end: string) => void;
  onStatus: (message: string) => void;
};

/**
 * Orchestrates required side effects when the user changes satellite provider.
 */
export function applySatelliteProviderSwitch(opts: ApplySatelliteProviderSwitchOpts): void {
  const { nextProviderId, actions, onDates, onStatus } = opts;
  const provider = getSatelliteProvider(nextProviderId);
  const profile = buildProviderRendererProfile(nextProviderId);

  persistSatelliteProviderId(nextProviderId);
  if (opts.nextCollectionId != null) {
    persistSatelliteCollectionId(nextProviderId, opts.nextCollectionId);
  }

  actions.pauseTimeline();
  actions.invalidateLayerCache();
  actions.refreshTimeline();
  actions.rebuildRenderer();
  actions.reloadLegend();
  actions.syncClassification();
  actions.resetUnavailableTools();

  const range = defaultTimeSeriesRangeForProvider(nextProviderId);
  onDates(range.start, range.end);

  const collectionNote = opts.nextCollectionId
    ? ` · collection ${opts.nextCollectionId}`
    : '';
  onStatus(
    `${provider.name} active — ${profile.resolutionM}${profile.resolutionM < 1 ? '' : ' m'} ${provider.dataType}, revisit ${provider.revisitLabel}${collectionNote}. Layers, timeline, and legend refreshed.`,
  );
}

/** Factory for SatelliteIntelligence — wires manager hooks to React setters. */
export function createSatelliteProviderSwitchActions(hooks: {
  pauseTimelinePlayback: () => void;
  setWeeklyComposites: (v: []) => void;
  setFieldTimelineSessionActive: (v: boolean) => void;
  setSiWmsSymbologyByLayer: (v: Record<string, never>) => void;
  bumpProviderEpoch: () => void;
  setSentinelWmsRev: (fn: (n: number) => number) => void;
}): SatelliteProviderSwitchActions & { pauseTimeline: () => void } {
  return {
    pauseTimeline: hooks.pauseTimelinePlayback,
    invalidateLayerCache: () => {
      hooks.bumpProviderEpoch();
      hooks.setSentinelWmsRev(n => n + 1);
    },
    refreshTimeline: () => {
      hooks.pauseTimelinePlayback();
      hooks.setWeeklyComposites([]);
      hooks.setFieldTimelineSessionActive(false);
    },
    rebuildRenderer: () => {
      hooks.bumpProviderEpoch();
    },
    reloadLegend: () => {
      /* Legend panel visibility is user-controlled via map chrome toggle. */
    },
    syncClassification: () => {
      hooks.setSiWmsSymbologyByLayer({});
    },
    resetUnavailableTools: () => {
      hooks.pauseTimelinePlayback();
    },
  };
}
