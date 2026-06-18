import { useRef } from 'react';
import { Marker } from 'react-map-gl/mapbox';
import { useSiMapFeaturePopupClamp } from '../hooks/useSiMapFeaturePopupClamp';
import { extractSiMapFeatureName } from '../utils/siMapFeaturePopupUtils';
import { SiMapFeaturePopup, type SiMapFeaturePopupProps } from './SiMapFeaturePopup';

export type SiMapFeaturePopupAnchorProps = Omit<
  SiMapFeaturePopupProps,
  'popupRef' | 'layerName' | 'featureName'
> & {
  popIndex?: number;
  layerName: string;
  featureProperties?: Record<string, unknown> | null;
  mapContainerRef: React.RefObject<HTMLElement | null>;
};

export function SiMapFeaturePopupAnchor({
  popIndex = 0,
  layerName,
  featureProperties,
  mapContainerRef,
  lng,
  lat,
  collapsed,
  pinned,
  variant = 'map',
  ...popupProps
}: SiMapFeaturePopupAnchorProps) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  useSiMapFeaturePopupClamp(popupRef, mapContainerRef, [lng, lat, collapsed, pinned, layerName]);

  const featureName = extractSiMapFeatureName(featureProperties ?? undefined);
  const offsetX = ((popIndex * 47) % 160) - 80;
  const offsetY = 6 - (popIndex % 7) * 11;

  return (
    <Marker
      className="si-geo-ai-inspect-marker"
      longitude={lng}
      latitude={lat}
      anchor="bottom"
      offset={[offsetX, offsetY]}
    >
      <SiMapFeaturePopup
        {...popupProps}
        popupRef={popupRef}
        variant={variant}
        layerName={layerName}
        featureName={featureName}
        lng={lng}
        lat={lat}
        pinned={pinned}
        collapsed={collapsed}
      />
    </Marker>
  );
}
