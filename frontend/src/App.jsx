import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import PatientDashboard from "./pages/PatientDashboard";
import DoctorDashboard from "./pages/DoctorDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import ResearcherDashboard from "./pages/ResearcherDashboard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/patient" element={<PatientDashboard />} />
      <Route path="/doctor" element={<DoctorDashboard />} />
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/super-admin" element={<SuperAdminDashboard />} />
      <Route path="/researcher" element={<ResearcherDashboard />} />
    </Routes>
  );
}
