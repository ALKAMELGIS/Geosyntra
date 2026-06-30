/**
 * Mapbox GL bridge — Dioxus native GIS (Task 31.0–31.9).
 * Engine: Mapbox GL · default tiles: Esri raster styles.
 */
(function () {
  'use strict';

  var MAPS = new Map();
  var OVERLAYS = new Map();
  var EVENT_PREFIX = 'geosyntra-map-';

  var GLOBE_HOME = { lng: 20, lat: 0, zoom: 1.52, bearing: 0, pitch: 0 };
  var OVERLAY_PREFIX = 'gs-ol-';

  function dispatch(name, detail) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_PREFIX + name, { detail: detail || {} }));
    } catch (_) {
      //
    }
  }

  function ensureMapbox() {
    if (typeof mapboxgl === 'undefined') throw new Error('mapbox-gl not loaded');
  }

  /** Placeholder pk.* — Esri/OSM tiles only; no Mapbox billing/events API. */
  function isPlaceholderToken(token) {
    return !token || String(token).indexOf('gl-init-placeholder') >= 0;
  }

  /** Block Mapbox analytics/session calls (placeholder pk.* cannot reach events.mapbox.com). */
  function disableMapboxTelemetry() {
    try {
      if (mapboxgl.config) {
        mapboxgl.config.EVENTS_URL = null;
      }
      if (typeof mapboxgl.setTelemetryEnabled === 'function') {
        mapboxgl.setTelemetryEnabled(false);
      }
    } catch (_) {
      //
    }
  }

  function configureMapboxGl(accessToken) {
    ensureMapbox();
    var placeholder = isPlaceholderToken(accessToken);
    if (accessToken) mapboxgl.accessToken = accessToken;
    // Always off in browser — Esri basemap + Axum proxy; avoids localhost CORS noise.
    disableMapboxTelemetry();
    return placeholder;
  }

  function blockMapboxVendorRequests(url) {
    if (/events\.mapbox\.com/i.test(url) || /\/map-sessions\//i.test(url)) {
      return { url: 'data:application/octet-stream,' };
    }
    return { url: url };
  }

  function isMapboxVendorUrl(url) {
    try {
      var host = new URL(url).hostname.toLowerCase();
      return host === 'mapbox.com' || host.endsWith('.mapbox.com');
    } catch (_) {
      return false;
    }
  }

  /** Express `siMapTransformRequest` — server injects sk.* via `/api/mapbox-proxy`. */
  function mapTransformRequest(url, resourceType, proxyMode) {
    var blocked = blockMapboxVendorRequests(url);
    if (blocked.url !== url) {
      return blocked;
    }
    if (proxyMode && isMapboxVendorUrl(url)) {
      var origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      return {
        url: origin + '/api/mapbox-proxy?url=' + encodeURIComponent(url),
      };
    }
    return { url: url };
  }

  function parseJson(raw, fallback) {
    if (!raw) return fallback || {};
    if (typeof raw === 'object') return raw;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback || {};
    }
  }

  function newMapId() {
    return 'mbx-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function viewPayload(mapId, map) {
    var c = map.getCenter();
    var projection = 'mercator';
    try {
      var p = map.getProjection && map.getProjection();
      if (p && p.name) projection = String(p.name);
    } catch (_) {
      //
    }
    return {
      mapId: mapId,
      lng: c.lng,
      lat: c.lat,
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      projection: projection,
    };
  }

  function applyGlobeAtmosphere(map) {
    try {
      if (typeof map.setFog === 'function') {
        map.setFog({
          color: 'rgb(2, 4, 8)',
          'high-color': 'rgb(12, 18, 36)',
          'horizon-blend': 0.08,
          'space-color': 'rgb(2, 4, 8)',
          'star-intensity': 0.35,
        });
      }
    } catch (_) {
      //
    }
  }

  function haversineM(a, b) {
    var R = 6371000;
    var dLat = ((b[1] - a[1]) * Math.PI) / 180;
    var dLng = ((b[0] - a[0]) * Math.PI) / 180;
    var lat0 = (a[1] * Math.PI) / 180;
    var lat1 = (b[1] * Math.PI) / 180;
    var h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat0) * Math.cos(lat1) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function lineLengthM(coords) {
    var total = 0;
    for (var i = 0; i < coords.length - 1; i++) {
      total += haversineM(coords[i], coords[i + 1]);
    }
    return total;
  }

  function getEntry(mapId) {
    return MAPS.get(mapId) || null;
  }

  function overlayList(mapId) {
    if (!OVERLAYS.has(mapId)) OVERLAYS.set(mapId, []);
    return OVERLAYS.get(mapId);
  }

  function sourceId(layerId) {
    return OVERLAY_PREFIX + 'src-' + layerId;
  }

  function fillId(layerId) {
    return OVERLAY_PREFIX + 'fill-' + layerId;
  }

  function lineId(layerId) {
    return OVERLAY_PREFIX + 'line-' + layerId;
  }

  function circleId(layerId) {
    return OVERLAY_PREFIX + 'circle-' + layerId;
  }

  function removeOverlayFromMap(map, layerId) {
    [fillId(layerId), lineId(layerId), circleId(layerId)].forEach(function (lid) {
      if (map.getLayer(lid)) map.removeLayer(lid);
    });
    var sid = sourceId(layerId);
    if (map.getSource(sid)) map.removeSource(sid);
  }

  function defaultPaint(kind) {
    if (kind === 'line') {
      return { 'line-color': '#38bdf8', 'line-width': 2, 'line-opacity': 0.9 };
    }
    if (kind === 'circle') {
      return { 'circle-color': '#fbbf24', 'circle-radius': 5, 'circle-opacity': 0.9 };
    }
    return {
      'fill-color': '#38bdf8',
      'fill-opacity': 0.25,
      'fill-outline-color': '#7dd3fc',
    };
  }

  function applyGeoJsonOverlay(map, spec) {
    var sid = sourceId(spec.id);
    removeOverlayFromMap(map, spec.id);
    map.addSource(sid, { type: 'geojson', data: spec.geojson });
    var paint = spec.paint || {};
    var fillPaint = Object.assign(defaultPaint('fill'), paint.fill || paint);
    var linePaint = Object.assign(defaultPaint('line'), paint.line || {});
    map.addLayer({
      id: fillId(spec.id),
      type: 'fill',
      source: sid,
      paint: fillPaint,
      layout: { visibility: spec.visible === false ? 'none' : 'visible' },
      filter: ['==', '$type', 'Polygon'],
    });
    map.addLayer({
      id: lineId(spec.id),
      type: 'line',
      source: sid,
      paint: linePaint,
      layout: { visibility: spec.visible === false ? 'none' : 'visible' },
      filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
    });
    map.addLayer({
      id: circleId(spec.id),
      type: 'circle',
      source: sid,
      paint: Object.assign(defaultPaint('circle'), paint.circle || {}),
      layout: { visibility: spec.visible === false ? 'none' : 'visible' },
      filter: ['==', '$type', 'Point'],
    });
  }

  function applyRasterOverlay(map, spec) {
    var sid = sourceId(spec.id);
    removeOverlayFromMap(map, spec.id);
    map.addSource(sid, {
      type: 'raster',
      tiles: spec.tiles,
      tileSize: 256,
    });
    map.addLayer({
      id: fillId(spec.id),
      type: 'raster',
      source: sid,
      paint: { 'raster-opacity': spec.opacity != null ? spec.opacity : 0.85 },
      layout: { visibility: spec.visible === false ? 'none' : 'visible' },
    });
  }

  function applyOverlaySpec(mapId, spec) {
    var entry = getEntry(mapId);
    if (!entry) return;
    var map = entry.map;
    var run = function () {
      if (spec.kind === 'raster') applyRasterOverlay(map, spec);
      else applyGeoJsonOverlay(map, spec);
    };
    if (map.isStyleLoaded && map.isStyleLoaded()) run();
    else map.once('load', run);
  }

  function reapplyOverlays(mapId) {
    overlayList(mapId).forEach(function (spec) {
      applyOverlaySpec(mapId, spec);
    });
    var entry = getEntry(mapId);
    if (entry && entry.draw && entry.drawGeojson) {
      applyOverlaySpec(mapId, entry.drawGeojson);
    }
  }

  function upsertOverlay(mapId, spec) {
    var list = overlayList(mapId);
    var idx = list.findIndex(function (s) {
      return s.id === spec.id;
    });
    if (idx >= 0) list[idx] = spec;
    else list.push(spec);
    applyOverlaySpec(mapId, spec);
  }

  function attachDrawHandlers(mapId, entry) {
    var map = entry.map;
    entry.drawMode = 'none';
    entry.drawPoints = [];

    map.on('click', function (e) {
      if (entry.drawMode === 'polygon') {
        entry.drawPoints.push([e.lngLat.lng, e.lngLat.lat]);
        var coords = entry.drawPoints.slice();
        if (coords.length >= 3) coords.push(coords[0]);
        var geo = {
          type: 'Feature',
          geometry: {
            type: coords.length >= 4 ? 'Polygon' : 'LineString',
            coordinates: coords.length >= 4 ? [coords] : coords,
          },
          properties: {},
        };
        entry.drawGeojson = {
          id: '__draw__',
          kind: 'geojson',
          geojson: geo,
          visible: true,
          paint: { 'fill-color': '#4ade80', 'fill-opacity': 0.3, 'line-color': '#4ade80' },
        };
        applyOverlaySpec(mapId, entry.drawGeojson);
        dispatch('draw-change', { mapId: mapId, geojson: geo, pointCount: entry.drawPoints.length, mode: 'polygon', points: entry.drawPoints.slice() });
        return;
      }
      if (entry.drawMode === 'line') {
        entry.drawPoints.push([e.lngLat.lng, e.lngLat.lat]);
        var pts = entry.drawPoints.slice();
        var lineGeo = {
          type: 'Feature',
          geometry: {
            type: pts.length >= 2 ? 'LineString' : 'Point',
            coordinates: pts.length >= 2 ? pts : pts[0],
          },
          properties: { name: 'Measure' },
        };
        entry.drawGeojson = {
          id: '__draw__',
          kind: 'geojson',
          geojson: lineGeo,
          visible: true,
          paint: { 'line-color': '#fbbf24', 'line-width': 3 },
        };
        applyOverlaySpec(mapId, entry.drawGeojson);
        var lenM = pts.length >= 2 ? lineLengthM(pts) : 0;
        dispatch('draw-change', {
          mapId: mapId,
          geojson: lineGeo,
          pointCount: entry.drawPoints.length,
          mode: 'line',
          lengthM: lenM,
          points: entry.drawPoints.slice(),
        });
      }
    });
  }

  function attachMapEvents(mapId, map) {
    map.on('load', function () {
      applyGlobeAtmosphere(map);
      reapplyOverlays(mapId);
      dispatch('load', viewPayload(mapId, map));
    });
    map.on('error', function (e) {
      var msg = (e && e.error && e.error.message) || 'Map error';
      dispatch('error', { mapId: mapId, message: String(msg) });
    });
    map.on('moveend', function () {
      dispatch('moveend', viewPayload(mapId, map));
    });
    map.on('mousemove', function (e) {
      dispatch('pointer', { mapId: mapId, lng: e.lngLat.lng, lat: e.lngLat.lat });
    });
    map.on('click', function (e) {
      var entry = getEntry(mapId);
      if (entry && (entry.drawMode === 'polygon' || entry.drawMode === 'line')) return;
      var features = [];
      try {
        features = map.queryRenderedFeatures(e.point, {
          layers: overlayList(mapId)
            .map(function (s) {
              return fillId(s.id);
            })
            .filter(function (id) {
              return map.getLayer(id);
            }),
        });
      } catch (_) {
        //
      }
      dispatch('click', {
        mapId: mapId,
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
        features: features.slice(0, 5).map(function (f) {
          return { layer: f.layer && f.layer.id, properties: f.properties || {} };
        }),
      });
    });
  }

  window.GeoSyntraMapbox = {
    isAvailable: function () {
      return typeof mapboxgl !== 'undefined';
    },

    create: function (containerId, optionsJson) {
      ensureMapbox();
      var opts = parseJson(optionsJson, {});
      var container = document.getElementById(containerId);
      if (!container) throw new Error('map container not found: ' + containerId);

      var token = String(opts.accessToken || opts.token || '').trim();
      var placeholder = configureMapboxGl(token);
      var proxyMode = Boolean(opts.proxyMode);

      var mapOpts = {
        container: containerId,
        style: opts.style || { version: 8, sources: {}, layers: [] },
        center: opts.center || [GLOBE_HOME.lng, GLOBE_HOME.lat],
        zoom: opts.zoom != null ? opts.zoom : GLOBE_HOME.zoom,
        bearing: opts.bearing != null ? opts.bearing : GLOBE_HOME.bearing,
        pitch: opts.pitch != null ? opts.pitch : GLOBE_HOME.pitch,
        projection: opts.projection || 'globe',
        antialias: true,
        attributionControl: false,
        logoPosition: 'bottom-left',
        performanceMetricsCollection: false,
        transformRequest: function (url, resourceType) {
          return mapTransformRequest(url, resourceType, proxyMode);
        },
      };
      if (placeholder) {
        // GL init placeholder — tiles/styles may still use Axum proxy when proxyMode.
      }
      var map = new mapboxgl.Map(mapOpts);
      disableMapboxTelemetry();

      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

      var mapId = newMapId();
      var entry = { map: map, containerId: containerId, projection: opts.projection || 'globe' };
      MAPS.set(mapId, entry);
      OVERLAYS.set(mapId, []);

      attachMapEvents(mapId, map);
      attachDrawHandlers(mapId, entry);

      if (map.isStyleLoaded && map.isStyleLoaded()) {
        applyGlobeAtmosphere(map);
        dispatch('load', viewPayload(mapId, map));
      }

      return mapId;
    },

    destroy: function (mapId) {
      var entry = getEntry(mapId);
      if (!entry) return;
      try {
        entry.map.remove();
      } catch (_) {
        //
      }
      MAPS.delete(mapId);
      OVERLAYS.delete(mapId);
    },

    resize: function (mapId) {
      var entry = getEntry(mapId);
      if (!entry) return;
      try {
        entry.map.resize();
      } catch (_) {
        //
      }
    },

    setStyle: function (mapId, styleJson) {
      var entry = getEntry(mapId);
      if (!entry) return;
      var style = parseJson(styleJson, null);
      if (!style) return;
      entry.map.setStyle(style);
      entry.map.once('style.load', function () {
        applyGlobeAtmosphere(entry.map);
        reapplyOverlays(mapId);
      });
    },

    setProjection: function (mapId, projection) {
      var entry = getEntry(mapId);
      if (!entry || !entry.map.setProjection) return;
      var name = projection === 'mercator' ? 'mercator' : 'globe';
      try {
        entry.map.setProjection(name);
        entry.projection = name;
        if (name === 'globe') applyGlobeAtmosphere(entry.map);
        dispatch('moveend', viewPayload(mapId, entry.map));
      } catch (_) {
        //
      }
    },

    goHome: function (mapId) {
      var entry = getEntry(mapId);
      if (!entry) return;
      entry.map.flyTo({
        center: [GLOBE_HOME.lng, GLOBE_HOME.lat],
        zoom: GLOBE_HOME.zoom,
        bearing: GLOBE_HOME.bearing,
        pitch: GLOBE_HOME.pitch,
        essential: true,
      });
    },

    zoomBy: function (mapId, delta) {
      var entry = getEntry(mapId);
      if (!entry) return;
      entry.map.easeTo({ zoom: entry.map.getZoom() + delta, essential: true });
    },

    flyTo: function (mapId, lng, lat, zoom) {
      var entry = getEntry(mapId);
      if (!entry) return;
      entry.map.flyTo({
        center: [lng, lat],
        zoom: zoom != null ? zoom : entry.map.getZoom(),
        essential: true,
      });
    },

    fitBounds: function (mapId, west, south, east, north, padding) {
      var entry = getEntry(mapId);
      if (!entry) return;
      entry.map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: padding != null ? padding : 48, essential: true },
      );
    },

    getView: function (mapId) {
      var entry = getEntry(mapId);
      if (!entry) return null;
      return viewPayload(mapId, entry.map);
    },

    addGeoJsonLayer: function (mapId, layerId, geojsonJson, paintJson) {
      var geojson = parseJson(geojsonJson, null);
      if (!geojson) return;
      var paint = parseJson(paintJson, {});
      upsertOverlay(mapId, {
        id: layerId,
        kind: 'geojson',
        geojson: geojson,
        paint: paint,
        visible: true,
      });
    },

    setLayerPaint: function (mapId, layerId, paintJson) {
      var list = overlayList(mapId);
      var spec = list.find(function (s) {
        return s.id === layerId;
      });
      if (!spec) return;
      spec.paint = parseJson(paintJson, spec.paint || {});
      applyOverlaySpec(mapId, spec);
    },

    setLayerVisibility: function (mapId, layerId, visible) {
      var entry = getEntry(mapId);
      if (!entry) return;
      var map = entry.map;
      var vis = visible ? 'visible' : 'none';
      [fillId(layerId), lineId(layerId), circleId(layerId)].forEach(function (lid) {
        if (map.getLayer(lid)) map.setLayoutProperty(lid, 'visibility', vis);
      });
      var spec = overlayList(mapId).find(function (s) {
        return s.id === layerId;
      });
      if (spec) spec.visible = visible;
    },

    removeLayer: function (mapId, layerId) {
      var entry = getEntry(mapId);
      if (!entry) return;
      removeOverlayFromMap(entry.map, layerId);
      var list = overlayList(mapId).filter(function (s) {
        return s.id !== layerId;
      });
      OVERLAYS.set(mapId, list);
    },

    addRasterLayer: function (mapId, layerId, tilesJson, opacity) {
      var tiles = parseJson(tilesJson, []);
      if (!Array.isArray(tiles) || !tiles.length) return;
      upsertOverlay(mapId, {
        id: layerId,
        kind: 'raster',
        tiles: tiles,
        opacity: opacity != null ? opacity : 0.85,
        visible: true,
      });
    },

    setDrawMode: function (mapId, mode) {
      var entry = getEntry(mapId);
      if (!entry) return;
      entry.drawMode = mode === 'polygon' || mode === 'line' ? mode : 'none';
      if (entry.drawMode === 'none') entry.drawPoints = [];
      dispatch('draw-mode', { mapId: mapId, mode: entry.drawMode });
    },

    clearDraw: function (mapId) {
      var entry = getEntry(mapId);
      if (!entry) return;
      entry.drawPoints = [];
      entry.drawGeojson = null;
      removeOverlayFromMap(entry.map, '__draw__');
      dispatch('draw-change', { mapId: mapId, geojson: null, pointCount: 0, points: [] });
    },

    getDrawGeoJson: function (mapId) {
      var entry = getEntry(mapId);
      if (!entry || !entry.drawGeojson) return null;
      return entry.drawGeojson.geojson;
    },

    finishDrawPolygon: function (mapId) {
      var entry = getEntry(mapId);
      if (!entry || entry.drawPoints.length < 3) return null;
      var ring = entry.drawPoints.slice();
      ring.push(ring[0]);
      var feature = {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { name: 'AOI' },
      };
      entry.drawMode = 'none';
      entry.drawPoints = [];
      dispatch('draw-change', { mapId: mapId, geojson: feature, pointCount: 0, mode: 'polygon' });
      return feature;
    },

    setSearchMarker: function (mapId, lng, lat, label) {
      var geo = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { name: label || 'Search result' },
      };
      upsertOverlay(mapId, {
        id: '__search__',
        kind: 'geojson',
        geojson: geo,
        visible: true,
        paint: { 'circle-color': '#f472b6', 'circle-radius': 8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' },
      });
    },

    exportMapPng: function (mapId) {
      var entry = getEntry(mapId);
      if (!entry) return null;
      try {
        return entry.map.getCanvas().toDataURL('image/png');
      } catch (_) {
        return null;
      }
    },

    setLayerSwipe: function (mapId, active, positionPct) {
      var entry = getEntry(mapId);
      if (!entry) return;
      ensureSwipeOverlay(entry);
      entry.swipeActive = !!active;
      entry.swipePosition =
        positionPct != null ? Math.min(95, Math.max(5, Number(positionPct))) : 50;
      if (entry.swipeRoot) {
        entry.swipeRoot.style.display = entry.swipeActive ? 'block' : 'none';
      }
      positionSwipeLine(entry);
      updateSwipeShades(entry, entry.map.getContainer().clientWidth);
    },

    setLight: function (mapId, lightJson) {
      var entry = getEntry(mapId);
      if (!entry || !entry.map) return;
      var light = parseJson(lightJson, null);
      if (!light) return;
      try {
        if (typeof entry.map.setLights === 'function') {
          entry.map.setLights({ flat: light });
        } else if (typeof entry.map.setLight === 'function') {
          entry.map.setLight(light);
        }
      } catch (_) {
        //
      }
    },
  };

  function positionSwipeLine(entry) {
    if (!entry.swipeLine || !entry.map) return;
    var mapEl = entry.map.getContainer();
    var pct = entry.swipePosition != null ? entry.swipePosition : 50;
    var x = (mapEl.clientWidth * pct) / 100;
    entry.swipeLine.style.left = x + 'px';
    updateSwipeShades(entry, mapEl.clientWidth);
  }

  function ensureSwipeOverlay(entry) {
    if (entry.swipeRoot) return entry.swipeRoot;
    var mapEl = entry.map.getContainer();
    var root = document.createElement('div');
    root.className = 'gs-map-swipe-root';
    root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:4;display:none;';
    var shadeL = document.createElement('div');
    shadeL.className = 'gs-map-swipe-shade gs-map-swipe-shade--left';
    var shadeR = document.createElement('div');
    shadeR.className = 'gs-map-swipe-shade gs-map-swipe-shade--right';
    var line = document.createElement('div');
    line.className = 'gs-map-swipe-line';
    line.style.cssText =
      'position:absolute;top:0;bottom:0;width:4px;margin-left:-2px;background:#38bdf8;pointer-events:auto;cursor:ew-resize;box-shadow:0 0 14px rgba(56,189,248,.85);';
    var knob = document.createElement('div');
    knob.className = 'gs-map-swipe-knob';
    knob.style.cssText =
      'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:999px;background:rgba(8,12,22,.92);border:2px solid #38bdf8;display:grid;place-items:center;color:#7dd3fc;font-size:11px;';
    knob.innerHTML = '<i class="fa-solid fa-arrows-left-right"></i>';
    line.appendChild(knob);
    root.appendChild(shadeL);
    root.appendChild(shadeR);
    root.appendChild(line);
    mapEl.appendChild(root);
    entry.swipeRoot = root;
    entry.swipeLine = line;
    entry.swipeShadeL = shadeL;
    entry.swipeShadeR = shadeR;
    entry.swipePosition = 50;

    line.addEventListener('pointerdown', function (e) {
      entry.swipeDragging = true;
      try {
        line.setPointerCapture(e.pointerId);
      } catch (_) {
        //
      }
      e.preventDefault();
    });
    line.addEventListener('pointermove', function (e) {
      if (!entry.swipeDragging) return;
      var box = mapEl.getBoundingClientRect();
      var pct = ((e.clientX - box.left) / box.width) * 100;
      entry.swipePosition = Math.min(95, Math.max(5, pct));
      positionSwipeLine(entry);
      updateSwipeShades(entry, box.width);
    });
    line.addEventListener('pointerup', function (e) {
      entry.swipeDragging = false;
      try {
        line.releasePointerCapture(e.pointerId);
      } catch (_) {
        //
      }
    });
    entry.map.on('resize', function () {
      positionSwipeLine(entry);
      updateSwipeShades(entry, mapEl.clientWidth);
    });
    return root;
  }

  function updateSwipeShades(entry, width) {
    if (!entry.swipeShadeL || !entry.swipeShadeR) return;
    var pct = entry.swipePosition != null ? entry.swipePosition : 50;
    var x = (width * pct) / 100;
    entry.swipeShadeL.style.cssText =
      'position:absolute;top:0;left:0;bottom:0;width:' +
      x +
      'px;background:rgba(8,12,22,.18);pointer-events:none;';
    entry.swipeShadeR.style.cssText =
      'position:absolute;top:0;right:0;bottom:0;left:' +
      x +
      'px;background:rgba(8,12,22,.08);pointer-events:none;';
  }

  if (typeof mapboxgl !== 'undefined') {
    try {
      disableMapboxTelemetry();
    } catch (_) {
      //
    }
  }
})();
