import type { FC } from 'react'

/**
 * In-repo fallback for the external SIW API Token Management page.
 * See SatelliteIntelligenceWorkspaceApp.tsx (same directory) for context on the alias swap.
 */
const SiwApiTokenManagementPage: FC = () => {
  return (
    <div style={{ padding: 32, lineHeight: 1.6 }}>
      <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 700 }}>
        API Token Management
      </h2>
      <p style={{ color: '#475569', maxWidth: 680 }}>
        Token management is provided by the external Satellite Intelligence Workspace tree, which
        is not bundled in this build. Configure the workspace path in vite.config.ts to enable this
        page in development.
      </p>
    </div>
  )
}

export default SiwApiTokenManagementPage
