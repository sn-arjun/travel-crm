export const repoRoot: string;
export function ffmpegPath(): string;
export function ff(args: string[], opts?: { loglevel?: string }): { stdout: string; stderr: string };
export function durationSec(file: string): number;
export function videoInfo(file: string): { width: number; height: number; fps: number; codec: string };
