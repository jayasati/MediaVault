import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import WalletBar from "@/components/WalletBar";

export default function PatientDashboard() {
  return (
    <div className="min-h-screen bg-background">
      <WalletBar />
      <div className="p-8">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-3xl font-bold mb-4">Patient Dashboard</h1>
        <p className="text-muted-foreground">Manage your health records, access requests, and emergency profile.</p>
      </div>
    </div>
  );
}
