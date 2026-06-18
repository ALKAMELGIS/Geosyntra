import { describe, expect, it } from 'vitest';

import { buildQuickDashboard, extractQuickDashboardFields, exportQuickDashboardCsv } from './siQuickDashboardEngine';

import { filterFeaturesForQuickDashboard } from './siQuickDashboardScope';

import { applyQuickDashboardCrossFilter, toggleQuickDashboardCrossFilter } from './siQuickDashboardCrossFilter';



const features: GeoJSON.Feature[] = [

  {

    type: 'Feature',

    properties: { Height: 12, Type: 'A', Zone: 'North' },

    geometry: { type: 'Point', coordinates: [55.1, 25.1] },

  },

  {

    type: 'Feature',

    properties: { Height: 18, Type: 'B', Zone: 'North' },

    geometry: { type: 'Point', coordinates: [55.2, 25.2] },

  },

  {

    type: 'Feature',

    properties: { Height: 9, Type: 'A', Zone: 'South' },

    geometry: { type: 'Point', coordinates: [54.9, 24.9] },

  },

];



const polygonFeatures: GeoJSON.Feature[] = [

  {

    type: 'Feature',

    properties: { AreaName: 'Field A', Yield: 100 },

    geometry: {

      type: 'Polygon',

      coordinates: [[[55.0, 25.0], [55.01, 25.0], [55.01, 25.01], [55.0, 25.01], [55.0, 25.0]]],

    },

  },

];



describe('siQuickDashboardEngine', () => {

  it('extracts numeric and category fields', () => {

    const fields = extractQuickDashboardFields(features);

    expect(fields.some(f => f.key === 'Height' && f.kind === 'number')).toBe(true);

    expect(fields.some(f => f.key === 'Type' && f.kind === 'category')).toBe(true);

  });



  it('builds dashboard with KPIs, insights, and widgets', () => {

    const dash = buildQuickDashboard(features, ['Height', 'Type', 'Zone']);

    expect(dash.featureCount).toBe(3);

    expect(dash.kpis.length).toBeGreaterThan(3);

    expect(dash.widgets.length).toBeGreaterThan(0);

    expect(dash.insights.length).toBeGreaterThan(0);

    expect(dash.themeId).toBeTruthy();

  });



  it('computes polygon area KPIs when geometry present', () => {

    const dash = buildQuickDashboard(polygonFeatures, ['Yield']);

    expect(dash.totalAreaHa).toBeGreaterThan(0);

    expect(dash.kpis.some(k => k.id === 'area')).toBe(true);

  });



  it('exports CSV snapshot', () => {

    const dash = buildQuickDashboard(features, ['Height', 'Type']);

    const csv = exportQuickDashboardCsv(dash);

    expect(csv).toContain('KPI');

    expect(csv).toContain('Height');

  });

});



describe('siQuickDashboardScope', () => {

  it('filters by viewport bounds', () => {

    const filtered = filterFeaturesForQuickDashboard({

      features,

      mode: 'viewport',

      bounds: { west: 55, south: 25, east: 56, north: 26 },

    });

    expect(filtered.length).toBe(2);

  });

});



describe('siQuickDashboardCrossFilter', () => {

  it('filters features by category and toggles off', () => {

    const f1 = applyQuickDashboardCrossFilter(features, { type: 'equals', field: 'Type', value: 'A' });

    expect(f1.length).toBe(2);

    const cleared = toggleQuickDashboardCrossFilter(

      { type: 'equals', field: 'Type', value: 'A' },

      { type: 'equals', field: 'Type', value: 'A' },

    );

    expect(cleared).toBeNull();

  });

});

