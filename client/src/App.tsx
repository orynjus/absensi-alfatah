import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import AdminDashboard from "@/pages/admin-dashboard";
import StudentDashboard from "@/pages/student-dashboard";
import TeacherDashboard from "@/pages/teacher-dashboard";
import HomeroomDashboard from "@/pages/homeroom-dashboard";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";

function ProtectedRoute({ component: Component, roles }: { component: React.ComponentType; roles: string[] }) {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/");
    }
    if (!isLoading && user && !roles.includes(user.role)) {
      setLocation("/");
    }
  }, [user, isLoading, setLocation, roles]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user || !roles.includes(user.role)) return null;

  return <Component />;
}

function AutoRedirect() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      if (user.role === "admin") setLocation("/admin");
      else if (user.role === "siswa") setLocation("/siswa");
      else if (user.role === "guru") setLocation("/guru");
      else if (user.role === "wali_kelas") setLocation("/wali-kelas");
    }
  }, [user, isLoading, setLocation]);

  return <LandingPage />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={AutoRedirect} />
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} roles={["admin"]} />
      </Route>
      <Route path="/siswa">
        <ProtectedRoute component={StudentDashboard} roles={["siswa"]} />
      </Route>
      <Route path="/guru">
        <ProtectedRoute component={TeacherDashboard} roles={["guru"]} />
      </Route>
      <Route path="/wali-kelas">
        <ProtectedRoute component={HomeroomDashboard} roles={["wali_kelas"]} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
