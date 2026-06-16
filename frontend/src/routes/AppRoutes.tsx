import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { useSystemSettings } from '../store/SystemSettingsContext'
import DynamicBindPage from '../pages/system/DynamicBindPage'
import Home from '../pages/Home'
import { HomeWizardRedirect } from '../pages/home/HomeWizardRedirect'
import { SAAS_ROUTES } from '../lib/saasRoutes'
import { lazyRoute } from './lazyRoute'
import { OwnerOnlyGate } from '../components/OwnerOnlyGate'
import { ProtectedRoute } from '../components/ProtectedRoute'
const LearnMore = lazy(() => import('../pages/LearnMore'))
const SatelliteMultidimensional = lazyRoute(() => import('../pages/satellite/Multidimensional'))
const DataEntryFertigationRecords = lazy(() => import('../pages/data-entry/FertigationRecords'))
const DataEntryRecipes = lazy(() => import('../pages/data-entry/Recipes'))
const AdminGitHub = lazy(() => import('../pages/admin/GitHubIntegration'))
const ApiIntegrations = lazy(() => import('../pages/settings/ApiIntegrations'))
const GisContent = lazy(() => import('../pages/settings/gis-content/GisContent'))
const GisContentItemPane = lazy(() => import('../pages/settings/gis-content/GisContentItemPane'))
const AdminLayout = lazy(() => import('../pages/admin/AdminLayout'))
const AdminDashboardPage = lazy(() => import('../pages/admin/AdminDashboardPage'))
const AdminUsersPage = lazy(() => import('../pages/admin/AdminUsersPage'))
const AdminTeamPage = lazy(() => import('../pages/admin/AdminTeamPage'))
const AdminRolesPage = lazy(() => import('../pages/admin/AdminRolesPage'))
const AdminAuditPage = lazy(() => import('../pages/admin/AdminAuditPage'))
const AdminSystemTokensPage = lazy(() => import('../pages/admin/AdminSystemTokensPage'))
const JoinTeamPage = lazy(() => import('../pages/auth/JoinTeamPage'))
const StyleGuide = lazy(() => import('../pages/StyleGuide'))
const UsabilityTest = lazy(() => import('../pages/UsabilityTest'))
const VerifyEmailPage = lazy(() => import('../pages/app/auth/VerifyEmailPage'))
const ResetPasswordPage = lazy(() => import('../pages/app/auth/ResetPasswordPage'))
import OAuthCallbackPage from '../pages/app/auth/OAuthCallbackPage'
const ProfilePage = lazy(() => import('../pages/profile/ProfilePage'))

function MasterGisContentItemRedirect() {
  const { itemId } = useParams()
  if (!itemId) return <Navigate to="/settings/gis-content" replace />
  return <Navigate to={`/settings/gis-content/item/${encodeURIComponent(itemId)}`} replace />
}

export default function AppRoutes() {
  const { settings } = useSystemSettings()
  return (
    <Suspense
      fallback={
        <div className="geosyntra-route-loading" role="status" aria-live="polite">
          Loading…
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path={SAAS_ROUTES.authLogin} element={<HomeWizardRedirect authMode="signin" />} />
        <Route path={SAAS_ROUTES.authRegister} element={<HomeWizardRedirect authMode="signup" />} />
        <Route path={SAAS_ROUTES.authVerifyEmail} element={<VerifyEmailPage />} />
        <Route path={SAAS_ROUTES.authResetPassword} element={<ResetPasswordPage />} />
        <Route path={SAAS_ROUTES.authOAuthCallback} element={<OAuthCallbackPage />} />
        <Route path={SAAS_ROUTES.billingPricing} element={<HomeWizardRedirect wizard="pricing" />} />
        <Route path={SAAS_ROUTES.onboardingTrialStart} element={<HomeWizardRedirect wizard="pricing" />} />
        <Route path="/login" element={<HomeWizardRedirect authMode="signin" />} />
        <Route path="/join-team" element={<JoinTeamPage />} />
        <Route path="/learn-more" element={<LearnMore />} />
        <Route path="/satellite" element={<Navigate to="/satellite/indices" replace />} />
        <Route path="/data/fertigation" element={<Navigate to="/data/fertigation-records" replace />} />
        <Route path="/data/fertigation-records" element={<DataEntryFertigationRecords />} />
        <Route path="/data/recipes/:formSlug" element={<DataEntryRecipes />} />
        {/* /satellite/indices — persistent Mapbox instance lives in AppShell (PersistentSatelliteMapHost). */}
        <Route
          path="/satellite/multidimensional"
          element={
            <ProtectedRoute>
              <SatelliteMultidimensional />
            </ProtectedRoute>
          }
        />
        <Route path="/satellite/gis" element={<Navigate to="/satellite/indices" replace />} />
        <Route
          path="/settings/gis-content"
          element={
            <ProtectedRoute>
              <GisContent />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings/gis-content/item/:itemId"
          element={
            <ProtectedRoute>
              <GisContentItemPane />
            </ProtectedRoute>
          }
        />
        <Route path="/master/gis-content" element={<Navigate to="/settings/gis-content" replace />} />
        <Route
          path="/master/gis-content/item/:itemId"
          element={<MasterGisContentItemRedirect />}
        />
        <Route path="/master/dashboard-settings" element={<Navigate to="/" replace />} />
        <Route path="/master/workflow-settings" element={<Navigate to="/" replace />} />
        <Route path="/account/profile" element={<ProfilePage />} />
        <Route path="/account/profile-user-management" element={<Navigate to="/settings/admin/users" replace />} />
        <Route path="/account/settings" element={<Navigate to="/" replace />} />
        <Route path="/admin/users" element={<Navigate to="/settings/admin/users" replace />} />
        <Route path="/admin/system-settings" element={<Navigate to="/" replace />} />
        <Route path="/admin/github" element={<AdminGitHub />} />
        <Route
          path="/settings/api-integrations"
          element={
            <OwnerOnlyGate>
              <ApiIntegrations />
            </OwnerOnlyGate>
          }
        />
        <Route
          path="/settings/admin"
          element={
            <OwnerOnlyGate>
              <AdminLayout />
            </OwnerOnlyGate>
          }
        >
          <Route index element={<Navigate to="users" replace />} />
          <Route path="overview" element={<AdminDashboardPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="team" element={<AdminTeamPage />} />
          <Route path="roles" element={<AdminRolesPage />} />
          <Route path="audit" element={<AdminAuditPage />} />
          <Route
            path="tokens"
            element={
              <OwnerOnlyGate>
                <AdminSystemTokensPage />
              </OwnerOnlyGate>
            }
          />
        </Route>
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
