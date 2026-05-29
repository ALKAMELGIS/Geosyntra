export type SiRainFlowIntensity = 'low' | 'medium' | 'high';

export const SI_RAIN_FLOW_INTENSITY_OPTIONS: { id: SiRainFlowIntensity; label: string }[] = [
  { id: 'low', label: 'Rain low' },
  { id: 'medium', label: 'Rain med.' },
  { id: 'high', label: 'Rain high' },
];

export function siRainFlowIntensityFactor(level: SiRainFlowIntensity): number {
  if (level === 'low') return 0.45;
  if (level === 'high') return 1;
  return 0.75;
}
