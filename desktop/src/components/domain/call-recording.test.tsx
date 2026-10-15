import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as React from 'react';

import { CallEntryDetail } from './call-timeline-entry';
import { CallSummaryCard } from './call-transcript-panel';
import { RecordingSettingsCard } from './recording-settings-card';
import { recordingErrorMessage } from './call-recording';
import { voipApi } from '@/lib/api/voip';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

vi.mock('@/lib/api/voip', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/voip')>();
  return {
    ...actual,
    voipApi: {
      ...actual.voipApi,
      calls: {
        ...actual.voipApi.calls,
        recording: vi.fn(),
        recordingAudio: vi.fn(),
        summary: vi.fn(),
        summarise: vi.fn(),
      },
      recordingSettings: { get: vi.fn(), update: vi.fn() },
    },
  };
});

const calls = voipApi.calls as unknown as Record<'recording' | 'recordingAudio' | 'summary' | 'summarise', ReturnType<typeof vi.fn>>;
const settingsApi = voipApi.recordingSettings as unknown as Record<'get' | 'update', ReturnType<typeof vi.fn>>;

const play = vi.fn().mockResolvedValue(undefined);
const pause = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no audio: a stand-in that records what it was asked to do.
  class FakeAudio {
    paused = true;
    constructor(public src: string) {}
    addEventListener() {}
    play = () => { this.paused = false; return play(); };
    pause = () => { this.paused = true; pause(); };
  }
  vi.stubGlobal('Audio', FakeAudio);
  URL.createObjectURL = vi.fn(() => 'blob:recording');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const meta = { callId: 'call-1', direction: 'inbound' as const, result: 'completed', durationSeconds: 60, agentName: 'Priya', note: null };

describe('Play button on a call timeline entry', () => {
  it('is enabled once the recording is stored, and absent when there is none', () => {
    const { rerender } = render(<CallEntryDetail meta={{ ...meta, hasRecording: true }} />);
    const button = screen.getByTestId('call-entry-play') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Play recording');

    rerender(<CallEntryDetail meta={{ ...meta, hasRecording: false }} />);
    expect(screen.queryByTestId('call-entry-play')).toBeNull();
  });

  it('asks for the signed link, fetches the audio with the login, and plays it', async () => {
    const link = { url: '/api/v1/files/x?exp=1&sig=a', filePath: '/files/t%2Frecordings%2Fcall-1.mp3', exp: 1, sig: 'a', expiresAt: '2099-01-01T00:00:00Z', contentType: 'audio/mpeg', bytes: 3, durationSeconds: 60, retentionExpiresAt: null };
    calls.recording.mockResolvedValue({ data: link });
    calls.recordingAudio.mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }));
    render(<CallEntryDetail meta={{ ...meta, hasRecording: true }} />);

    fireEvent.click(screen.getByTestId('call-entry-play'));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(calls.recording).toHaveBeenCalledWith('call-1');
    expect(calls.recordingAudio).toHaveBeenCalledWith(link);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('call-entry-play').getAttribute('aria-label')).toBe('Play recording'));

    // A second click pauses the same audio instead of fetching it again.
    fireEvent.click(screen.getByTestId('call-entry-play'));
    await waitFor(() => expect(pause).toHaveBeenCalledTimes(1));
    expect(calls.recording).toHaveBeenCalledTimes(1);
  });

  it('tells the agent why a recording cannot be played', async () => {
    calls.recording.mockRejectedValue({ status: 403, message: 'no' });
    render(<CallEntryDetail meta={{ ...meta, hasRecording: true }} />);
    fireEvent.click(screen.getByTestId('call-entry-play'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('You do not have access to this recording.'));
    expect(play).not.toHaveBeenCalled();
  });

  it('words each refusal plainly', () => {
    expect(recordingErrorMessage({ status: 409 })).toMatch(/still being saved/);
    expect(recordingErrorMessage({ status: 410 })).toMatch(/retention period/);
    expect(recordingErrorMessage({ status: 404 })).toMatch(/no recording/);
    expect(recordingErrorMessage(new Error('x'))).toBe('The recording could not be loaded.');
  });
});

describe('AI summary card', () => {
  it('shows nothing for a call the call AI never looked at', async () => {
    calls.summary.mockResolvedValue({ data: { aiStatus: null, aiStatusReason: null, summary: null } });
    const { container } = render(<CallSummaryCard callId="call-1" />);
    await waitFor(() => expect(calls.summary).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="call-summary-card"]')).toBeNull();
  });

  it('shows the summary and says the suggestions need a click', async () => {
    calls.summary.mockResolvedValue({
      data: {
        aiStatus: 'summarised',
        aiStatusReason: null,
        summary: { extractionId: 'e1', bullets: ['Family of four wants Goa'], keyTopics: [], actionItems: [{ text: 'Send the Goa quote' }], sentiment: 'positive', dealLikelihood: 0.7, status: 'pending', model: 'm', createdAt: '2026-10-15T00:00:00Z' },
      },
    });
    render(<CallSummaryCard callId="call-1" />);
    expect(await screen.findByText('Family of four wants Goa')).toBeTruthy();
    expect(screen.getByText('Send the Goa quote')).toBeTruthy();
    expect(screen.getByText(/Nothing is applied until you click/)).toBeTruthy();
    expect(screen.queryByTestId('call-summarise-now')).toBeNull();
  });

  it('says "Not summarised: AI credits used up" and offers "Summarise now"', async () => {
    calls.summary.mockResolvedValue({ data: { aiStatus: 'skipped', aiStatusReason: 'Not summarised: AI credits used up', summary: null } });
    calls.summarise.mockResolvedValue({ data: { status: 'queued' } });
    render(<CallSummaryCard callId="call-1" />);
    expect((await screen.findByTestId('call-ai-status')).textContent).toBe('Not summarised: AI credits used up');
    fireEvent.click(screen.getByTestId('call-summarise-now'));
    await waitFor(() => expect(calls.summarise).toHaveBeenCalledWith('call-1'));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('offers "Try again" when the AI service was unavailable', async () => {
    calls.summary.mockResolvedValue({ data: { aiStatus: 'failed', aiStatusReason: 'Not summarised: the AI service is not available right now', summary: null } });
    render(<CallSummaryCard callId="call-1" />);
    expect((await screen.findByTestId('call-summarise-now')).textContent).toContain('Try again');
  });

  it('shows the credits message when the top-up has not happened yet', async () => {
    calls.summary.mockResolvedValue({ data: { aiStatus: 'skipped', aiStatusReason: 'Not summarised: AI credits used up', summary: null } });
    calls.summarise.mockRejectedValue({ status: 429, message: "This month's AI credits are used up." });
    render(<CallSummaryCard callId="call-1" />);
    fireEvent.click(await screen.findByTestId('call-summarise-now'));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This month's AI credits are used up."));
  });
});

describe('Recording and Call AI settings card', () => {
  const base = {
    configured: true,
    consentMode: 'announce' as const,
    announcement: null,
    defaultAnnouncement: 'This call may be recorded for quality and training purposes.',
    effectiveAnnouncement: 'This call may be recorded for quality and training purposes.',
    retentionDays: 90,
    callAiEnabled: false,
    callAiEngine: 'standard' as const,
    premiumAvailable: false,
    aiIncluded: true,
  };

  it('starts on the safe defaults and saves what the administrator changes', async () => {
    settingsApi.get.mockResolvedValue({ data: base });
    settingsApi.update.mockResolvedValue({ data: { ...base, retentionDays: 30, callAiEnabled: true } });
    render(<RecordingSettingsCard />);

    const days = (await screen.findByLabelText(/Keep recordings and transcripts/)) as HTMLInputElement;
    expect(days.value).toBe('90');
    expect((screen.getByPlaceholderText(base.defaultAnnouncement) as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByLabelText('Call AI') as HTMLElement).getAttribute('aria-checked')).toBe('false');

    fireEvent.change(days, { target: { value: '30' } });
    fireEvent.click(screen.getByLabelText('Call AI'));
    fireEvent.click(screen.getByTestId('recording-settings-save'));
    await waitFor(() => expect(settingsApi.update).toHaveBeenCalledWith({
      consentMode: 'announce', announcement: null, retentionDays: 30, callAiEnabled: true, callAiEngine: 'standard',
    }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Recording settings saved'));
  });

  it('will not save a retention period outside 1 to 3650 days', async () => {
    settingsApi.get.mockResolvedValue({ data: base });
    render(<RecordingSettingsCard />);
    const days = await screen.findByLabelText(/Keep recordings and transcripts/);
    fireEvent.change(days, { target: { value: '0' } });
    expect((screen.getByTestId('recording-settings-save') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks for the calling set-up first when VoIP is not configured', async () => {
    settingsApi.get.mockResolvedValue({ data: { ...base, configured: false } });
    render(<RecordingSettingsCard />);
    expect(await screen.findByText(/Save your calling settings first/)).toBeTruthy();
    expect(screen.queryByTestId('recording-settings-save')).toBeNull();
  });
});
