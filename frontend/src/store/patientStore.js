import { create } from "zustand";

const usePatientStore = create((set) => ({
  // State
  patientProfile: null,
  records: [],
  accessRequests: [],
  prescriptions: [],
  complianceTasks: [],

  // Actions
  setProfile: (profile) => set({ patientProfile: profile }),

  addRecord: (record) =>
    set((state) => ({ records: [record, ...state.records] })),

  setRecords: (records) => set({ records }),

  setAccessRequests: (accessRequests) => set({ accessRequests }),

  setPrescriptions: (prescriptions) => set({ prescriptions }),

  setComplianceTasks: (complianceTasks) => set({ complianceTasks }),

  clearPatient: () =>
    set({
      patientProfile: null,
      records: [],
      accessRequests: [],
      prescriptions: [],
      complianceTasks: [],
    }),
}));

export default usePatientStore;
