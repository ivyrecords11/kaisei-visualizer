import assert from 'node:assert/strict';
import { parseUstx } from '../src/ustx.ts';

const fixture = `
name: "합성 테스트"
resolution: 480
tempos:
  - position: 0
    bpm: 120
  - position: 1920
    bpm: 60
tracks:
  - track_name: "1 보컬"
    singer: "Synthetic Singer"
    pan: -35
    mute: false
    solo: true
  - track_name: "빈 트랙"
    singer: ""
voice_parts:
  - track_no: 0
    position: 0
    duration: 3840
    curves:
      - abbr: pitd
        xs: [0, 480, 960]
        ys: [0, 200, 0]
    notes:
      - position: 0
        duration: 480
        tone: 60
        lyric: "no"
        pitch:
          data:
            - x: 0
              y: -30
              shape: io
      - position: 480
        duration: 120
        tone: 0
        lyric: r
      - position: 960
        duration: 480
        tone: 62
        lyric: "あ"
      - position: 2880
        duration: 480
        tone: 64
        lyric: "+"
`;

const timeline = parseUstx(fixture, 'synthetic.ustx', 'fixture');
assert.equal(timeline.tracks.length, 1);
assert.equal(timeline.tracks[0].notes.length, 3, 'rest notes are omitted');
assert.equal(timeline.tracks[0].notes[0][3], 'no', 'failsafe schema preserves word-like lyrics');
assert.equal(timeline.tracks[0].notes[0][4][0][1], -3, 'pitch Y is in tenths of semitones');
assert.equal(timeline.tracks[0].notes[1][0], 1, 'tick positions are converted using tempo');
assert.equal(timeline.tracks[0].notes[2][0], 4, 'tempo changes affect later tick conversion');
assert.equal(timeline.tracks[0].notes[1][5] - timeline.tracks[0].notes[0][6], 480, 'one beat is within the connection threshold');
assert.equal(timeline.tracks[0].notes[2][5] - timeline.tracks[0].notes[1][6], 1440, 'three beats exceed the connection threshold');
assert.equal(timeline.tracks[0].pitchCurve[0][2][1][1], 2, 'part pitd values are converted from hundredths');
assert.equal(timeline.duration, 6);
assert.throws(() => parseUstx('tracks: []\nvoice_parts: []\n', 'empty.ustx'), /보컬 트랙/);
assert.throws(() => parseUstx('tracks: []\nvoice_parts: [\n', 'bad.ustx'), /YAML 오류/);
console.log('USTX synthetic parser checks passed');
