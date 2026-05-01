import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useCommonText } from '../lib/i18n'

const Home = lazy(() => import('../pages/Home'))
const Login = lazy(() => import('../pages/Login'))
const SatelliteIntelligence = lazy(() => import('../pages/satellite/SatelliteIntelligence'))
const SatelliteMultidimensional = lazy(() => import('../pages/satellite/Multidimensional'))
const GisMap = lazy(() => import('../pages/satellite/GisMap'))
const DataEntryFertigationRecords = lazy(() => import('../pages/data-entry/FertigationRecords'))
const DataEntryIrrigation = lazy(() => import('../pages/data-entry/Irrigation'))
const DataEntryHarvest = lazy(() => import('../pages/data-entry/Harvest'))
const DataEntryQHIS = lazy(() => import('../pages/data-entry/QHIS'))
const DataEntryECPH = lazy(() => import('../pages/data-entry/EC'))
const AccountProfile = lazy(() => import('../pages/account/Profile'))
const AccountSettings = lazy(() => import('../pages/account/Settings'))
const MasterGisContent = lazy(() => import('../pages/master/GisContent'))
const AdminUsers = lazy(() => import('../pages/admin/Users'))
const AdminGitHub = lazy(() => import('../pages/admin/GitHubIntegration'))
const DashboardOverview = lazy(() => import('../pages/dashboards/Overview'))
const DashboardPlantAI = lazy(() => import('../pages/dashboards/PlantAI'))
const DashboardAiChatbot = lazy(() => import('../pages/dashboards/AiChatbot'))
const DashboardModel = lazy(() => import('../pages/dashboards/Model'))
const StyleGuide = lazy(() => import('../pages/StyleGuide'))
const UsabilityTest = lazy(() => import('../pages/UsabilityTest'))

export default function AppRoutes() {
  const text = useCommonText()
  return (
    <Suspense fallback={<div style={{ padding: 12 }}>{text.loading}</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/satellite" element={<Navigate to="/satellite/indices" replace />} />
        <Route path="/data/fertigation" element={<Navigate to="/data/fertigation-records" replace />} />
        <Route path="/data/fertigation-records" element={<DataEntryFertigationRecords />} />
        <Route path="/data/irrigation" element={<DataEntryIrrigation />} />
        <Route path="/data/harvest" element={<DataEntryHarvest />} />
        <Route path="/data/qhis" element={<DataEntryQHIS />} />
        <Route path="/data/production" element={<DataEntryHarvest />} />
        <Route path="/data/ec-ph" element={<DataEntryECPH />} />
        <Route path="/satellite/indices" element={<SatelliteIntelligence />} />
        <Route path="/satellite/multidimensional" element={<SatelliteMultidimensional />} />
        <Route path="/satellite/gis" element={<GisMap />} />
        <Route path="/dashboards/overview" element={<DashboardOverview />} />
        <Route path="/dashboards/plant-ai" element={<DashboardPlantAI />} />
        <Route path="/dashboards/ai-chatbot" element={<DashboardAiChatbot />} />
        <Route path="/dashboards/model" element={<DashboardModel />} />
        <Route path="/master/gis-content" element={<MasterGisContent />} />
        <Route path="/master/workflow-settings" element={<AccountSettings />} />
        <Route path="/account/profile" element={<AccountProfile />} />
        <Route path="/account/settings" element={<AccountSettings />} />
        <Route path="/admin/users" element={<AdminUsers />} />
        <Route path="/admin/github" element={<AdminGitHub />} />
        <Route path="/style-guide" element={<StyleGuide />} />
        <Route path="/usability-test" element={<UsabilityTest />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

