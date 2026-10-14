export type PitchPoint = [time: number, cents: number, shape: string];
export type Note = [start: number, end: number, tone: number, lyric: string, pitch: PitchPoint[], tickStart: number, tickEnd: number];
export type PitchSegment = [start: number, end: number, points: [time: number, semitones: number][]];
export type Interval = [start: number, end: number];
export type Track = {
  id: number; name: string; singer: string; pan: number; parts: Interval[]; notes: Note[];
  pitchCurve: PitchSegment[]; muted: boolean; solo: boolean;
};
export type Timeline = {
  title: string; project: string; tracks: Track[]; duration: number;
  pitchMin: number; pitchMax: number; beatSeconds: number; resolution: number; projectKey: string;
};
