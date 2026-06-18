/**
 * Thin Mapbox GL bridge — no app logic. Called from Rust/wasm only.
 */
(function () {
  'use strict';

  const maps = new Map();
  const PROXY_INIT_TOKEN = 'pk.geosyntra.gl-init-placeholder';

  function messageOf(err) {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    var maybe = err && err.message;
    return typeof maybe === 'string' ? maybe : '';
  }

  /** Recoverable Mapbox worker/style errors — Express parity (mapboxWorkerErrorGuard.ts). */
  function isRecoverableMapboxError(err) {
    var msg = messageOf(err);
    if (!msg) return false;
    return (
      msg.indexOf("Can't serialize object of unregistered class") !== -1 ||
      msg.indexOf('unregistered class "DOMException"') !== -1 ||
      msg.indexOf('errorCb is not a function') !== -1 ||
      msg.indexOf('Unimplemented type:') !== -1 ||
      msg.indexOf('unknown command 0') !== -1 ||
      msg.toLowerCase().indexOf('style is not done loading') !== -1 ||
      msg.toLowerCase().indexOf('style is not loaded') !== -1
    );
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(
      'error',
      function (event) {
        var candidate = event.error || event.message;
        if (!isRecoverableMapboxError(candidate)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
    window.addEventListener(
      'unhandledrejection',
      function (event) {
        if (!isRecoverableMapboxError(event.reason)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true,
    );
  }

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

  function isMapboxVendorUrl(url) {
    try {
      var host = new URL(url).hostname.toLowerCase();
      return host === 'mapbox.com' || host.endsWith('.mapbox.com');
    } catch (_) {
      return false;
    }
  }

  function resolveMapboxProxyUrl(upstreamUrl) {
    var origin =
      (typeof window !== 'undefined' && window.location && window.location.origin) ||
      'http://127.0.0.1:8080';
    return origin + '/api/mapbox-proxy?url=' + encodeURIComponent(upstreamUrl);
  }

  window.GeoSyntraMapbox = {
    create(containerId, accessToken, optionsJson) {
      ensureMapbox();
      var opts = optionsJson ? JSON.parse(optionsJson) : {};
      var useProxy = opts.proxyMode === true;
      var glToken = useProxy ? PROXY_INIT_TOKEN : accessToken;
      mapboxgl.accessToken = glToken || accessToken || PROXY_INIT_TOKEN;
      var container = document.getElementById(containerId);
      if (!container) throw new Error('map container not found: ' + containerId);

      var mapOptions = {
        container: containerId,
        style: opts.style || 'mapbox://styles/mapbox/satellite-streets-v12',
        center: opts.center || [0, 20],
        zoom: opts.zoom != null ? opts.zoom : 1.5,
        attributionControl: true,
        preserveDrawingBuffer: true,
      };

      if (useProxy) {
        mapOptions.transformRequest = function (url, _resourceType) {
          if (url.indexOf('events.mapbox.com') !== -1) {
            return { url: '' };
          }
          if (isMapboxVendorUrl(url)) {
            return { url: resolveMapboxProxyUrl(url) };
          }
          return { url: url };
        };
      }

      var map = new mapboxgl.Map(mapOptions);

      map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
      map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120 }), 'bottom-left');

      var mapId = 'map-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      var draw = null;

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
      var entry = maps.get(mapId);
      if (!entry) return;
      if (entry.draw) {
        try { entry.map.removeControl(entry.draw); } catch (_) {}
      }
      entry.map.remove();
      maps.delete(mapId);
    },

    resize(mapId) {
      var entry = maps.get(mapId);
      if (entry) entry.map.resize();
    },

    fitBounds(mapId, west, south, east, north, padding) {
      var entry = maps.get(mapId);
      if (!entry) return;
      entry.map.fitBounds(
        [[west, south], [east, north]],
        { padding: padding || 48, duration: 800, maxZoom: 15 }
      );
    },

    flyTo(mapId, lng, lat, zoom) {
      var entry = maps.get(mapId);
      if (!entry) return;
      entry.map.flyTo({ center: [lng, lat], zoom: zoom != null ? zoom : 12, duration: 900 });
    },

    initDraw(mapId) {
      ensureDraw();
      var entry = maps.get(mapId);
      if (!entry) throw new Error('unknown mapId');
      if (entry.draw) return;
      var draw = new MapboxDraw({
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
      var entry = maps.get(mapId);
      if (!entry || !entry.draw) return;
      entry.draw.changeMode(mode);
    },

    getDrawGeoJson(mapId) {
      var entry = maps.get(mapId);
      if (!entry || !entry.draw) return JSON.stringify({ type: 'FeatureCollection', features: [] });
      return JSON.stringify(entry.draw.getAll());
    },

    setDrawGeoJson(mapId, geojsonStr) {
      var entry = maps.get(mapId);
      if (!entry || !entry.draw) return;
      entry.draw.set(JSON.parse(geojsonStr));
    },

    addGeoJsonSource(mapId, sourceId, geojsonStr, layerPaintJson) {
      var entry = maps.get(mapId);
      if (!entry) return;
      var map = entry.map;
      var paint = layerPaintJson ? JSON.parse(layerPaintJson) : {};
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
      var entry = maps.get(mapId);
      if (!entry) return;
      var map = entry.map;
      [sourceId + '-fill', sourceId + '-line'].forEach(function (lid) {
        if (map.getLayer(lid)) map.removeLayer(lid);
      });
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    },

    addWmsLayer(mapId, layerId, tileUrl) {
      var entry = maps.get(mapId);
      if (!entry) return;
      var map = entry.map;
      if (map.getSource(layerId)) return;
      map.addSource(layerId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
      });
      map.addLayer({ id: layerId + '-raster', type: 'raster', source: layerId, paint: { 'raster-opacity': 0.85 } });
    },

    setLayerVisibility(mapId, layerId, visible) {
      var entry = maps.get(mapId);
      if (!entry) return;
      var map = entry.map;
      var lid = layerId + '-raster';
      if (map.getLayer(lid)) {
        map.setLayoutProperty(lid, 'visibility', visible ? 'visible' : 'none');
      }
    },
  };
})();
