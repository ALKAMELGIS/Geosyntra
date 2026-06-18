import type { SiMapCameraSnapshot } from './siMapProjectionTerrain';
import {
  DEFAULT_SI_MAP_WEATHER,
  sanitizeSiMapWeatherSettings,
  type SiMapSceneSlide,
  type SiMapWeatherSettings,
} from './siMapWeatherTypes';

const LS_KEY = 'si-map-scene-slides-v1';

export type SiMapSceneSlidesStore = {
  version: 1;
  activeSlideId: string | null;
  slides: SiMapSceneSlide[];
};

function newSlideId(): string {
  return `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSiMapSceneSlides(): SiMapSceneSlidesStore {
  if (typeof window === 'undefined') {
    return { version: 1, activeSlideId: null, slides: [] };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { version: 1, activeSlideId: null, slides: [] };
    const data = JSON.parse(raw) as Partial<SiMapSceneSlidesStore>;
    const slides = Array.isArray(data.slides)
      ? data.slides
          .filter(s => s && typeof s === 'object' && typeof (s as SiMapSceneSlide).id === 'string')
          .map(s => sanitizeSlide(s as SiMapSceneSlide))
      : [];
    const activeSlideId =
      typeof data.activeSlideId === 'string' && slides.some(s => s.id === data.activeSlideId)
        ? data.activeSlideId
        : null;
    return { version: 1, activeSlideId, slides };
  } catch {
    return { version: 1, activeSlideId: null, slides: [] };
  }
}

export function persistSiMapSceneSlides(store: SiMapSceneSlidesStore): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function sanitizeSlide(s: SiMapSceneSlide): SiMapSceneSlide {
  const cam = s.camera;
  return {
    id: String(s.id),
    title: typeof s.title === 'string' && s.title.trim() ? s.title.trim().slice(0, 80) : 'Scene',
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
    camera: {
      longitude: Number(cam?.longitude) || 0,
      latitude: Number(cam?.latitude) || 0,
      zoom: Number(cam?.zoom) || 2,
      bearing: Number(cam?.bearing) || 0,
      pitch: Number(cam?.pitch) || 0,
    },
    weather: sanitizeSiMapWeatherSettings(s.weather),
    basemapId: typeof s.basemapId === 'string' ? s.basemapId : undefined,
  };
}

export function createSiMapSceneSlide(input: {
  title?: string;
  camera: SiMapCameraSnapshot;
  weather: SiMapWeatherSettings;
  basemapId?: string;
}): SiMapSceneSlide {
  const n = loadSiMapSceneSlides().slides.length + 1;
  return {
    id: newSlideId(),
    title: input.title?.trim() || `Scene ${n}`,
    createdAt: new Date().toISOString(),
    camera: { ...input.camera },
    weather: sanitizeSiMapWeatherSettings(input.weather),
    basemapId: input.basemapId,
  };
}

export function addSiMapSceneSlide(slide: SiMapSceneSlide): SiMapSceneSlidesStore {
  const store = loadSiMapSceneSlides();
  const next = { ...store, slides: [...store.slides, sanitizeSlide(slide)], activeSlideId: slide.id };
  persistSiMapSceneSlides(next);
  return next;
}

export function setActiveSiMapSceneSlide(id: string | null): SiMapSceneSlidesStore {
  const store = loadSiMapSceneSlides();
  const next = {
    ...store,
    activeSlideId: id && store.slides.some(s => s.id === id) ? id : null,
  };
  persistSiMapSceneSlides(next);
  return next;
}

export function removeSiMapSceneSlide(id: string): SiMapSceneSlidesStore {
  const store = loadSiMapSceneSlides();
  const slides = store.slides.filter(s => s.id !== id);
  const activeSlideId = store.activeSlideId === id ? null : store.activeSlideId;
  const next = { ...store, slides, activeSlideId };
  persistSiMapSceneSlides(next);
  return next;
}

export function weatherFromActiveSlide(
  store: SiMapSceneSlidesStore,
): SiMapWeatherSettings {
  const slide = store.slides.find(s => s.id === store.activeSlideId);
  return slide?.weather ?? { ...DEFAULT_SI_MAP_WEATHER };
}

export function exportSiMapSceneSlidesJson(store: SiMapSceneSlidesStore): string {
  return JSON.stringify(store, null, 2);
}

export function importSiMapSceneSlidesJson(raw: string): SiMapSceneSlidesStore | null {
  try {
    const data = JSON.parse(raw) as Partial<SiMapSceneSlidesStore>;
    const slides = Array.isArray(data.slides)
      ? data.slides.map(s => sanitizeSlide(s as SiMapSceneSlide))
      : [];
    const store: SiMapSceneSlidesStore = {
      version: 1,
      activeSlideId:
        typeof data.activeSlideId === 'string' ? data.activeSlideId : slides[0]?.id ?? null,
      slides,
    };
    persistSiMapSceneSlides(store);
    return store;
  } catch {
    return null;
  }
}
