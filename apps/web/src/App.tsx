import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { landingFor, isCaller, isStaff } from './lib/roles';
import { ScrollRestoration } from './components/ScrollRestoration';
import { PriceBook as PriceBookPage } from './pages/PriceBook';
// Invoices removed - contractors use QuickBooks for invoicing
import { EditEstimatePage } from './pages/EditEstimatePage';
import { ShareableEstimate } from './components/estimates/ShareableEstimate';
import { SignoffPage } from './pages/SignoffPage';
import { EstimateContractView } from './components/contracts/EstimateContractView';
import { SharedServiceOption } from './pages/SharedServiceOption';
// Packages page removed as part of simplification
import LeadsLanding from './pages/LeadsLanding';
import ConnectAssistant from './pages/ConnectAssistant';
import OpenInAssistant from './pages/OpenInAssistant';
import { Callback } from './components/auth/Callback';
import { Toaster } from 'react-hot-toast';
import { DashboardLayout } from './components/layouts/DashboardLayout';
import { OpsLayout } from './components/layouts/OpsLayout';
import MarkdownViewer from './components/docs/MarkdownViewer';
import { FEATURES } from './config/features';
import LeadsPage from './pages/LeadsPage';
import LeadMarketPage from './pages/LeadMarketPage';
import CallsPage from './pages/CallsPage';
import RealEstateOpsPage from './pages/RealEstateOpsPage';
import BidsPage from './pages/BidsPage';
import MarketplacePage from './pages/MarketplacePage';
import PlanPage from './pages/PlanPage';
import VaultPage from './pages/VaultPage';
import ReportPage from './pages/ReportPage';
import { PlanGate } from './components/market/plan';
import FundAccountPage from './pages/FundAccountPage';
import OrganizationSettings from './pages/OrganizationSettings';
import { Expenses } from './pages/Expenses';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { Work } from './pages/Work';
import { Projects as ProjectsPage } from './pages/Projects';
import { ActivityPage } from './pages/ActivityPage';
import { WhoWeServe } from './pages/WhoWeServe';
// import { ServicesPackages } from './pages/ServicesPackages'; // Removed - using line items only
import { PrivacyPage, TermsPage } from './pages/Legal';

// Lazy load the Experience page

// Import debugging tools in development
// COMMENTED OUT: These test utilities were running automatically and causing issues
// if (import.meta.env.DEV) {
//   Promise.all([
//     import('./utils/checkRealtimeTables'),
//     import('./utils/debugRealtime'),
//     import('./utils/simpleRealtimeTest'),
//     import('./utils/testSupabaseConnection'),
//     import('./utils/testWebSocket'),
//     import('./utils/quickWebSocketTest'),
//     import('./utils/checkActivityDatabase'),
//     import('./utils/diagnoseOrganizationIssue'),
//     import('./utils/testActivityWithSelectedOrg'),
//     import('./utils/manuallyFixBadActivities'),
//     import('./utils/debugWhyNotFixing'),
//     import('./utils/directActivityFix'),
//     import('./utils/deleteAndRecreateActivities'),
//     import('./utils/investigateActivityIssue'),
//     import('./utils/createHistoricalActivities'),
//     import('./utils/checkSupabaseData'),
//     import('./utils/checkActivityStatus'),
//     import('./utils/checkActivityProgress'),
//     import('./utils/fixActivityDescriptions'),
//     import('./utils/fixBadActivityDescriptions'),
//     import('./utils/testRawActivityCreation'),
//     import('./utils/checkWorkPackTemplateActivities'),
//     import('./utils/testWorkPackAndTemplateLogging')
//   ]).then(() => {
//     console.log('🔧 Real-time debugging tools loaded:');
//     console.log('  - debugRealtime() - Comprehensive connection test');
//     console.log('  - checkRealtimeTables() - List real-time tables');
//     console.log('  - simpleRealtimeTest() - Simple isolated real-time test');
//     console.log('  - testSupabaseConnection() - Test basic Supabase connection');
//     console.log('  - testWebSocket() - Test WebSocket connectivity');
//     console.log('  - quickWebSocketTest() - Quick WebSocket diagnostic');
//     console.log('  - checkActivityDatabase() - Check activity logging state');
//     console.log('  - diagnoseOrganizationIssue() - Diagnose user organization issues');
//     console.log('  - testActivityWithSelectedOrg() - Test with your selected organization');
//     console.log('  - manuallyFixBadActivities() - Manually fix specific problematic activities');
//     console.log('  - debugWhyNotFixing() - Debug why activities are not getting fixed');
//     console.log('  - investigateActivityIssue() - Deep investigation of why updates fail');
//     console.log('  - deleteAndRecreateActivities() - Delete bad activities and recreate them properly');
//     console.log('  - createHistoricalActivities() - Create activities for existing entities');
//     console.log('  - checkWorkPackTemplateActivities() - Check work pack & template activities');
//     console.log('  - testWorkPackAndTemplateLogging() - Test work pack & template logging');
//   });
// }

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!session || !user) {
    // Remember where they were going, so sign-in brings them back to it.
    const here = `${location.pathname}${location.search}`;
    return <Navigate to={here === '/' ? '/' : `/?next=${encodeURIComponent(here)}`} replace />;
  }

  // Staff have no company of their own: Ops is their whole app (and Calls, to make calls).
  if (user.role === 'staff' && !user.organizationId && !location.pathname.startsWith('/ops') && location.pathname !== '/calls') {
    return <Navigate to="/ops" replace />;
  }
  // Callers: the Calls page is all there is.
  if (user.role === 'caller' && !user.organizationId && location.pathname !== '/calls') {
    return <Navigate to="/calls" replace />;
  }

  return <>{children}</>;
}

/** Pages for Tolliver staff only. Everyone else lands back on their dashboard. */
function StaffRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <ProtectedRoute>
      {isStaff(user) ? <>{children}</> : <Navigate to="/profit-tracker" replace />}
    </ProtectedRoute>
  );
}

/** The Calls page: Tolliver callers, and staff and the owner. */
function CallerRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <ProtectedRoute>
      {isCaller(user) ? <>{children}</> : <Navigate to="/profit-tracker" replace />}
    </ProtectedRoute>
  );
}

/** The signed-in home: the place they were headed (?next=), else Ops for staff and the owner, the company for everyone else. */
function HomeRedirect() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  return <Navigate to={landingFor(user, params.get('next'))} replace />;
}

/** The old Ops address, with its query string (the blue + button's ?new=lead). */
function LeadMarketRedirect() {
  const location = useLocation();
  return <Navigate to={`/ops${location.search}`} replace />;
}

/** Old edit links open the project page instead. */
function ProjectEditRedirect() {
  const { id } = useParams();
  return <Navigate to={`/projects/${id}`} replace />;
}

function AppRoutes() {
  const { user, session, isLoading } = useAuth();

  // If we have a user and session, redirect to dashboard from root
  const renderLanding = () => {
    if (user && session && !isLoading) {
      return <HomeRedirect />;
    }
    return <LeadsLanding />;
  };

  return (
    <>
      <ScrollRestoration />
      <Routes>
      {/* Public routes */}
      <Route path="/" element={renderLanding()} />
      <Route path="/apply" element={user && session && !isLoading ? <HomeRedirect /> : <LeadsLanding scrollTo="apply" />} />
      <Route path="/auth/callback" element={<Callback />} />
      <Route path="/who-we-serve" element={<WhoWeServe />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      
      
      

      

      {/* Protected routes */}
      {/* Claude or ChatGPT asking to connect: the person approves it here. */}
      <Route
        path="/connect"
        element={
          <ProtectedRoute>
            <ConnectAssistant />
          </ProtectedRoute>
        }
      />
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <HomeRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <HomeRedirect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <LeadsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bids"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <BidsPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vault"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <VaultPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/report"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <ReportPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/plan"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <PlanPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/marketplace"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <MarketplacePage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      {/* The platform side: its own frame, nothing of a company's in it. */}
      <Route
        path="/ops"
        element={
          <StaffRoute>
            <OpsLayout>
              <LeadMarketPage />
            </OpsLayout>
          </StaffRoute>
        }
      />
      <Route
        path="/ops/real-estate"
        element={
          <StaffRoute>
            <OpsLayout>
              <RealEstateOpsPage />
            </OpsLayout>
          </StaffRoute>
        }
      />
      <Route
        path="/calls"
        element={
          <CallerRoute>
            <OpsLayout>
              <CallsPage />
            </OpsLayout>
          </CallerRoute>
        }
      />
      <Route path="/lead-market" element={<LeadMarketRedirect />} />
      
      {/* The estimates list; /estimates/:id opens one estimate in a drawer over it.
          One layout route, so opening and closing an estimate keeps the list in place. */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <PlanGate><Work /></PlanGate>
            </DashboardLayout>
          </ProtectedRoute>
        }
      >
        <Route path="/work" element={null} />
        <Route path="/estimates/:id" element={null} />
      </Route>
      
      {/* Sales Mode was removed; old links go to estimates. */}
      <Route path="/sales-mode" element={<Navigate to="/work" replace />} />
      <Route
        path="/work/estimates"
        element={
          <ProtectedRoute>
            <Navigate to="/work" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/work/projects"
        element={
          <ProtectedRoute>
            <Navigate to="/projects" replace />
          </ProtectedRoute>
        }
      />
      
      {/* Projects - Standalone page */}
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            {FEATURES.projects ? (
              <DashboardLayout fullWidth={true}>
                <PlanGate><ProjectsPage /></PlanGate>
              </DashboardLayout>
            ) : (
              <HomeRedirect />
            )}
          </ProtectedRoute>
        }
      />
      
      {/* Activity Log */}
      <Route
        path="/activity"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <ActivityPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      
      {/* Public shareable service option route - no auth required */}
      <Route
        path="/share/service-option/:encodedConfig"
        element={<SharedServiceOption />}
      />
      
      {/* Estimate routes */}
      <Route
        path="/estimates"
        element={
          <ProtectedRoute>
            <Navigate to="/work/estimates" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/estimates/:id/edit"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <PlanGate><EditEstimatePage /></PlanGate>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/estimates/:id/contract"
        element={
          <ProtectedRoute>
            <EstimateContractView />
          </ProtectedRoute>
        }
      />
      {/* Public shareable estimate route - no auth required */}
      <Route
        path="/share/estimate/:token"
        element={<ShareableEstimate />}
      />
      {/* Public page where a client signs a change order or the affidavit - no auth required */}
      <Route path="/share/signoff/:token" element={<SignoffPage />} />
      {/* Public page a company pays through to load its lead balance - no auth required */}
      <Route path="/fund/:token" element={<FundAccountPage />} />
      {/* "Open it in Claude / ChatGPT" from a lead alert. */}
      <Route path="/open/:app/:leadId" element={<OpenInAssistant />} />
      {/* Packages route removed as part of simplification */}
      {/* The profile page was removed; old links land in Company settings. */}
      <Route path="/profile" element={<Navigate to="/settings/organization" replace />} />
      
      {/* Documentation routes - publicly accessible */}
      <Route
        path="/docs/:filename"
        element={<MarkdownViewer />}
      />

      
      
      <Route
        path="/projects/:id"
        element={
          <ProtectedRoute>
            {FEATURES.projects ? (
              <DashboardLayout fullWidth={true}>
                <PlanGate><ProjectsPage /></PlanGate>
              </DashboardLayout>
            ) : (
              <HomeRedirect />
            )}
          </ProtectedRoute>
        }
      />
      <Route path="/projects/:id/edit" element={<ProjectEditRedirect />} />

      {/* Client routes */}
      <Route
        path="/clients/:clientId"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <ClientDetailPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

      {/* Unified Price Book routes */}
      <Route
        path="/price-book"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <PlanGate><PriceBookPage /></PlanGate>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/price-book/cost-codes"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <PlanGate><PriceBookPage /></PlanGate>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/price-book/items"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <PlanGate><PriceBookPage /></PlanGate>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      
      {/* Services & Packages route */}
      <Route
        path="/services"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <Navigate to="/price-book/items" replace />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      
      {/* Legacy route redirects to unified Price Book */}
      <Route
        path="/items"
        element={<Navigate to="/price-book/items" replace />}
      />
      <Route
        path="/cost-codes"
        element={<Navigate to="/price-book/cost-codes" replace />}
      />
      {/* The old full-page trade settings: trades now live in Company settings. */}
      <Route path="/settings/industries" element={<Navigate to="/settings/organization?tab=trades" replace />} />
      <Route
        path="/settings/organization"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <OrganizationSettings />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/expenses"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Expenses />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
    </>
  );
}

function App() {
  return (
    <BrowserRouter future={{ 
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}>
      <AuthProvider>
        <ThemeProvider>
          <Toaster position="top-right" />
          <AppRoutes />
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;