import { create } from "zustand";

const useDoctorStore = create((set) => ({
  // State
  doctorProfile: null,
  approvedPatients: [],
  pendingRequests: [],
  opinions: [],

  // Actions
  setProfile: (profile) => set({ doctorProfile: profile }),

  setApprovedPatients: (approvedPatients) => set({ approvedPatients }),

  setPendingRequests: (pendingRequests) => set({ pendingRequests }),

  addOpinion: (opinion) =>
    set((state) => ({ opinions: [opinion, ...state.opinions] })),

  setOpinions: (opinions) => set({ opinions }),

  clearDoctor: () =>
    set({
      doctorProfile: null,
      approvedPatients: [],
      pendingRequests: [],
      opinions: [],
    }),
}));

export default useDoctorStore;
