import { Link } from "react-router-dom";
import { Shield, Stethoscope, Settings, FlaskConical } from "lucide-react";

const roles = [
  { path: "/patient", label: "Patient", icon: Shield, description: "Manage your health records" },
  { path: "/doctor", label: "Doctor", icon: Stethoscope, description: "Access patient records" },
  { path: "/admin", label: "Admin", icon: Settings, description: "System administration" },
  { path: "/researcher", label: "Researcher", icon: FlaskConical, description: "Anonymized data analytics" },
];

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-8">
      <h1 className="text-4xl font-bold mb-2">MediVault</h1>
      <p className="text-muted-foreground mb-10">Blockchain-powered patient management</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl w-full">
        {roles.map(({ path, label, icon: Icon, description }) => (
          <Link
            key={path}
            to={path}
            className="flex flex-col items-center gap-3 rounded-lg border border-border p-6 hover:bg-accent transition-colors"
          >
            <Icon className="h-10 w-10 text-primary" />
            <span className="text-lg font-semibold">{label}</span>
            <span className="text-sm text-muted-foreground text-center">{description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
