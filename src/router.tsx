import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import HrLayout from "./pages/hr/HrLayout";
import OverviewPage from "./pages/hr/OverviewPage";
import JobsPage from "./pages/hr/JobsPage";
import JobDetailPage from "./pages/hr/JobDetailPage";
import CandidatesPage from "./pages/hr/CandidatesPage";
import InterviewsPage from "./pages/hr/InterviewsPage";
import DecisionsPage from "./pages/hr/DecisionsPage";
import CandidateLayout from "./pages/candidate/CandidateLayout";
import DashboardPage from "./pages/candidate/DashboardPage";
import ApplyPage from "./pages/candidate/ApplyPage";
import InterviewPage from "./pages/candidate/InterviewPage";
import { RequireRole } from "./components/RequireRole";

export const routers = [
  {
    path: "/",
    name: "home",
    element: <Index />,
  },
  {
    path: "/login",
    name: "login",
    element: <LoginPage />,
  },
  {
    path: "/signup",
    name: "signup",
    element: <SignupPage />,
  },
  {
    path: "/hr",
    name: "hr",
    element: (
      <RequireRole role="hr">
        <HrLayout />
      </RequireRole>
    ),
    children: [
      { index: true, name: "hr-overview", element: <OverviewPage /> },
      { path: "jobs", name: "hr-jobs", element: <JobsPage /> },
      { path: "jobs/:jobId", name: "hr-job-detail", element: <JobDetailPage /> },
      { path: "candidates", name: "hr-candidates", element: <CandidatesPage /> },
      { path: "interviews", name: "hr-interviews", element: <InterviewsPage /> },
      { path: "decisions", name: "hr-decisions", element: <DecisionsPage /> },
    ],
  },
  {
    path: "/candidate",
    name: "candidate",
    element: (
      <RequireRole role="candidate">
        <CandidateLayout />
      </RequireRole>
    ),
    children: [
      { index: true, name: "candidate-dashboard", element: <DashboardPage /> },
      { path: "apply", name: "candidate-apply", element: <ApplyPage /> },
      { path: "interview", name: "candidate-interview", element: <InterviewPage /> },
    ],
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
