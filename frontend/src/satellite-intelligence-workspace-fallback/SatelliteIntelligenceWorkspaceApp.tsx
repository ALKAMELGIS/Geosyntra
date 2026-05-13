import type { FC } from 'react'

/**
 * In-repo fallback for the external Satellite Intelligence Workspace module.
 * Vite resolves `@satellite-intelligence-workspace/*` to the real source on developer machines
 * that have the SIW tree on disk; CI and other environments without that tree get this stub
 * so production builds succeed without bundling the external workspace.
 */
const SatelliteIntelligenceWorkspaceApp: FC = () => {
  return (
    <div style={{ padding: 32, lineHeight: 1.6 }}>
      <h2 style={{ marginTop: 0, fontSize: 22, fontWeight: 700 }}>
        Satellite Intelligence Workspace
      </h2>
      <p style={{ color: '#475569', maxWidth: 680 }}>
        This deployment was built without the external Satellite Intelligence Workspace tree.
        Use the in-app Satellite Intelligence module from the navigation while the workspace is
        configured for this environment.
      </p>
    </div>
  )
}

export default SatelliteIntelligenceWorkspaceApp
