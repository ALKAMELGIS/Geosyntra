/**
 * Runtime platform health — confirms persistent storage is outside deploy artifacts.
 */
export function registerPlatformRoutes(app, paths, layout) {
  app.get('/api/platform/health', (_req, res) => {
    res.json({
      ok: true,
      environment: paths.env,
      storage: layout.storage,
      dataDirectory: paths.dataDir,
      dataOutsideRepository: !layout.dataInRepo,
      sqlite: Boolean(paths.userDb),
      persistent: {
        userDatabase: paths.userDb,
        apiVault: paths.apiSecretsFile,
        userProfiles: paths.userProfilesFile,
      },
      warnings: layout.dataInRepo
        ? ['GEOSYNTRA_DATA_DIR is inside the repository — configure an external volume for production.']
        : [],
    })
  })

  app.get('/api/platform/runtime', (_req, res) => {
    res.json({
      environment: paths.env,
      isProduction: paths.isProduction,
      isStaging: paths.isStaging,
    })
  })
}
