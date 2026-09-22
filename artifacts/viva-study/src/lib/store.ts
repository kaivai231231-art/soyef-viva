import { create } from 'zustand';
import type { AIAccount, Question, StudyTarget } from './db';

interface UIState {
  questions: Question[]; target?: StudyTarget; accounts: AIAccount[]; hydrated: boolean;
  setData: (data: Partial<Pick<UIState, 'questions' | 'target' | 'accounts'>>) => void;
  setHydrated: (value: boolean) => void;
}
export const useAppStore = create<UIState>((set) => ({
  questions: [], accounts: [], hydrated: false,
  setData: (data) => set(data), setHydrated: (hydrated) => set({ hydrated }),
}));