import { useEffect, useState } from 'react';
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Register from './pages/Register';
import Houses from './pages/Houses';
import Rooms from './pages/Rooms';
import Devices from './pages/Devices';
import HouseDashboard from './pages/HouseDashboard';
import RoomDashboard from './pages/RoomDashboard';
import DeviceDashboard from './pages/DeviceDashboard';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import TelemetryLog from './pages/TelemetryLog';
import Scenarios from './pages/Scenarios';
import Customers from './pages/admin/Customers';
import CustomerDetail from './pages/admin/CustomerDetail';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { RoleRoute } from './auth/RoleRoute';
import { useAuth } from './auth/AuthContext';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';
import { ImpersonationBanner } from './ui/ImpersonationBanner';

/** Each role gets its own landing path — used after login and as `/` fallback. */
function RootRedirect() {
  const auth = useAuth();
  if (auth.status !== 'authenticated') return null;
  return <Navigate to={auth.user.role === 'admin' ? '/admin/customers' : '/dashboard'} replace />;
}

function AppShell() {
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // Auto-close the mobile drawer on every navigation.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-full">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <ImpersonationBanner />
        <TopBar onMenuClick={() => setNavOpen(true)} />
        <main className="flex-1 overflow-auto">
          <Routes>
            {/* Customer-only routes */}
            <Route
              path="/dashboard"
              element={
                <RoleRoute role="user">
                  <Dashboard />
                </RoleRoute>
              }
            />
            <Route
              path="/houses"
              element={
                <RoleRoute role="user">
                  <Houses />
                </RoleRoute>
              }
            />
            <Route
              path="/houses/:id"
              element={
                <RoleRoute role="user">
                  <HouseDashboard />
                </RoleRoute>
              }
            />
            <Route
              path="/rooms"
              element={
                <RoleRoute role="user">
                  <Rooms />
                </RoleRoute>
              }
            />
            <Route
              path="/rooms/:id"
              element={
                <RoleRoute role="user">
                  <RoomDashboard />
                </RoleRoute>
              }
            />
            <Route
              path="/devices"
              element={
                <RoleRoute role="user">
                  <Devices />
                </RoleRoute>
              }
            />
            <Route
              path="/devices/:id"
              element={
                <RoleRoute role="user">
                  <DeviceDashboard />
                </RoleRoute>
              }
            />
            <Route
              path="/analytics"
              element={
                <RoleRoute role="user">
                  <Analytics />
                </RoleRoute>
              }
            />
            <Route
              path="/telemetry-log"
              element={
                <RoleRoute role="user">
                  <TelemetryLog />
                </RoleRoute>
              }
            />
            <Route
              path="/scenarios"
              element={
                <RoleRoute role="user">
                  <Scenarios />
                </RoleRoute>
              }
            />
            <Route
              path="/alerts"
              element={
                <RoleRoute role="user">
                  <Alerts />
                </RoleRoute>
              }
            />

            {/* Admin-only routes */}
            <Route
              path="/admin/customers"
              element={
                <RoleRoute role="admin">
                  <Customers />
                </RoleRoute>
              }
            />
            <Route
              path="/admin/customers/:id"
              element={
                <RoleRoute role="admin">
                  <CustomerDetail />
                </RoleRoute>
              }
            />

            {/* Shared */}
            <Route path="/settings" element={<Settings />} />

            {/* Default — send each role to their landing page */}
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
