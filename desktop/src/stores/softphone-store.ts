'use client';

import { create } from 'zustand';

/** The CRM's record of the inbound call the agent answered in the app (from the screen pop), so the in-call panel can link it. */
export interface AnsweredCall {
  callId: string;
  from: string;
  contactName: string | null;
  contactId: string | null;
  leadId: string | null;
  leadTitle: string | null;
}

interface SoftphoneUiState {
  answered: AnsweredCall | null;
  setAnswered: (call: AnsweredCall | null) => void;
  /** The microphone check has been done (or skipped) on this computer. */
  micChecked: boolean;
  setMicChecked: (done: boolean) => void;
}

const MIC_CHECK_KEY = 'travelcrm.softphone.micChecked';

function readMicChecked(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(MIC_CHECK_KEY) === '1';
  } catch {
    return false;
  }
}

export const useSoftphoneStore = create<SoftphoneUiState>()((set) => ({
  answered: null,
  setAnswered: (answered) => set({ answered }),
  micChecked: readMicChecked(),
  setMicChecked: (micChecked) => {
    try {
      if (micChecked) window.localStorage.setItem(MIC_CHECK_KEY, '1');
      else window.localStorage.removeItem(MIC_CHECK_KEY);
    } catch {
      // private window: the check simply shows again next time
    }
    set({ micChecked });
  },
}));
