# GIS 3D Globe Integration

## Overview

The GIS Map page uses two rendering modes:

- `2D`: Leaflet renderer for editing, drawing, measuring, popups, and attribute table workflows.
- `3D Globe`: Mapbox GL renderer using `projection: globe` for GPU-accelerated globe navigation and spatial overlays.

The toolbar switches modes without reloading the page. Press `G` for Globe and `F` for 2D.

## Interaction Model

The Globe mode delegates camera and input handling to Mapbox GL:

- Mouse drag pans and rotates the globe.
- Right-drag / rotate gestures control bearing and pitch.
- Scroll wheel and pinch gestures control zoom.
- Touch zoom, rotate, and pitch are enabled.
- Mapbox GL provides inertial movement and momentum.

Camera constraints:

- `minZoom: 0.4`
- `maxZoom: 18`
- `minPitch: 0`
- `maxPitch: 75`

## Layer Rendering

Visible GeoJSON layers are mounted as Mapbox `Source` objects with separate rendering layers:

- Polygon and multipolygon features use `fill`.
- Lines and polygon outlines use `line`.
- Points use `circle`.

Source options use browser-friendly LOD defaults:

- `tolerance: 0.8`
- `buffer: 64`
- `maxzoom: 14`

These settings reduce geometry pressure while preserving interactive quality.

## Safety Boundary

Leaflet APIs are only used while the map is in `2D` mode. Globe mode uses the Mapbox map instance for search and zoom. This prevents stale Leaflet container errors such as:

```text
Cannot read properties of undefined (reading '_leaflet_pos')
```

When switching to Globe, active Leaflet measurement and popup state are cleared.

## API Notes

Projection state:

```ts
type MapProjectionMode = 'globe' | '2d'
```

Mode switching:

```ts
changeProjectionMode('globe')
changeProjectionMode('2d')
```

Keyboard shortcuts:

```text
G = Globe
F = 2D
```

## Performance Guidance

Globe mode is rendered by Mapbox GL using GPU acceleration. For large datasets, keep feature geometry simplified where possible, prefer server-side tiling for very large layers, and avoid loading many high-density GeoJSON files at once on mobile devices.
