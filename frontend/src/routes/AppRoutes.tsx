import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useSystemSettings } from '../store/SystemSettingsContext'
import DynamicBindPage from '../pages/system/DynamicBindPage'
import Home from '../pages/Home'
import Login from '../pages/Login'
const LearnMore = lazy(() => import('../pages/LearnMore'))
const SatelliteIntelligence = lazy(() => import('../pages/satellite/SatelliteIntelligence'))
const SatelliteMultidimensional = lazy(() => import('../pages/satellite/Multidimensional'))
const GisMap = lazy(() => import('../pages/satellite/GisMap'))
const DataEntryFertigationRecords = lazy(() => import('../pages/data-entry/FertigationRecords'))
const DataEntryRecipes = lazy(() => import('../pages/data-entry/Recipes'))
const MasterGisContent = lazy(() => import('../pages/master/GisContent'))
const AdminUsers = lazy(() => import('../pages/admin/Users'))
const AdminGitHub = lazy(() => import('../pages/admin/GitHubIntegration'))
const StyleGuide = lazy(() => import('../pages/StyleGuide'))
const UsabilityTest = lazy(() => import('../pages/UsabilityTest'))
const SystemSettings = lazy(() => import('../pages/admin/SystemSettings'))

export default function AppRoutes() {
  const { settings } = useSystemSettings()
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/learn-more" element={<LearnMore />} />
        <Route path="/satellite" element={<Navigate to="/satellite/indices" replace />} />
        <Route path="/data/fertigation" element={<Navigate to="/data/fertigation-records" replace />} />
        <Route path="/data/fertigation-records" element={<DataEntryFertigationRecords />} />
        <Route path="/data/recipes/:formSlug" element={<DataEntryRecipes />} />
        <Route path="/satellite/indices" element={<SatelliteIntelligence />} />
        <Route path="/satellite/multidimensional" element={<SatelliteMultidimensional />} />
        <Route path="/satellite/gis" element={<GisMap />} />
        <Route path="/master/gis-content" element={<MasterGisContent />} />
        <Route path="/master/dashboard-settings" element={<Navigate to="/" replace />} />
        <Route path="/master/workflow-settings" element={<Navigate to="/" replace />} />
        <Route path="/account/profile" element={<Navigate to="/" replace />} />
        <Route path="/account/profile-user-management" element={<Navigate to="/" replace />} />
        <Route path="/account/settings" element={<Navigate to="/" replace />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/github" element={<AdminGitHub />} />
        <Route path="/admin/system-settings" element={<SystemSettings />} />
        <Route path="/style-guide" element={<StyleGuide />} />
        <Route path="/usability-test" element={<UsabilityTest />} />
        {settings.customPages
          .filter(p => p.visible && p.path.trim())
          .map(p => (
            <Route
              key={p.id}
              path={p.path.replace(/^\//, '')}
              element={<DynamicBindPage bindTarget={p.bindTarget} title={p.name} />}
            />
          ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
