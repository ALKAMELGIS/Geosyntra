/**
 * Vite resolves these via `vite.config.ts` → external SIW tree; TS has no path mapping.
 * Stubs keep `tsc` green when that workspace is not on disk.
 */
declare module '@satellite-intelligence-workspace/SatelliteIntelligenceWorkspaceApp' {
  import type { FC } from 'react'
  const SatelliteIntelligenceWorkspaceApp: FC
  export default SatelliteIntelligenceWorkspaceApp
}

declare module '@satellite-intelligence-workspace/SiwApiTokenManagementPage' {
  import type { FC } from 'react'
  const SiwApiTokenManagementPage: FC
  export default SiwApiTokenManagementPage
}
