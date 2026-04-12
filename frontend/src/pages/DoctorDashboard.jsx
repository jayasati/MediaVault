import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import WalletBar from "@/components/WalletBar";

export default function DoctorDashboard() {
  return (
    <div className="min-h-screen bg-background">
      <WalletBar />
      <div className="p-8">
        <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <h1 className="text-3xl font-bold mb-4">Doctor Dashboard</h1>
        <p className="text-muted-foreground">Request patient access, view records, and manage consultations.</p>
      </div>
    </div>
  );
}
