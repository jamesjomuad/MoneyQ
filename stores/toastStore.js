import { create } from 'zustand';

/**
 * Transient, app-wide toast queue — one message at a time; a newer toast
 * replaces the older. Nothing is persisted: toasts are pure feedback and
 * must survive a screen closing, which is why the state lives above the
 * navigator (rendered by ToastView in the root layout) instead of in a
 * screen that unmounts mid-animation.
 */
export const useToastStore = create((set) => ({
  current: null,
  show: (message, tone = 'success') =>
    set({ current: { id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, message, tone } }),
  dismiss: (id) => set((state) => (state.current?.id === id ? { current: null } : state)),
}));

export function showToast(message, tone = 'success') {
  useToastStore.getState().show(message, tone);
}
