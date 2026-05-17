import type { ViewState } from 'react-map-gl/mapbox';

const ZERO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 } as const;

/** Normalize view state for secondary MapGL instances (swipe compare pane). */
export function siMapSwipeViewState(
  viewState: ViewState & { padding?: ViewState['padding'] },
): ViewState {
  return {
    longitude: viewState.longitude,
    latitude: viewState.latitude,
    zoom: viewState.zoom,
    pitch: viewState.pitch ?? 0,
    bearing: viewState.bearing ?? 0,
    padding: viewState.padding ?? ZERO_PADDING,
  }
}
