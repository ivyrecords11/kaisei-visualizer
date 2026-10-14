import {
  AudioBufferSource,
  AudioBufferSink,
  ALL_FORMATS,
  BufferTarget,
  BufferSource,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import './style.css';

const status = document.querySelector<HTMLOutputElement>('#status')!;
const progress = document.querySelector<HTMLProgressElement>('#progress')!;
const video = document.querySelector<HTMLVideoElement>('#result')!;
const download = document.querySelector<HTMLAnchorElement>('#download')!;
const run = document.querySelector<HTMLButtonElement>('#run')!;

run.addEventListener('click', async () => {
  run.disabled = true;
  try {
    status.value = '640×360 30fps H.264와 48kHz AAC 지원을 확인하는 중';
    const [videoOk, audioOk] = await Promise.all([
      canEncodeVideo('avc', { width: 640, height: 360, frameRate: 30, quality: new Quality({ bitrate: 700_000 }) }),
      canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48_000, quality: new Quality({ bitrate: 96_000 }) }),
    ]);
    if (!videoOk || !audioOk) throw new Error(`필요한 코덱이 없습니다 (H.264: ${videoOk}, AAC: ${audioOk}).`);

    const width = 640, height = 360, fps = 30, seconds = 4;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d')!;
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const vSource = new CanvasSource(canvas, { codec: 'avc', quality: new Quality({ bitrate: 700_000 }) });
    const aSource = new AudioBufferSource({ codec: 'aac', quality: new Quality({ bitrate: 96_000 }) });
    output.addVideoTrack(vSource, { frameRate: fps });
    output.addAudioTrack(aSource);
    await output.start();

    const audio = new AudioContext({ sampleRate: 48_000 });
    const buffer = audio.createBuffer(2, seconds * 48_000, 48_000);
    for (let ch = 0; ch < 2; ch++) {
      const samples = buffer.getChannelData(ch);
      for (let i = 0; i < samples.length; i++) samples[i] = .12 * Math.sin(2 * Math.PI * (220 + 55 * Math.sin(i / 48000)) * i / 48000);
    }
    await aSource.add(buffer);
    aSource.close();

    for (let frame = 0; frame < fps * seconds; frame++) {
      const time = frame / fps;
      context.fillStyle = '#eaf6ff'; context.fillRect(0, 0, width, height);
      context.fillStyle = '#2877b8'; context.font = 'bold 32px sans-serif';
      context.fillText('KaiseiVisualizer MP4 test', 34, 72);
      context.fillStyle = '#e65398'; context.fillRect((time * 110) % (width - 40), 150, 40, 100);
      context.fillStyle = '#17354a'; context.font = '24px sans-serif'; context.fillText(`${time.toFixed(2)} s`, 34, 310);
      await vSource.add(time, 1 / fps);
      if (frame % 6 === 0) {
        progress.value = Math.round((frame + 1) / (fps * seconds) * 100);
        status.value = `인코딩 중 ${progress.value}%`;
        await new Promise(requestAnimationFrame);
      }
    }
    vSource.close();
    await output.finalize();
    await audio.close();
    if (!target.buffer) throw new Error('MP4 출력이 비어 있습니다.');
    const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(target.buffer) });
    const [mime, duration, videoTrack, audioTrack] = await Promise.all([
      input.getMimeType(), input.computeDuration(), input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack(),
    ]);
    if (!videoTrack || !audioTrack) throw new Error('다시 읽은 MP4에 영상 또는 음성 트랙이 없습니다.');
    const [vCodec, aCodec, frameStats, canDecodeAudio] = await Promise.all([
      videoTrack.getCodecParameterString(), audioTrack.getCodecParameterString(), videoTrack.computeFrameRateMetrics(), audioTrack.canDecode(),
    ]);
    if (!vCodec?.startsWith('avc1') || !aCodec?.startsWith('mp4a.40.2') || !canDecodeAudio) {
      throw new Error(`MP4 트랙 검증 실패: ${mime}; 오디오 디코딩 가능=${canDecodeAudio}`);
    }
    const decoded = await new AudioBufferSink(audioTrack).getBuffer(.25);
    const samples = decoded?.buffer.getChannelData(0);
    const rms = samples?.length ? Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length) : 0;
    if (!(rms > .01)) throw new Error('MP4에 AAC가 있지만 디코딩한 합성음이 비어 있거나 무음입니다.');
    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    video.src = url;
    download.href = url;
    download.download = 'kaisei-mp4-codec-test.mp4';
    download.hidden = false;
    progress.value = 100;
    status.value = `검증 통과: ${(blob.size / 1024).toFixed(0)} KiB, ${duration.toFixed(2)}초, ${vCodec} @ ${frameStats.bestGuessFrameRate.toFixed(2)}fps + ${aCodec}, AAC RMS ${rms.toFixed(3)}. 아래 플레이어로 재생할 수 있습니다.`;
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error);
  } finally {
    run.disabled = false;
  }
});
