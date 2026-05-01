import React, { useMemo } from 'react';
import { TileLayer } from 'react-leaflet';
import { getMapboxAccessToken } from '../../../lib/mapboxAccessToken';

export type BasemapType = 'satellite' | 'street' | 'terrain' | 'hybrid' | 'google';

const ESRI_WORLD_IMAGERY_TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

interface BasemapGalleryProps {
  selectedBasemap: BasemapType;
  onSelectBasemap: (basemap: BasemapType) => void;
}

export const BasemapGallery: React.FC<BasemapGalleryProps> = ({ selectedBasemap, onSelectBasemap }) => {
  const mapboxToken = getMapboxAccessToken();
  const mapboxThumb = (stylePath: string) =>
    mapboxToken
      ? `https://api.mapbox.com/styles/v1/mapbox/${stylePath}/tiles/2/1/2?access_token=${mapboxToken}`
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/2/1/2';

  const basemaps: { id: BasemapType; name: string; thumbnailUrl: string }[] = useMemo(
    () => [
    { id: 'satellite', name: 'Satellite (Mapbox)', thumbnailUrl: mapboxThumb('satellite-v9') },
    { id: 'google', name: 'Google Earth', thumbnailUrl: 'https://mt1.google.com/vt/lyrs=s&x=2&y=1&z=2' },
    { id: 'hybrid', name: 'Hybrid', thumbnailUrl: mapboxThumb('satellite-streets-v12') },
    { id: 'street', name: 'OpenStreetMap', thumbnailUrl: 'https://a.tile.openstreetmap.org/2/2/1.png' },
    { id: 'terrain', name: 'Terrain (OpenTopo)', thumbnailUrl: 'https://a.tile.opentopomap.org/2/2/1.png' },
  ],
    [mapboxToken],
  );

  return (
    <div className="tool-panel">
      <div className="tool-section">
        <div className="tool-section-header">Select Basemap</div>
        <div className="basemap-gallery" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          {basemaps.map((b) => (
            <div
              key={b.id}
              className={`sentinel-item-card ${selectedBasemap === b.id ? 'selected' : ''}`}
              onClick={() => onSelectBasemap(b.id)}
              style={{
                cursor: 'pointer',
                border: selectedBasemap === b.id ? '2px solid #2196f3' : '1px solid #eee',
                borderRadius: '8px',
                overflow: 'hidden',
                transition: 'all 0.2s',
                background: 'white',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <div style={{ height: '80px', background: '#f0f0f0', position: 'relative', overflow: 'hidden' }}>
                <img 
                  src={b.thumbnailUrl} 
                  alt={b.name} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {b.id === 'hybrid' && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.2)' }}>
                    <span style={{ color: 'white', fontWeight: 600, fontSize: '12px', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>Labels</span>
                  </div>
                )}

                {selectedBasemap === b.id && (
                  <div style={{ position: 'absolute', top: '5px', right: '5px', background: '#2196f3', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}>
                    <i className="fa-solid fa-check"></i>
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'center', fontSize: '12px', padding: '10px 5px', fontWeight: 500, color: selectedBasemap === b.id ? '#1976d2' : '#333' }}>{b.name}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const BasemapLayer: React.FC<{ selectedBasemap: BasemapType }> = ({ selectedBasemap }) => {
  const mapboxToken = getMapboxAccessToken();
  return (
    <>
      {selectedBasemap === 'satellite' && (
        <TileLayer
          url={
            mapboxToken
              ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`
              : ESRI_WORLD_IMAGERY_TILE
          }
          attribution={mapboxToken ? 'Tiles © Mapbox, © OpenStreetMap contributors' : 'Tiles © Esri'}
          maxZoom={19}
        />
      )}
      {selectedBasemap === 'google' && (
        <TileLayer
          url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
          attribution="&copy; Google"
          maxZoom={20}
        />
      )}
      {selectedBasemap === 'street' && (
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
        />
      )}
      {selectedBasemap === 'terrain' && (
        <TileLayer
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
          attribution='Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
        />
      )}
      {selectedBasemap === 'hybrid' && (
        <>
          <TileLayer
            url={
              mapboxToken
                ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`
                : ESRI_WORLD_IMAGERY_TILE
            }
            attribution={mapboxToken ? 'Tiles © Mapbox, © OpenStreetMap contributors' : 'Tiles © Esri'}
            maxZoom={19}
          />
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="© OpenStreetMap contributors"
            maxZoom={19}
          />
        </>
      )}
    </>
  );
};
