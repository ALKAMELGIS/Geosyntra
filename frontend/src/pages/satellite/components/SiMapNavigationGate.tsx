import { NavigationControl } from 'react-map-gl/mapbox';

export function SiMapNavigationGate({ isMapLoaded }: { isMapLoaded: boolean }) {
  if (!isMapLoaded) return null;
  return <NavigationControl position="bottom-left" visualizePitch />;
}
