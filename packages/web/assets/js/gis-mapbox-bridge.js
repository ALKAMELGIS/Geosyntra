/**
 * Thin Mapbox GL bridge — no app logic. Called from Rust/wasm only.
 */
(function () {
  'use strict';

  const maps = new Map();

  function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
  }

  function ensureMapbox() {
    if (typeof mapboxgl === 'undefined') {
      throw new Error('mapbox-gl not loaded');
    }
  }

  function ensureDraw() {
    if (typeof MapboxDraw === 'undefined') {
      throw new Error('mapbox-gl-draw not loaded');
    }
  }

  window.GeoSyntraMapbox = {
    create(containerId, accessToken, optionsJson) {
      ensureMapbox();
      const opts = optionsJson ? JSON.parse(optionsJson) : {};
      mapboxgl.accessToken = accessToken;
      const container = document.getElementById(containerId);
      if (!container) throw new Error('map container not found: ' + containerId);

      const map = new mapboxgl.Map({
        container: containerId,
        style: opts.style || 'mapbox://styles/mapbox/satellite-streets-v12',
        center: opts.center || [0, 20],
        zoom: opts.zoom != null ? opts.zoom : 1.5,
        attributionControl: true,
        preserveDrawingBuffer: true,
      });

      map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120 }), 'bottom-left');

      const mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      let draw = null;

      map.on('load', function () {
        dispatch('geosyntra-map-load', { mapId: mapId });
      });

      map.on('click', function (e) {
        dispatch('geosyntra-map-click', {
          mapId: mapId,
          lng: e.lngLat.lng,
          lat: e.lngLat.lat,
        });
      });

      maps.set(mapId, { map: map, draw: draw, containerId: containerId });
      return mapId;
    },

    destroy(mapId) {
      const entry = maps.get(mapId);
      if (!entry) return;
      if (entry.draw) {
        try { entry.map.removeControl(entry.draw); } catch (_) {}
      }
      entry.map.remove();
      maps.delete(mapId);
    },

    resize(mapId) {
      const entry = maps.get(mapId);
      if (entry) entry.map.resize();
    },

    fitBounds(mapId, west, south, east, north, padding) {
      const entry = maps.get(mapId);
      if (!entry) return;
      entry.map.fitBounds(
        [[west, south], [east, north]],
        { padding: padding || 48, duration: 800, maxZoom: 15 }
      );
    },

    flyTo(mapId, lng, lat, zoom) {
      const entry = maps.get(mapId);
      if (!entry) return;
      entry.map.flyTo({ center: [lng, lat], zoom: zoom != null ? zoom : 12, duration: 900 });
    },

    initDraw(mapId) {
      ensureDraw();
      const entry = maps.get(mapId);
      if (!entry) throw new Error('unknown mapId');
      if (entry.draw) return;
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
        defaultMode: 'simple_select',
      });
      entry.map.addControl(draw);
      entry.draw = draw;
      entry.map.on('draw.create', function () {
        dispatch('geosyntra-draw-change', { mapId: mapId, geojson: draw.getAll() });
      });
      entry.map.on('draw.update', function () {
        dispatch('geosyntra-draw-change', { mapId: mapId, geojson: draw.getAll() });
      });
      entry.map.on('draw.delete', function () {
        dispatch('geosyntra-draw-change', { mapId: mapId, geojson: draw.getAll() });
      });
    },

    setDrawMode(mapId, mode) {
      const entry = maps.get(mapId);
      if (!entry || !entry.draw) return;
      entry.draw.changeMode(mode);
    },

    getDrawGeoJson(mapId) {
      const entry = maps.get(mapId);
      if (!entry || !entry.draw) return JSON.stringify({ type: 'FeatureCollection', features: [] });
      return JSON.stringify(entry.draw.getAll());
    },

    setDrawGeoJson(mapId, geojsonStr) {
      const entry = maps.get(mapId);
      if (!entry || !entry.draw) return;
      entry.draw.set(JSON.parse(geojsonStr));
    },

    addGeoJsonSource(mapId, sourceId, geojsonStr, layerPaintJson) {
      const entry = maps.get(mapId);
      if (!entry) return;
      const map = entry.map;
      const paint = layerPaintJson ? JSON.parse(layerPaintJson) : {};
      if (map.getSource(sourceId)) {
        map.getSource(sourceId).setData(JSON.parse(geojsonStr));
        return;
      }
      map.addSource(sourceId, { type: 'geojson', data: JSON.parse(geojsonStr) });
      map.addLayer({
        id: sourceId + '-fill',
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': paint.fillColor || '#22c55e',
          'fill-opacity': paint.fillOpacity != null ? paint.fillOpacity : 0.25,
        },
        filter: ['==', '$type', 'Polygon'],
      });
      map.addLayer({
        id: sourceId + '-line',
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': paint.lineColor || '#4ade80',
          'line-width': paint.lineWidth != null ? paint.lineWidth : 2,
        },
      });
    },

    removeSource(mapId, sourceId) {
      const entry = maps.get(mapId);
      if (!entry) return;
      const map = entry.map;
      [sourceId + '-fill', sourceId + '-line'].forEach(function (lid) {
        if (map.getLayer(lid)) map.removeLayer(lid);
      });
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    },

    addWmsLayer(mapId, layerId, tileUrl) {
      const entry = maps.get(mapId);
      if (!entry) return;
      const map = entry.map;
      if (map.getSource(layerId)) return;
      map.addSource(layerId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
      });
      map.addLayer({ id: layerId + '-raster', type: 'raster', source: layerId, paint: { 'raster-opacity': 0.85 } });
    },

    setLayerVisibility(mapId, layerId, visible) {
      const entry = maps.get(mapId);
      if (!entry) return;
      const map = entry.map;
      const lid = layerId + '-raster';
      if (map.getLayer(lid)) {
        map.setLayoutProperty(lid, 'visibility', visible ? 'visible' : 'none');
      }
    },
  };
})();
