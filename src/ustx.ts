import { parseDocument } from 'yaml';
import type { Interval, Note, PitchPoint, PitchSegment, Timeline, Track } from './types.ts';

type AnyObject = Record<string, unknown>;
const isObject = (value: unknown): value is AnyObject => !!value && typeof value === 'object' && !Array.isArray(value);
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function field(value: unknown, key: string): unknown { return isObject(value) ? value[key] : undefined; }
function number(value: unknown, fallback: number, label: string): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}
function integer(value: unknown, fallback: number, label: string): number {
  const n = number(value, fallback, label);
  if (!Number.isSafeInteger(n)) throw new Error(`${label}은 안전한 정수 범위여야 합니다.`);
  return n;
}
function str(value: unknown, fallback = ''): string { return value == null ? fallback : String(value); }
function bool(value: unknown): boolean { return value === true || String(value).toLowerCase() === 'true'; }

export function parseUstx(text: string, projectName = '프로젝트.ustx', projectKey = 'project'): Timeline {
  if (text.length > 30_000_000) throw new Error('USTX 파일은 30MB 이하만 열 수 있습니다.');
  const doc = parseDocument(text, { schema: 'failsafe', uniqueKeys: true });
  if (doc.errors.length) throw new Error(`USTX YAML 오류: ${doc.errors[0].message}`);
  const root = doc.toJS({ maxAliasCount: 100 });
  if (!isObject(root) || !Array.isArray(root.tracks) || !Array.isArray(root.voice_parts)) {
    throw new Error('USTX에 tracks 또는 voice_parts 정보가 없습니다.');
  }
  const resolution = integer(root.resolution, 480, 'resolution');
  if (resolution <= 0 || resolution > 1_000_000) throw new Error('USTX의 resolution 값이 올바르지 않습니다.');

  const tempos = list(root.tempos).map((raw, index) => {
    const tick = integer(field(raw, 'position'), 0, `tempos[${index}].position`);
    const bpm = number(field(raw, 'bpm'), Number.NaN, `tempos[${index}].bpm`);
    return { tick, bpm, index };
  }).filter(({ bpm }) => Number.isFinite(bpm) && bpm > 0 && bpm <= 1000).sort((a, b) => a.tick - b.tick || a.index - b.index);
  const uniqueTempos: { tick: number; bpm: number }[] = [{ tick: 0, bpm: 120 }];
  for (const event of tempos) {
    const prior = uniqueTempos.at(-1)!;
    if (event.tick === prior.tick) prior.bpm = event.bpm;
    else if (event.tick < 0) uniqueTempos[0] = { tick: 0, bpm: event.bpm };
    else uniqueTempos.push({ tick: event.tick, bpm: event.bpm });
  }
  const bpmAtZero = uniqueTempos.filter(x => x.tick <= 0).at(-1)?.bpm ?? 120;
  const secondsAtTick = (tick: number): number => {
    if (tick < 0) return tick * 60 / (resolution * bpmAtZero);
    let seconds = 0, prevTick = 0, bpm = bpmAtZero;
    for (const event of uniqueTempos) {
      if (event.tick <= 0) continue;
      if (event.tick > tick) break;
      seconds += (event.tick - prevTick) * 60 / (resolution * bpm);
      prevTick = event.tick; bpm = event.bpm;
    }
    return seconds + (tick - prevTick) * 60 / (resolution * bpm);
  };

  const tracks: Track[] = [];
  const rawTracks = root.tracks as unknown[];
  for (let trackIndex = 0; trackIndex < rawTracks.length; trackIndex++) {
    const rawTrack = rawTracks[trackIndex];
    const singer = str(field(rawTrack, 'singer'));
    if (!singer) continue;
    const parts: Interval[] = [], notes: Note[] = [], pitchCurve: PitchSegment[] = [];
    for (const rawPart of root.voice_parts as unknown[]) {
      if (integer(field(rawPart, 'track_no'), -1, 'voice_parts.track_no') !== trackIndex) continue;
      const base = integer(field(rawPart, 'position'), 0, 'voice_parts.position');
      const partDuration = integer(field(rawPart, 'duration'), 0, 'voice_parts.duration');
      if (partDuration <= 0) continue;
      const partStart = secondsAtTick(base), partEnd = secondsAtTick(base + partDuration);
      parts.push([partStart, partEnd]);
      for (const rawCurve of list(field(rawPart, 'curves'))) {
        if (str(field(rawCurve, 'abbr')) !== 'pitd') continue;
        const xs = list(field(rawCurve, 'xs')), ys = list(field(rawCurve, 'ys'));
        const points: [number, number][] = [];
        for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
          const tick = integer(xs[i], 0, 'pitd.x');
          const y = number(ys[i], 0, 'pitd.y');
          points.push([secondsAtTick(base + tick), y / 100]);
        }
        points.sort((a, b) => a[0] - b[0]);
        if (points.length) pitchCurve.push([partStart, partEnd, points]);
      }
      for (const rawNote of list(field(rawPart, 'notes'))) {
        const lyric = str(field(rawNote, 'lyric')).trim();
        if (!lyric || lyric.toLowerCase() === 'r') continue;
        const notePos = integer(field(rawNote, 'position'), 0, 'note.position');
        const noteDuration = integer(field(rawNote, 'duration'), 0, 'note.duration');
        if (noteDuration <= 0) continue;
        const tone = integer(field(rawNote, 'tone'), 60, 'note.tone');
        const noteTick = base + notePos, noteStart = secondsAtTick(noteTick), noteEnd = secondsAtTick(noteTick + noteDuration);
        const pitchData = list(field(field(rawNote, 'pitch'), 'data'));
        const pitch: PitchPoint[] = pitchData.map(point => [
          noteStart + number(field(point, 'x'), 0, 'pitch.x') / 1000,
          number(field(point, 'y'), 0, 'pitch.y') / 10,
          str(field(point, 'shape'), 'io'),
        ] as PitchPoint).filter(point => point[0] >= noteStart - 60 && point[0] <= noteEnd + 60).sort((a, b) => a[0] - b[0]);
        notes.push([noteStart, noteEnd, tone, lyric, pitch, noteTick, noteTick + noteDuration]);
      }
    }
    parts.sort((a, b) => a[0] - b[0]);
    const merged: Interval[] = [];
    for (const [start, end] of parts) {
      const prior = merged.at(-1);
      if (prior && start <= prior[1] + 1e-8) prior[1] = Math.max(prior[1], end);
      else merged.push([start, end]);
    }
    notes.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    pitchCurve.sort((a, b) => a[0] - b[0]);
    if (!notes.length) continue;
    let name = str(field(rawTrack, 'track_name'), singer).replace(/^\d+\s*/, '');
    if (/^Track\d+(?:_copy)?$/i.test(name)) name = singer;
    tracks.push({
      id: trackIndex, name: name || singer, singer,
      pan: number(field(rawTrack, 'pan'), 0, 'track.pan'), parts: merged, notes,
      pitchCurve, muted: bool(field(rawTrack, 'mute')), solo: bool(field(rawTrack, 'solo')),
    });
  }
  if (!tracks.length) throw new Error('이 USTX에서 표시할 보컬 트랙과 음표를 찾지 못했습니다.');
  const tones = tracks.flatMap(track => track.notes.map(note => note[2]));
  const beatSeconds = secondsAtTick(resolution) - secondsAtTick(0);
  return {
    title: projectName.replace(/\.ustx$/i, ''), project: projectName, tracks,
    duration: Math.max(0, ...tracks.flatMap(track => [...track.notes.map(note => note[1]), ...track.parts.map(part => part[1])])),
    pitchMin: Math.min(...tones), pitchMax: Math.max(...tones), beatSeconds, resolution, projectKey,
  };
}

export async function projectHash(file: File): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
