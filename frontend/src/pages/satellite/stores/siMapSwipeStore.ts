import { create } from 'zustand';
import type { SiMapLayerSwipeState } from '../utils/siMapLayerSwipeRuntime';
import { DEFAULT_SI_MAP_LAYER_SWIPE_STATE } from '../utils/siMapLayerSwipeRuntime';
import { SI_MAP_SWIPE_SIDE_A_KEY, SI_MAP_SWIPE_SIDE_B_KEY } from '../utils/siMapSwipeKeys';

export { SI_MAP_SWIPE_SIDE_A_KEY, SI_MAP_SWIPE_SIDE_B_KEY };

export type SiMapSwipeSideConfig = {
  layerId: string;
  /** ISO date (YYYY-MM-DD) for Sentinel TIME= param. */
  dateIso: string;
  visible: boolean;
  opacity: number;
  /** Lock layer/date while comparing. */
  locked: boolean;
};

export type SiMapSwipeWidgetState = {
  panelOpen: boolean;
  minimized: boolean;
  collapsedControls: boolean;
  fullscreen: boolean;
  showAoiBoundary: boolean;
  syncColorRamps: boolean;
  layerA: SiMapSwipeSideConfig;
  layerB: SiMapSwipeSideConfig;
  runtime: SiMapLayerSwipeState;
};

const SI_SWIPE_WIDGET_LS = 'si-map-swipe-widget-v1';

export const DEFAULT_SI_MAP_SWIPE_SIDE: SiMapSwipeSideConfig = {
  layerId: 'NDVI',
  dateIso: '',
  visible: true,
  opacity: 1,
  locked: false,
};

function readStoredWidget(): Partial<SiMapSwipeWidgetState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SI_SWIPE_WIDGET_LS);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<SiMapSwipeWidgetState>;
  } catch {
    return {};
  }
}

function persistWidget(state: SiMapSwipeWidgetState): void {
  try {
    localStorage.setItem(
      SI_SWIPE_WIDGET_LS,
      JSON.stringify({
        layerA: state.layerA,
        layerB: state.layerB,
        runtime: {
          ...state.runtime,
          active: false,
        },
        showAoiBoundary: state.showAoiBoundary,
        syncColorRamps: state.syncColorRamps,
      }),
    );
  } catch {
    /* ignore */
  }
}

function readStoredRuntime(): Partial<SiMapLayerSwipeState> {
  const stored = readStoredWidget().runtime ?? {};
  return { ...stored, active: false };
}

function buildInitialState(): SiMapSwipeWidgetState {
  const stored = readStoredWidget();
  const runtime = { ...DEFAULT_SI_MAP_LAYER_SWIPE_STATE, ...readStoredRuntime() };
  return {
    panelOpen: false,
    minimized: false,
    collapsedControls: false,
    fullscreen: false,
    showAoiBoundary: stored.showAoiBoundary ?? true,
    syncColorRamps: stored.syncColorRamps ?? false,
    layerA: { ...DEFAULT_SI_MAP_SWIPE_SIDE, ...(stored.layerA ?? {}), layerId: stored.layerA?.layerId ?? 'NDVI' },
    layerB: {
      ...DEFAULT_SI_MAP_SWIPE_SIDE,
      ...(stored.layerB ?? {}),
      layerId: stored.layerB?.layerId ?? '2_TRUE_COLOR',
    },
    runtime: {
      ...runtime,
      leadingKeys: [SI_MAP_SWIPE_SIDE_A_KEY],
      trailingKeys: [SI_MAP_SWIPE_SIDE_B_KEY],
    },
    liveMapboxLayerIds: [] as string[],
    layersMountRev: 0,
  };
}

type SiMapSwipeStore = SiMapSwipeWidgetState & {
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setMinimized: (v: boolean) => void;
  patchRuntime: (partial: Partial<SiMapLayerSwipeState>) => void;
  patchLayerA: (partial: Partial<SiMapSwipeSideConfig>) => void;
  patchLayerB: (partial: Partial<SiMapSwipeSideConfig>) => void;
  patchWidget: (partial: Partial<Omit<SiMapSwipeWidgetState, 'runtime' | 'layerA' | 'layerB'>>) => void;
  resetSwipePosition: () => void;
  swapLayers: () => void;
  persist: () => void;
  bumpLayersMount: () => void;
  layersMountRev: number;
  liveMapboxLayerIds: string[];
  setLiveMapboxLayerIds: (ids: string[]) => void;
};

export const useSiMapSwipeStore = create<SiMapSwipeStore>((set, get) => ({
  ...buildInitialState(),
  setPanelOpen: open =>
    set(s => {
      const next = { ...s, panelOpen: open };
      if (!open) next.runtime = { ...s.runtime, active: false };
      return next;
    }),
  togglePanel: () => {
    const s = get();
    if (s.panelOpen) {
      set({ panelOpen: false, runtime: { ...s.runtime, active: false } });
    } else {
      set({
        panelOpen: true,
        runtime: {
          ...s.runtime,
          active: true,
          leadingKeys: [SI_MAP_SWIPE_SIDE_A_KEY],
          trailingKeys: [SI_MAP_SWIPE_SIDE_B_KEY],
        },
      });
    }
  },
  setMinimized: v => set({ minimized: v }),
  patchRuntime: partial =>
    set(s => {
      const runtime = { ...s.runtime, ...partial };
      return { runtime };
    }),
  patchLayerA: partial =>
    set(s => ({
      layerA: { ...s.layerA, ...partial },
      layersMountRev: s.layersMountRev + 1,
    })),
  patchLayerB: partial =>
    set(s => ({
      layerB: { ...s.layerB, ...partial },
      layersMountRev: s.layersMountRev + 1,
    })),
  patchWidget: partial => set(s => ({ ...s, ...partial })),
  resetSwipePosition: () =>
    set(s => ({
      runtime: {
        ...s.runtime,
        position: 50,
        spyPosition: { x: 50, y: 50 },
      },
    })),
  swapLayers: () =>
    set(s => ({
      layerA: { ...s.layerB },
      layerB: { ...s.layerA },
      layersMountRev: s.layersMountRev + 1,
      runtime: {
        ...s.runtime,
        leadingKeys: [SI_MAP_SWIPE_SIDE_A_KEY],
        trailingKeys: [SI_MAP_SWIPE_SIDE_B_KEY],
        fullSide: s.runtime.fullSide === 'a' ? 'b' : 'a',
      },
    })),
  persist: () => persistWidget(get()),
  bumpLayersMount: () => set(s => ({ layersMountRev: s.layersMountRev + 1 })),
  setLiveMapboxLayerIds: ids => set({ liveMapboxLayerIds: ids }),
}));
