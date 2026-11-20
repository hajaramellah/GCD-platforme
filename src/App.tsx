import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { Footer } from './components/layout/Footer';

// Public pages
import { Home } from './pages/public/Home';
import { Catalog } from './pages/public/Catalog';
import { Login } from './pages/public/Login';
import { Register } from './pages/public/Register';
import { FaqHelp } from './pages/public/FaqHelp';

// Candidat pages
import { CandidateDashboard } from './pages/candidate/CandidateDashboard';
import { CandidateApplicationForm } from './pages/candidate/CandidateApplicationForm';
import { CandidateApplicationDetail } from './pages/candidate/CandidateApplicationDetail';
import { CandidateCorrectionWorkspace } from './pages/candidate/CandidateCorrectionWorkspace';
import { CandidateInterviewView } from './pages/candidate/CandidateInterviewView';
import { CandidateResultsView } from './pages/candidate/CandidateResultsView';
import { CandidateRegistrationChecklist } from './pages/candidate/CandidateRegistrationChecklist';

// Enseignant-chercheur pages
import { ResearcherDashboard } from './pages/researcher/ResearcherDashboard';
import { ProposeSubjectForm } from './pages/researcher/ProposeSubjectForm';
import { ResearcherApplications } from './pages/researcher/ResearcherApplications';

// Lab Manager pages
import { LabManagerDashboard } from './pages/lab_manager/LabManagerDashboard';

// Administration pages
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminApplicationsQueue } from './pages/admin/AdminApplicationsQueue';
import { AdminPublishResults } from './pages/admin/AdminPublishResults';
import { AdminRegistrationQueue } from './pages/admin/AdminRegistrationQueue';
import { AdminReRegistrationQueue } from './pages/admin/AdminReRegistrationQueue';
import { AdminMessaging } from './pages/admin/AdminMessaging';

// Formation Doctorale pages
import { DoctoralTrainingDashboard } from './pages/doctoral_manager/DoctoralTrainingDashboard';
import { InterviewScheduler } from './pages/doctoral_manager/InterviewScheduler';
import { ReportValidation } from './pages/doctoral_manager/ReportValidation';

// Jury pages
import { JuryEvaluationForm } from './pages/jury/JuryEvaluationForm';
import { JuryDeliberationWorkspace } from './pages/jury/JuryDeliberationWorkspace';

// Doctorant pages
import { DoctorantDashboard } from './pages/doctorant/DoctorantDashboard';

// Directeur de thèse pages
import { SupervisorDashboard } from './pages/supervisor/SupervisorDashboard';

// SuperAdmin / Plateforme GCD pages
import { UserRoleManagement } from './pages/platform_admin/UserRoleManagement';
import { AuditLogViewer } from './pages/platform_admin/AuditLogViewer';
import { PlatformIndicators } from './pages/platform_admin/PlatformIndicators';
import { ProcessCoordination } from './pages/platform_admin/ProcessCoordination';
import { RulesManagement } from './pages/platform_admin/RulesManagement';
import { CampaignManagement } from './pages/platform_admin/CampaignManagement';

import { UserRole } from './types';
import { getDashboardByRole } from './components/layout/Navbar';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { currentUser, currentRole } = useAuth();
  const location = useLocation();

  if (!currentUser) {
    const redirectTarget = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirectTarget}`} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentRole)) {
    return <Navigate to={getDashboardByRole(currentRole)} replace />;
  }

  return <>{children}</>;
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800">
      <Navbar onToggleSidebar={currentUser ? () => setSidebarOpen(!sidebarOpen) : undefined} />

      <div className="flex-1 flex w-full">
        {currentUser && <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />}

        <main className="flex-1 min-w-0 overflow-y-auto">
          {children}
        </main>
      </div>

      <Footer />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/sujets" element={<Catalog />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/activation" element={<Navigate to="/login" replace />} />
            <Route path="/mot-de-passe-oublie" element={<Navigate to="/login" replace />} />
            <Route path="/faq-aide" element={<FaqHelp />} />

            {/* Authenticated Messagerie */}
            <Route
              path="/messagerie"
              element={
                <ProtectedRoute allowedRoles={['administration', 'responsable_gcd', 'responsable_formation', 'candidat', 'doctorant']}>
                  <AdminMessaging />
                </ProtectedRoute>
              }
            />

            {/* Candidat Routes */}
            <Route
              path="/candidat/dashboard"
              element={
                <ProtectedRoute allowedRoles={['candidat']}>
                  <CandidateDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/candidat/postuler"
              element={
                <ProtectedRoute allowedRoles={['candidat']}>
                  <CandidateApplicationForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/candidat/mon-dossier"
              element={
                <ProtectedRoute allowedRoles={['candidat']}>
                  <CandidateApplicationDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/candidat/corrections"
              element={
                <ProtectedRoute allowedRoles={['candidat']}>
                  <CandidateCorrectionWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/candidat/convocation"
              element={
                <ProtectedRoute allowedRoles={['candidat']}>
                  <CandidateInterviewView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/candidat/resultats"
              element={
                <ProtectedRoute allowedRoles={['candidat']}>
                  <CandidateResultsView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/candidat/inscription-administrative"
              element={
                <ProtectedRoute allowedRoles={['candidat']}>
                  <CandidateRegistrationChecklist />
                </ProtectedRoute>
              }
            />

            {/* Chercheur Routes */}
            <Route
              path="/chercheur/dashboard"
              element={
                <ProtectedRoute allowedRoles={['enseignant_chercheur', 'directeur_these']}>
                  <ResearcherDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chercheur/proposer-sujet"
              element={
                <ProtectedRoute allowedRoles={['enseignant_chercheur', 'directeur_these']}>
                  <ProposeSubjectForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/chercheur/candidatures"
              element={
                <ProtectedRoute allowedRoles={['enseignant_chercheur', 'directeur_these']}>
                  <ResearcherApplications />
                </ProtectedRoute>
              }
            />

            {/* Laboratoire Routes */}
            <Route
              path="/labo/dashboard"
              element={
                <ProtectedRoute allowedRoles={['responsable_labo']}>
                  <LabManagerDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/labo/validation-sujets"
              element={
                <ProtectedRoute allowedRoles={['responsable_labo']}>
                  <LabManagerDashboard />
                </ProtectedRoute>
              }
            />

            {/* Administration Routes */}
            <Route
              path="/administration/dashboard"
              element={
                <ProtectedRoute allowedRoles={['administration', 'responsable_gcd']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/administration/dossiers"
              element={
                <ProtectedRoute allowedRoles={['administration', 'responsable_gcd']}>
                  <AdminApplicationsQueue />
                </ProtectedRoute>
              }
            />
            <Route
              path="/administration/publication-resultats"
              element={
                <ProtectedRoute allowedRoles={['administration', 'responsable_gcd']}>
                  <AdminPublishResults />
                </ProtectedRoute>
              }
            />
            <Route
              path="/administration/inscriptions"
              element={
                <ProtectedRoute allowedRoles={['administration', 'responsable_gcd']}>
                  <AdminRegistrationQueue />
                </ProtectedRoute>
              }
            />
            <Route
              path="/administration/reinscriptions"
              element={
                <ProtectedRoute allowedRoles={['administration', 'responsable_gcd']}>
                  <AdminReRegistrationQueue />
                </ProtectedRoute>
              }
            />

            {/* Formation Doctorale Routes */}
            <Route
              path="/formation/dashboard"
              element={
                <ProtectedRoute allowedRoles={['responsable_formation', 'responsable_gcd']}>
                  <DoctoralTrainingDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/formation/entretiens"
              element={
                <ProtectedRoute allowedRoles={['responsable_formation', 'responsable_gcd']}>
                  <InterviewScheduler />
                </ProtectedRoute>
              }
            />
            <Route
              path="/formation/pv-validation"
              element={
                <ProtectedRoute allowedRoles={['responsable_formation', 'responsable_gcd']}>
                  <ReportValidation />
                </ProtectedRoute>
              }
            />

            {/* Jury Routes */}
            <Route
              path="/jury/dashboard"
              element={
                <ProtectedRoute allowedRoles={['jury']}>
                  <JuryDeliberationWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jury/evaluer"
              element={
                <ProtectedRoute allowedRoles={['jury']}>
                  <JuryEvaluationForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/jury/deliberations"
              element={
                <ProtectedRoute allowedRoles={['jury']}>
                  <JuryDeliberationWorkspace />
                </ProtectedRoute>
              }
            />

            {/* Doctorant Routes */}
            <Route
              path="/doctorant/dashboard"
              element={
                <ProtectedRoute allowedRoles={['doctorant']}>
                  <DoctorantDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctorant/reinscription"
              element={
                <ProtectedRoute allowedRoles={['doctorant']}>
                  <DoctorantDashboard />
                </ProtectedRoute>
              }
            />

            {/* Directeur de thèse Routes */}
            <Route
              path="/directeur/dashboard"
              element={
                <ProtectedRoute allowedRoles={['directeur_these', 'enseignant_chercheur']}>
                  <SupervisorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/directeur/doctorants"
              element={
                <ProtectedRoute allowedRoles={['directeur_these', 'enseignant_chercheur']}>
                  <SupervisorDashboard />
                </ProtectedRoute>
              }
            />

            {/* SuperAdmin / GCD Routes */}
            <Route
              path="/superadmin/dashboard"
              element={
                <ProtectedRoute allowedRoles={['responsable_gcd']}>
                  <PlatformIndicators />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/regles"
              element={
                <ProtectedRoute allowedRoles={['responsable_gcd']}>
                  <RulesManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/campagnes"
              element={
                <ProtectedRoute allowedRoles={['responsable_gcd']}>
                  <CampaignManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/utilisateurs"
              element={
                <ProtectedRoute allowedRoles={['responsable_gcd']}>
                  <UserRoleManagement />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/audit-logs"
              element={
                <ProtectedRoute allowedRoles={['responsable_gcd']}>
                  <AuditLogViewer />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/indicateurs"
              element={
                <ProtectedRoute allowedRoles={['responsable_gcd']}>
                  <PlatformIndicators />
                </ProtectedRoute>
              }
            />
            <Route
              path="/superadmin/coordination-processus"
              element={
                <ProtectedRoute allowedRoles={['responsable_gcd']}>
                  <ProcessCoordination />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
