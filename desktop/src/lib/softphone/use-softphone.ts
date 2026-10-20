'use client';

import * as React from 'react';
import { voipApi } from '@/lib/api/voip';
import { getSoftphoneController, type SoftphoneController } from './controller';
import type { SoftphoneState } from './state';

/** The one softphone of this window; its tokens come from GET /voip/token. */
export function appSoftphone(): SoftphoneController {
  return getSoftphoneController({
    fetchToken: async () => {
      const res = await voipApi.token.get();
      const data = res.data;
      return { token: data.token, provider: data.provider ?? 'twilio', expiresIn: data.expiresIn ?? 900 };
    },
  });
}

export interface UseSoftphone extends SoftphoneState {
  controller: SoftphoneController;
  /** True when calling is on for the agency and this window is signed in to the phone. */
  available: boolean;
  answer: () => void;
  reject: () => void;
  hangup: () => void;
  setMuted: (on: boolean) => void;
  setHeld: (on: boolean) => void;
}

/** The softphone's state and actions. Renders nothing special for agencies without calling: `available` stays false. */
export function useSoftphone(): UseSoftphone {
  const controller = appSoftphone();
  const state = React.useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return {
    ...state,
    controller,
    available: state.status !== 'unavailable' && state.status !== 'idle' && state.status !== 'registering' && state.status !== 'error',
    answer: () => controller.answer(),
    reject: () => controller.reject(),
    hangup: () => controller.hangup(),
    setMuted: (on) => controller.setMuted(on),
    setHeld: (on) => controller.setHeld(on),
  };
}
