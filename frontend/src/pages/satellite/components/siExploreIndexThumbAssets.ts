/** Explore Indexes band card — static satellite preview thumbnails. */

import ndviExploreThumbUrl from './assets/ndvi-explore-thumb.png';
import ndwiExploreThumbUrl from './assets/ndwi-explore-thumb.png';
import saviExploreThumbUrl from './assets/savi-explore-thumb.png';
import swirExploreThumbUrl from './assets/swir-explore-thumb.png';
import colorInfraredExploreThumbUrl from './assets/color-infrared-explore-thumb.png';

const EXPLORE_INDEX_STATIC_THUMBS: Readonly<Record<string, string>> = {
  ndvi: ndviExploreThumbUrl,
  ndwi: ndwiExploreThumbUrl,
  'land-water': ndwiExploreThumbUrl,
  savi: saviExploreThumbUrl,
  swir: swirExploreThumbUrl,
  'color-infrared': colorInfraredExploreThumbUrl,
};

export function resolveExploreIndexStaticThumbUrl(bandId: string): string | undefined {
  return EXPLORE_INDEX_STATIC_THUMBS[bandId.toLowerCase()];
}
