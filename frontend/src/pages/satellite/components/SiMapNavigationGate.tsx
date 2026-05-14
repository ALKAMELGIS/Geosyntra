import { NavigationControl } from 'react-map-gl/mapbox';
import { useSiSwipePeekMap } from './SiSwipePeekMapContext';

/** Single NavigationControl on the interactive map only (hidden on swipe peek clone). */
export function SiMapNavigationGate({ isMapLoaded }: { isMapLoaded: boolean }) {
  const peek = useSiSwipePeekMap();
  if (!isMapLoaded || peek) return null;
  return <NavigationControl position="bottom-left" visualizePitch />;
}
