import { create } from "zustand";

const useUIStore = create((set) => ({
  // State
  isLoading: false,
  currentModal: null, // { type: "uploadRecord", data: {} } etc.
  notifications: [],

  // Actions
  setLoading: (isLoading) => set({ isLoading }),

  openModal: (type, data = {}) => set({ currentModal: { type, data } }),

  closeModal: () => set({ currentModal: null }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [
        { id: Date.now(), timestamp: new Date().toISOString(), ...notification },
        ...state.notifications,
      ],
    })),

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () => set({ notifications: [] }),
}));

export default useUIStore;
