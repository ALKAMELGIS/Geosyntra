import { createContext } from 'react';

/**
 * When non-null, legacy single-AOI Sentinel WMS tiles use this layer id instead of the global active WMS layer.
 * Used by the layer swipe tool (two synced maps: left vs right product).
 */
export const SiWmsSentinelSwipeContext = createContext<string | null>(null);
