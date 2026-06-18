import { describe, expect, it } from 'vitest';
import {
  assessRooftopSolarPotential,
  buildSiMapSunSkySnapshot,
  computeSiMapSolarEvents,
  computeSolsticeComparison,
  estimateClearSkyIrradiance,
  formatSunAzimuthLabel,
  sunGroundPositionFromAzimuth,
} from './siMapSunSkyAnalysis';

describe('siMapSunSkyAnalysis', () => {
  it('computes solar events for mid-latitude summer day', () => {
    const events = computeSiMapSolarEvents('2026-06-21', 40);
    const sunrise = events.find(e => e.kind === 'sunrise');
    const sunset = events.find(e => e.kind === 'sunset');
    const noon = events.find(e => e.kind === 'solarNoon');
    expect(sunrise?.minutes).not.toBeNull();
    expect(sunset?.minutes).not.toBeNull();
    expect(noon?.minutes).not.toBeNull();
    if (sunrise?.minutes != null && sunset?.minutes != null) {
      expect(sunset.minutes).toBeGreaterThan(sunrise.minutes);
    }
  });

  it('builds snapshot with azimuth and irradiance at solar noon', () => {
    const snap = buildSiMapSunSkySnapshot(720, '2026-06-21', 40, -74);
    expect(snap.sun.elevationDeg).toBeGreaterThan(30);
    expect(snap.clearSkyGhiWm2).toBeGreaterThan(200);
    expect(snap.exposureScore).toBeGreaterThan(40);
    expect(formatSunAzimuthLabel(snap.sun.azimuth)).toMatch(/°/);
  });

  it('returns zero irradiance below horizon', () => {
    expect(estimateClearSkyIrradiance(-5).ghi).toBe(0);
    expect(estimateClearSkyIrradiance(45).ghi).toBeGreaterThan(400);
  });

  it('compares summer and winter solstice sun angles', () => {
    const cmp = computeSolsticeComparison(720, 2026, 45);
    expect(cmp.summer.elevationDeg).toBeGreaterThan(cmp.winter.elevationDeg);
    expect(cmp.summerGhi).toBeGreaterThan(cmp.winterGhi);
  });

  it('assesses rooftop potential from exposure', () => {
    const snap = buildSiMapSunSkySnapshot(720, '2026-06-21', 35, 46);
    const roof = assessRooftopSolarPotential(snap, 150, 180);
    expect(roof.peakCapacityKw).toBeGreaterThan(10);
    expect(roof.annualYieldKwh).toBeGreaterThan(0);
    expect(['excellent', 'good', 'fair', 'poor']).toContain(roof.suitability);
  });

  it('projects sun position along azimuth', () => {
    const pt = sunGroundPositionFromAzimuth(0, 0, 90, 10);
    expect(pt.lng).toBeGreaterThan(0);
    expect(Math.abs(pt.lat)).toBeLessThan(1);
  });
});
