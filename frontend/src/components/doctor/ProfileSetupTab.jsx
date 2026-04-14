import { useState, useEffect, useCallback } from "react";
import { User, MapPin, Stethoscope, Save, Power, Lock } from "lucide-react";
import toast from "react-hot-toast";
import useWallet from "@/hooks/useWallet";
import useContract from "@/hooks/useContract";
import { ethers } from "ethers";

export default function ProfileSetupTab() {
  const { walletAddress } = useWallet();
  const appointments = useContract("AppointmentSystem");
  const roleManager = useContract("RoleManager");

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form fields — name & specialization are locked (from approved application)
  const [name, setName] = useState("");
  const [specialization, setSpecialization] = useState("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [fee, setFee] = useState("");

  const load = useCallback(async () => {
    if (!appointments || !roleManager || !walletAddress) return;
    setLoading(true);
    try {
      // Pull immutable identity from the approved application
      try {
        const app = await roleManager.getMyApplication(walletAddress);
        if (app && app.name) {
          setName(app.name);
          setSpecialization(app.specialization || "");
        }
      } catch (e) {
        console.warn("getMyApplication failed:", e);
      }

      // Overlay existing AppointmentSystem profile if listed
      const p = await appointments.getProfile(walletAddress);
      if (p.isListed) {
        setProfile(p);
        setCity(p.cityDisplay);
        setBio(p.bio);
        setFee(ethers.formatEther(p.consultationFeeMEDI));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [appointments, roleManager, walletAddress]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!name.trim() || !specialization.trim()) {
      toast.error("Your application details haven't loaded yet. Try refreshing.");
      return;
    }
    if (!city.trim() || !fee) {
      toast.error("Fill city and consultation fee");
      return;
    }
    setSaving(true);
    const tid = toast.loading("Creating profile...");
    try {
      const feeWei = ethers.parseEther(fee);
      const tx = await appointments.createProfile(name.trim(), specialization, city.trim(), bio.trim(), feeWei);
      await tx.wait();
      toast.success("Profile listed! Patients can now find you.", { id: tid });
      load();
    } catch (err) {
      toast.error(err.reason || "Failed to create profile", { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    setSaving(true);
    const tid = toast.loading("Updating profile...");
    try {
      const feeWei = ethers.parseEther(fee);
      const tx = await appointments.updateProfile(bio.trim(), feeWei);
      await tx.wait();
      toast.success("Profile updated", { id: tid });
      load();
    } catch (err) {
      toast.error(err.reason || "Failed", { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const handleDelist = async () => {
    if (!window.confirm("Delist your profile? Patients will no longer find you in search.")) return;
    const tid = toast.loading("Delisting...");
    try {
      const tx = await appointments.delistProfile();
      await tx.wait();
      toast.success("Profile delisted", { id: tid });
      setProfile(null);
    } catch (err) {
      toast.error(err.reason || "Failed", { id: tid });
    }
  };

  return (
    <div>
      <div className="mb-4">
        <div className="text-[15px] font-medium">Public profile</div>
        <div className="text-[11px] text-[#64748b]">
          {profile ? "Your profile is live in the doctor directory" : "Create your profile so patients can find and book you"}
        </div>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 max-w-xl">
        <div className="flex flex-col gap-3">
          <div className="p-3 rounded-[7px] bg-[#f8fafc] border border-[#e2e8f0]">
            <div className="text-[10px] text-[#94a3b8] uppercase tracking-wide mb-2 flex items-center gap-1">
              <Lock className="h-3 w-3" /> From approved application — cannot be changed here
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#64748b] mb-1 block flex items-center gap-1">
                  <User className="h-3 w-3" /> Full name
                </label>
                <input
                  type="text"
                  value={name}
                  disabled
                  readOnly
                  className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white text-[#64748b] cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#64748b] mb-1 block flex items-center gap-1">
                  <Stethoscope className="h-3 w-3" /> Specialization
                </label>
                <input
                  type="text"
                  value={specialization}
                  disabled
                  readOnly
                  className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] bg-white text-[#64748b] cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[#64748b] mb-1 block flex items-center gap-1">
              <MapPin className="h-3 w-3" /> City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={!!profile}
              placeholder="Delhi"
              className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488] disabled:bg-[#f8fafc]"
            />
            {profile && (
              <div className="text-[9px] text-[#94a3b8] mt-1">
                City is locked after listing. Delist and re-list to change.
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] text-[#64748b] mb-1 block">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="15 years experience, specialized in preventive cardiology..."
              className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] resize-none focus:outline-none focus:border-[#0D9488]"
            />
          </div>

          <div>
            <label className="text-[11px] text-[#64748b] mb-1 block">Consultation fee (MEDI)</label>
            <input
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="50"
              min="0"
              step="1"
              className="w-full px-3 py-[7px] text-xs border border-[#cbd5e1] rounded-[7px] focus:outline-none focus:border-[#0D9488]"
            />
          </div>

          <div className="flex gap-2 mt-2">
            {profile ? (
              <>
                <button
                  onClick={handleUpdate}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving..." : "Update profile"}
                </button>
                <button
                  onClick={handleDelist}
                  className="inline-flex items-center gap-1.5 px-4 py-[7px] bg-[#FCEBEB] text-[#791F1F] text-xs font-medium rounded-[7px] hover:bg-[#f9d5d5]"
                >
                  <Power className="h-3.5 w-3.5" />
                  Delist
                </button>
              </>
            ) : (
              <button
                onClick={handleCreate}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-[7px] bg-[#0D9488] text-white text-xs font-medium rounded-[7px] hover:bg-[#0B7C72] disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Creating..." : "Create profile"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
