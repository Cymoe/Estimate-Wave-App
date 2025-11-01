import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ScrollRestoration } from './components/ScrollRestoration';
import Dashboard from './pages/dashboard/Dashboard';
import { TestAuth } from './components/auth/TestAuth';
import { PriceBook as PriceBookPage } from './pages/PriceBook';
// Invoices removed - contractors use QuickBooks for invoicing
import { EstimateDetail } from './components/estimates/EstimateDetail';
import { EditEstimatePage } from './pages/EditEstimatePage';
import { ShareableEstimate } from './components/estimates/ShareableEstimate';
import { EstimateContractView } from './components/contracts/EstimateContractView';
import { SharedServiceOption } from './pages/SharedServiceOption';
// Packages page removed as part of simplification
import { LandingPage } from './components/LandingPage';
import Projects from './pages/marketing/Projects';
import { BillsList } from './components/bills/BillsList';
import { Callback } from './components/auth/Callback';
import { UserProfile } from './components/settings/UserProfile';
import { PublicProfileView } from './components/settings/PublicProfileView';
import { Toaster } from 'react-hot-toast';
import { ProjectForm, ProjectDetails } from './components/projects';
import LineItemTestPage from './pages/LineItemTestPage';
import { DashboardLayout } from './components/layouts/DashboardLayout';
import MarkdownViewer from './components/docs/MarkdownViewer';
import Templates from './pages/Templates';
import IndustrySettings from './pages/IndustrySettings';
import OrganizationSettings from './pages/OrganizationSettings';
import { Expenses } from './pages/Expenses';
import { VendorDetailPage } from './pages/VendorDetailPage';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { SubcontractorDetailPage } from './pages/SubcontractorDetailPage';
import { TeamMemberDetailPage } from './pages/TeamMemberDetailPage';
import { DebugData } from './pages/DebugData';
import { Work } from './pages/Work';
import { Projects as ProjectsPage } from './pages/Projects';
import { ActivityPage } from './pages/ActivityPage';
import { WhoWeServe } from './pages/WhoWeServe';
import { SalesMode } from './pages/SalesMode';
// import { ServicesPackages } from './pages/ServicesPackages'; // Removed - using line items only
import Marketing from './pages/Marketing';

// Lazy load the Experience page
const Experience = React.lazy(() => import('./pages/Experience').then(module => ({ default: module.Experience })));
const SimpleExperience = React.lazy(() => import('./pages/SimpleExperience').then(module => ({ default: module.SimpleExperience })));
const MinimalPixi = React.lazy(() => import('./pages/MinimalPixi').then(module => ({ default: module.MinimalPixi })));

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
//     import('./utils/testInvoiceActivity'),
//     import('./utils/debugInvoiceActivity'),
//     import('./utils/verifyInvoiceActivityFix'),
//     import('./utils/diagnoseOrganizationIssue'),
//     import('./utils/testActivityWithSelectedOrg'),
//     import('./utils/fixOldInvoiceActivities'),
//     import('./utils/fixAllBadInvoiceActivities'),
//     import('./utils/manuallyFixBadActivities'),
//     import('./utils/debugWhyNotFixing'),
//     import('./utils/directActivityFix'),
//     import('./utils/deleteAndRecreateActivities'),
//     import('./utils/investigateActivityIssue'),
//     import('./utils/auditAllActivityLogging'),
//     import('./utils/createHistoricalActivities'),
//     import('./utils/checkSupabaseData'),
//     import('./utils/fixEverythingNow'),
//     import('./utils/checkActivityStatus'),
//     import('./utils/checkActivityProgress'),
//     import('./utils/fixActivityDescriptions'),
//     import('./utils/fixBadActivityDescriptions'),
//     import('./utils/createTestInvoice'),
//     import('./utils/directInvoiceInsert'),
//     import('./utils/verifyInvoiceActivityLogging'),
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
//     console.log('  - testInvoiceActivity() - Test invoice activity logging');
//     console.log('  - debugInvoiceActivity() - Debug invoice activity issue');
//     console.log('  - verifyInvoiceActivityFix() - Verify invoice activity fix is working');
//     console.log('  - diagnoseOrganizationIssue() - Diagnose user organization issues');
//     console.log('  - testActivityWithSelectedOrg() - Test with your selected organization');
//     console.log('  - fixOldInvoiceActivities() - Fix old invoice activities with improper descriptions');
//     console.log('  - fixAllBadInvoiceActivities() - Aggressively fix ALL bad invoice activities');
//     console.log('  - manuallyFixBadActivities() - Manually fix specific problematic activities');
//     console.log('  - debugWhyNotFixing() - Debug why activities are not getting fixed');
//     console.log('  - investigateActivityIssue() - Deep investigation of why updates fail');
//     console.log('  - deleteAndRecreateActivities() - Delete bad activities and recreate them properly');
//     console.log('  - auditAllActivityLogging() - Audit ALL activity logging across the app');
//     console.log('  - createHistoricalActivities() - Create activities for existing entities');
//     console.log('  - checkWorkPackTemplateActivities() - Check work pack & template activities');
//     console.log('  - testWorkPackAndTemplateLogging() - Test work pack & template logging');
//   });
// }

// Protected route component
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!session || !user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, session, isLoading } = useAuth();

  // If we have a user and session, redirect to dashboard from root
  const renderLanding = () => {
    if (user && session && !isLoading) {
      return <Navigate to="/profit-tracker" replace />;
    }
    return <LandingPage />;
  };

  return (
    <>
      <ScrollRestoration />
      <Routes>
      {/* Public routes */}
      <Route path="/" element={renderLanding()} />
      <Route path="/auth/callback" element={<Callback />} />
      <Route path="/auth/test" element={<TestAuth />} />
      <Route path="/marketing/projects" element={<Projects />} />
      <Route path="/who-we-serve" element={<WhoWeServe />} />
      
      {/* Marketing page with Pixi.js - lazy loaded */}
      <Route path="/marketing" element={
        <React.Suspense fallback={<div className="min-h-screen bg-[#0A0A0A]" />}>
          <Marketing />
        </React.Suspense>
      } />
      
      {/* Experience page with elaborate scroll-driven Pixi.js - lazy loaded */}
      <Route path="/experience" element={
        <React.Suspense fallback={<div className="min-h-screen bg-[#0a0f1f]" />}>
          <Experience />
        </React.Suspense>
      } />
      

      
      {/* Simple scroll test */}
      <Route path="/simple-experience" element={
        <React.Suspense fallback={<div className="min-h-screen bg-blue-900" />}>
          <SimpleExperience />
        </React.Suspense>
      } />
      
      {/* Minimal Pixi + Scroll test */}
      <Route path="/minimal-pixi" element={
        <React.Suspense fallback={<div className="min-h-screen bg-gray-900" />}>
          <MinimalPixi />
        </React.Suspense>
      } />

      {/* Protected routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Navigate to="/profit-tracker" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profit-tracker"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Dashboard />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/vendors/:id"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <VendorDetailPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/subcontractors/:subcontractorId"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <SubcontractorDetailPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/team-members/:teamMemberId"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <TeamMemberDetailPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/templates"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Templates />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      
      {/* Work - Estimates only */}
      <Route
        path="/work"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <Work />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      
      {/* Sales Mode - Field Sales Tool */}
      <Route
        path="/sales-mode"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <SalesMode />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
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
            <DashboardLayout fullWidth={true}>
              <ProjectsPage />
            </DashboardLayout>
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
        path="/estimates/:id"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <EstimateDetail />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/estimates/:id/edit"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <EditEstimatePage />
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
        path="/share/estimate/:id"
        element={<ShareableEstimate />}
      />
      {/* Packages route removed as part of simplification */}
      <Route
        path="/bills"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <BillsList />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <UserProfile />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      
      {/* Chat Management System - redirect to profit-tracker since chat is in sidebar */}
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <Navigate to="/profit-tracker" replace />
          </ProtectedRoute>
        }
      />
      
      {/* Documentation routes - publicly accessible */}
      <Route
        path="/docs/:filename"
        element={<MarkdownViewer />}
      />

      {/* Public Profile Route */}
      <Route
        path="/pro/:username"
        element={<PublicProfileView />}
      />
      
      
      {/* Project routes */}
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <Navigate to="/work/projects" replace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <ProjectDetails />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects/:id/edit"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <ProjectForm />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />

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
              <PriceBookPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/price-book/cost-codes"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <PriceBookPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/price-book/items"
        element={
          <ProtectedRoute>
            <DashboardLayout fullWidth={true}>
              <PriceBookPage />
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
      <Route
        path="/line-item-test"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <LineItemTestPage />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/debug"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <DebugData />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/industries"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <IndustrySettings />
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
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