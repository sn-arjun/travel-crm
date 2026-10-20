import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';

import { MicCheck, rateConnection } from './mic-check';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubMedia(getUserMedia: (c: unknown) => Promise<unknown>) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices: async () => [] },
  });
}

describe('rateConnection', () => {
  it('rates a low steady delay good, a slower one fair, a slow or jumpy one poor', () => {
    expect(rateConnection([40, 45, 38, 50, 42]).quality).toBe('good');
    expect(rateConnection([180, 200, 190, 210]).quality).toBe('fair');
    expect(rateConnection([500, 700, 450, 900]).quality).toBe('poor');
    expect(rateConnection([40, 400, 30, 380]).quality).toBe('poor');
  });

  it('cannot judge from fewer than two samples', () => {
    expect(rateConnection([])).toEqual({ quality: 'unknown', averageMs: null });
    expect(rateConnection([50])).toEqual({ quality: 'unknown', averageMs: null });
  });

  it('reports the average delay rounded', () => {
    expect(rateConnection([40, 60]).averageMs).toBe(50);
  });
});

describe('MicCheck', () => {
  it('explains a refused microphone and offers to try again', async () => {
    stubMedia(async () => { throw Object.assign(new Error('no'), { name: 'NotAllowedError' }); });
    render(<MicCheck />);
    fireEvent.click(screen.getByTestId('mic-check-start'));
    await waitFor(() => expect(screen.getByTestId('mic-check-problem').textContent).toContain('refused'));
    expect(screen.getByTestId('mic-check').getAttribute('data-mic-state')).toBe('denied');
    expect(screen.getByTestId('mic-check-start')).toBeTruthy();
  });

  it('says when there is no microphone at all', async () => {
    stubMedia(async () => { throw Object.assign(new Error('none'), { name: 'NotFoundError' }); });
    render(<MicCheck />);
    fireEvent.click(screen.getByTestId('mic-check-start'));
    await waitFor(() => expect(screen.getByTestId('mic-check').getAttribute('data-mic-state')).toBe('no_device'));
  });

  it('listens once permission is given, and stops the microphone when done', async () => {
    const stopTrack = vi.fn();
    stubMedia(async () => ({ getAudioTracks: () => [{ getSettings: () => ({ deviceId: 'd1' }) }], getTracks: () => [{ stop: stopTrack }] }));
    const done = vi.fn();
    render(<MicCheck onComplete={done} />);
    fireEvent.click(screen.getByTestId('mic-check-start'));
    await waitFor(() => expect(screen.getByTestId('mic-check').getAttribute('data-mic-state')).toBe('listening'));
    expect(screen.getByTestId('mic-check-level')).toBeTruthy();
    fireEvent.click(screen.getByTestId('mic-check-done'));
    expect(stopTrack).toHaveBeenCalled();
    expect(done).toHaveBeenCalled();
  });

  it('measures the connection with the health endpoint and shows the verdict', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    render(<MicCheck />);
    fireEvent.click(screen.getByTestId('mic-check-network'));
    await waitFor(() => expect(screen.getByTestId('mic-check-quality')).toBeTruthy());
    expect(screen.getByTestId('mic-check-quality').getAttribute('data-quality')).toBe('good');
    expect(vi.mocked(fetch).mock.calls[0]![0]).toContain('/health');
  });
});
