import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import EmailParser from "./pages/EmailParser";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";

function Logout() {
  localStorage.clear();
  return <Navigate to="/" />;
}

function RegisterAndLogout() {
  localStorage.clear(); // Make sure to clear old/recent tokens to make sure no bugs occur
  return <Register />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          }
        />
        <Route
          path="/parse-email"
          element={
            <ProtectedRoute>
              <EmailParser />
            </ProtectedRoute>
          }
        />
        <Route path="/logout" element={<Logout />} />
        <Route path="/register" element={<RegisterAndLogout />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
