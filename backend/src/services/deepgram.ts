/**
 * Deepgram Service — TICKET-391
 *
 * Batch transcription via Deepgram Nova-2 API.
 * Supports: pre-recorded audio, language detection, speaker diarization.
 */

export interface TranscriptionResult {
  transcript: string;
  confidence: number;
  language: string;
  durationSeconds: number;
  wordCount: number;
  words: TranscriptionWord[];
  speakers: SpeakerSegment[];
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  speaker?: number;
}

export interface SpeakerSegment {
  speaker: number;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export class DeepgramService {
  private apiKey: string;
  private baseUrl = 'https://api.deepgram.com/v1';

  constructor(env: { DEEPGRAM_API_KEY: string }) {
    this.apiKey = env.DEEPGRAM_API_KEY;
  }

  /**
   * Transcribe a pre-recorded audio file from URL.
   * Uses Nova-2 model with diarization and language detection.
   */
  async transcribeRecording(audioUrl: string, options?: {
    language?: string;
    diarize?: boolean;
    punctuate?: boolean;
    model?: string;
  }): Promise<TranscriptionResult> {
    const params = new URLSearchParams({
      model: options?.model || 'nova-2',
      smart_format: 'true',
      punctuate: String(options?.punctuate ?? true),
      diarize: String(options?.diarize ?? true),
      detect_language: options?.language ? 'false' : 'true',
      utterances: 'true',
    });

    if (options?.language) {
      params.set('language', options.language);
    }

    const response = await fetch(
      `${this.baseUrl}/listen?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: audioUrl }),
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Deepgram transcription failed (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    return this.parseResponse(data);
  }

  /**
   * Transcribe raw audio bytes (for voicemail or uploaded files).
   */
  async transcribeAudio(audioBytes: ArrayBuffer, mimeType: string, options?: {
    language?: string;
    diarize?: boolean;
    model?: string;
  }): Promise<TranscriptionResult> {
    // Nova-3 with language=multi follows speakers who switch language mid-call (Hindi/English), the premium engine of R306.
    const model = options?.model ?? 'nova-3';
    const params = new URLSearchParams({
      model,
      smart_format: 'true',
      punctuate: 'true',
      diarize: String(options?.diarize ?? true),
      utterances: 'true',
    });

    if (options?.language) {
      params.set('language', options.language);
    } else if (model === 'nova-3') {
      params.set('language', 'multi');
    } else {
      params.set('detect_language', 'true');
    }

    const response = await fetch(
      `${this.baseUrl}/listen?${params.toString()}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': mimeType,
        },
        body: audioBytes,
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Deepgram transcription failed (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    return this.parseResponse(data);
  }

  private parseResponse(data: any): TranscriptionResult {
    const channel = data.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];

    if (!alt) {
      return {
        transcript: '',
        confidence: 0,
        language: 'en',
        durationSeconds: 0,
        wordCount: 0,
        words: [],
        speakers: [],
      };
    }

    const words: TranscriptionWord[] = (alt.words || []).map((w: any) => ({
      word: w.word,
      start: w.start,
      end: w.end,
      confidence: w.confidence,
      speaker: w.speaker,
    }));

    // Build speaker segments from utterances or words
    const speakers: SpeakerSegment[] = [];
    const utterances = data.results?.utterances || [];

    if (utterances.length > 0) {
      for (const utt of utterances) {
        speakers.push({
          speaker: utt.speaker ?? 0,
          text: utt.transcript,
          start: utt.start,
          end: utt.end,
          confidence: utt.confidence,
        });
      }
    } else {
      // Fall back to grouping consecutive words by speaker
      let currentSpeaker = -1;
      let currentSegment: SpeakerSegment | null = null;

      for (const w of words) {
        const spk = w.speaker ?? 0;
        if (spk !== currentSpeaker) {
          if (currentSegment) speakers.push(currentSegment);
          currentSpeaker = spk;
          currentSegment = {
            speaker: spk,
            text: w.word,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
          };
        } else if (currentSegment) {
          currentSegment.text += ' ' + w.word;
          currentSegment.end = w.end;
        }
      }
      if (currentSegment) speakers.push(currentSegment);
    }

    const detectedLang = channel?.detected_language || data.results?.channels?.[0]?.detected_language || 'en';

    return {
      transcript: alt.transcript || '',
      confidence: alt.confidence || 0,
      language: detectedLang,
      durationSeconds: data.metadata?.duration || 0,
      wordCount: words.length,
      words,
      speakers,
    };
  }
}
