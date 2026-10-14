import {
  AudioBufferSink,
  AudioBufferSource,
  BufferSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  MP4,
  Output,
  Quality,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { createRenderState, defaultColors, getCharacterColors, prepareArt, renderFrame, type Art, type RenderSettings, type RenderState } from './renderer.ts';
import { parseUstx, projectHash } from './ustx.ts';
import type { Timeline, Track } from './types.ts';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage'), ctx = canvas.getContext('2d')!;
const audio = $<HTMLAudioElement>('audio');
const status = $('status');
const progress = $<HTMLProgressElement>('progress');
const cast = $('cast');
const safeLocal = {
  get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* current session still works */ } },
  remove: (key: string) => { try { localStorage.removeItem(key); } catch { /* current session still works */ } },
};
let timeline: Timeline | null = null;
let renderState: RenderState = createRenderState();
let arts = new Map<number, Art>(), manualColors = new Map<number, string>();
let selectedAudio: File | null = null, audioUrl: string | null = null, audioDuration = 0;
let exportBusy = false, exportCanceled = false, currentOutput: Output | null = null, visualPlaying = false;
let fileRequest = 0, lastNow = performance.now(), silentPreviewTime = 0;

function msg(value: string) { status.textContent = value; }
function fmt(seconds: number) { return `${Math.floor(Math.max(0, seconds)/60)}:${String(Math.floor(Math.max(0, seconds)%60)).padStart(2,'0')}`; }
function preference(key: string) { return timeline ? `kaiseiweb.${timeline.projectKey}.${key}` : `kaiseiweb.default.${key}`; }
function trackPreference(track: Track, field: string) { return `kaiseiweb.${timeline?.projectKey ?? 'project'}.track.${track.id}.${field}`; }
function readTrack(track: Track, field: string, fallback: string) { return safeLocal.get(trackPreference(track, field)) ?? fallback; }
function storeTrack(track: Track, field: string, value: string) { safeLocal.set(trackPreference(track, field), value); }
function val(id: string, fallback = 0) { const n = Number(($<HTMLInputElement>(id)).value); return Number.isFinite(n) ? n : fallback; }
function readSettings(): RenderSettings {
  return {
    width: canvas.width, height: canvas.height, bg: $<HTMLInputElement>('backgroundColor').value,
    pitchGrid: $<HTMLInputElement>('pitchGrid').checked, pitchNotes: $<HTMLInputElement>('pitchNotes').checked,
    pitchLine: $<HTMLInputElement>('pitchLine').checked, currentTone: $<HTMLInputElement>('currentTone').checked,
    showNames: $<HTMLInputElement>('showNames').checked, layout: $<HTMLSelectElement>('layout').value as 'pan'|'spread',
    offset: val('offset'), pitchStepPercent: val('pitchStep', 80), trajectorySpeed: val('trajectorySpeed', 34),
    whiteFade: Math.max(.05,val('whiteFade',.5)), flashDuration: Math.max(.05,val('flashDuration',.45)),
    standFadeIn: Math.max(0,val('standFadeIn',.5)), standFadeOut: Math.max(0,val('standFadeOut',.5)),
    mainOpacity: val('mainOpacity',100)/100, nonMainOpacity: val('nonMainOpacity',45)/100,
    backgroundOpacity: val('backgroundOpacity',18)/100, characterSize: val('characterSize',2), lyricScale: val('lyricScale',1),
    charSize: new Map(timeline?.tracks.map(track=>[track.id,Number(readTrack(track,'size','1'))]) ?? []),
    charBottom: new Map(timeline?.tracks.map(track=>[track.id,Number(readTrack(track,'bottom','0'))]) ?? []),
    charName: new Map(timeline?.tracks.map(track=>[track.id,readTrack(track,'name',track.name)]) ?? []),
  };
}
function syncColors() {
  if (!timeline) return;
  renderState.colors = getCharacterColors(timeline, arts, manualColors);
  cast.querySelectorAll<HTMLInputElement>('input[type="color"][data-track]').forEach(input=>{
    const id=Number(input.dataset.track);input.value=renderState.colors.get(id) ?? defaultColors[id%defaultColors.length];
  });
}
function persistGlobalSettings() {
  for (const id of ['characterSize','pitchStep','lyricScale','trajectorySpeed','whiteFade','flashDuration','standFadeIn','standFadeOut','mainOpacity','nonMainOpacity','backgroundOpacity','backgroundColor','offset','layout','pitchGrid','pitchNotes','pitchLine','currentTone','showNames','resolution']) {
    const el=$<HTMLInputElement|HTMLSelectElement>(id),value=el instanceof HTMLInputElement && el.type==='checkbox'?String(el.checked):el.value;
    safeLocal.set(preference(id),value);
  }
}
function restoreGlobalSettings() {
  if (!timeline) return;
  const key=(id:string)=>safeLocal.get(preference(id));
  for (const id of ['characterSize','pitchStep','lyricScale','trajectorySpeed','whiteFade','flashDuration','standFadeIn','standFadeOut','mainOpacity','nonMainOpacity','backgroundOpacity','backgroundColor','offset','layout','resolution']) {
    const value=key(id);if(value!==null)$<HTMLInputElement|HTMLSelectElement>(id).value=value;
  }
  for(const id of ['pitchGrid','pitchNotes','pitchLine','currentTone','showNames']){const value=key(id);if(value!==null)$<HTMLInputElement>(id).checked=value==='true';}
  document.body.style.backgroundColor=$<HTMLInputElement>('backgroundColor').value;
}
function duration() { return Math.max(timeline?.duration ?? 0, audioDuration); }
function clock() { const total=duration(),t=selectedAudio?audio.currentTime:silentPreviewTime;$('clock').textContent=`${fmt(t)} / ${fmt(total)}`;const seek=$<HTMLInputElement>('seek');seek.max=String(Math.max(.01,total));if(selectedAudio)seek.value=String(audio.currentTime); }
function drawAt(time: number, dt: number) { renderFrame(ctx,time,dt,renderState,readSettings());clock(); }
function tick(now: number) {
  const dt=Math.min(.1,Math.max(0,(now-lastNow)/1000));lastNow=now;
  if(!selectedAudio&&visualPlaying&&timeline){silentPreviewTime=Math.min(duration(),silentPreviewTime+dt);if(silentPreviewTime>=duration()){visualPlaying=false;$('play').textContent='재생';}}
  drawAt(selectedAudio?audio.currentTime:silentPreviewTime,dt);requestAnimationFrame(tick);
}
function updateOutputs() {
  for(const id of ['characterSize','pitchStep','lyricScale','trajectorySpeed','whiteFade','flashDuration','standFadeIn','standFadeOut','mainOpacity','nonMainOpacity','backgroundOpacity']){
    const control=$<HTMLInputElement>(id),out=$<HTMLOutputElement>(id+'Value'),n=Number(control.value);
    out.value=['mainOpacity','nonMainOpacity','backgroundOpacity'].includes(id)?`${n}%`:id==='pitchStep'?`${n}%`:id==='trajectorySpeed'?`${Math.round(n)}px/초`:id==='characterSize'||id==='lyricScale'?`${n.toFixed(2)}배`:`${n.toFixed(2)}초`;
  }
}
function updateAvailability() {
  const ready=!!timeline,hasMix=!!selectedAudio;
  $('play').toggleAttribute('disabled',!ready);
  $<HTMLInputElement>('seek').disabled=!ready;
  $('export').toggleAttribute('disabled',!ready||!hasMix||exportBusy);
  $('cancel').toggleAttribute('disabled',!exportBusy);
  $('ustxFile').toggleAttribute('disabled',exportBusy);
  $('audioFile').toggleAttribute('disabled',exportBusy);
}
function castUi() {
  cast.replaceChildren();if(!timeline)return;
  for(const track of timeline.tracks){
    const box=document.createElement('article');box.className='person';
    const nameLabel=document.createElement('label');nameLabel.textContent=`${track.id+1}. ${track.name} 표시 이름`;
    const name=document.createElement('input');name.type='text';name.value=readTrack(track,'name',track.name);name.setAttribute('aria-label',`${track.name} 표시 이름`);name.oninput=()=>{storeTrack(track,'name',name.value.trim()||track.name);drawAt(selectedAudio?audio.currentTime:silentPreviewTime,0);};nameLabel.append(name);
    const imageLabel=document.createElement('label');imageLabel.textContent='스탠딩 그림 (선택)';
    const imageInput=document.createElement('input');imageInput.type='file';imageInput.accept='image/png,image/webp,image/jpeg';imageInput.setAttribute('aria-label',`${track.name} 스탠딩 그림 선택`);imageInput.onchange=async()=>{
      const file=imageInput.files?.[0];if(!file)return;if(file.size>25_000_000){msg('캐릭터 이미지는 25MB 이하로 선택해 주세요.');return;}
      try{const bitmap=await createImageBitmap(file);if(bitmap.width>9000||bitmap.height>9000){bitmap.close();throw new Error('그림의 가로·세로는 9,000px 이하로 선택해 주세요.');}arts.set(track.id,prepareArt(bitmap));bitmap.close();syncColors();drawAt(selectedAudio?audio.currentTime:silentPreviewTime,0);msg(`${track.name} 그림을 이 세션에 연결했습니다.`);}catch(error){msg(error instanceof Error?error.message:'그림을 열지 못했습니다.');}
    };imageLabel.append(imageInput);
    const sizeLabel=document.createElement('label');sizeLabel.className='char-size';sizeLabel.append(document.createTextNode('크기'));
    const size=document.createElement('input');size.type='range';size.min='.5';size.max='2.5';size.step='.05';size.value=readTrack(track,'size','1');
    const sizeOutput=document.createElement('output');sizeOutput.value=`${Number(size.value).toFixed(2)}배`;size.oninput=()=>{storeTrack(track,'size',size.value);sizeOutput.value=`${Number(size.value).toFixed(2)}배`;};sizeLabel.append(size,sizeOutput);
    const bottomLabel=document.createElement('label');bottomLabel.textContent='개인 바닥 여백';const bottom=document.createElement('input');bottom.type='number';bottom.min='0';bottom.step='1';bottom.value=readTrack(track,'bottom','0');bottom.setAttribute('aria-label',`${track.name} 바닥 여백`);bottom.oninput=()=>{if(bottom.value!==''&&Number(bottom.value)>=0)storeTrack(track,'bottom',bottom.value);};bottomLabel.append(bottom,document.createTextNode('px'));
    const colorRow=document.createElement('div');colorRow.className='color-row';colorRow.append(document.createTextNode('상징색'));
    const color=document.createElement('input');color.type='color';color.dataset.track=String(track.id);color.value=renderState.colors.get(track.id)??defaultColors[track.id%defaultColors.length];color.setAttribute('aria-label',`${track.name} 상징색`);color.oninput=()=>{manualColors.set(track.id,color.value);storeTrack(track,'color',color.value);syncColors();};
    const auto=document.createElement('button');auto.type='button';auto.textContent='그림 대표색';auto.onclick=()=>{manualColors.delete(track.id);safeLocal.remove(trackPreference(track,'color'));syncColors();};colorRow.append(color,auto);
    const caption=document.createElement('small');caption.textContent='그림은 페이지를 새로고침하면 다시 선택해야 합니다.';
    box.append(nameLabel,imageLabel,sizeLabel,bottomLabel,colorRow,caption);cast.append(box);
  }
}
function applyTimeline(next: Timeline, file: File) {
  timeline=next;arts=new Map();manualColors=new Map();
  for(const track of timeline.tracks){const saved=safeLocal.get(trackPreference(track,'color'));if(saved&&/^#[0-9a-f]{6}$/i.test(saved))manualColors.set(track.id,saved);}
  restoreGlobalSettings();
  const titleKey=preference('title');$<HTMLInputElement>('projectTitle').value=safeLocal.get(titleKey)??next.title;
  $('projectFile').textContent=file.name;$('ustxName').textContent=`${file.name} · ${next.tracks.length}개 보컬 트랙`;
  renderState=createRenderState(timeline,arts,getCharacterColors(timeline,arts,manualColors));castUi();updateOutputs();updateAvailability();
  $<HTMLInputElement>('projectTitle').oninput=()=>{if(!timeline)return;safeLocal.set(preference('title'),$<HTMLInputElement>('projectTitle').value);timeline.title=$<HTMLInputElement>('projectTitle').value;};
  msg(selectedAudio?'USTX와 믹스 음원을 불러왔습니다. MP4 저장이 가능합니다.':'악보를 불러왔습니다. 믹스 음원을 선택하면 MP4를 저장할 수 있습니다.');
}

$<HTMLInputElement>('ustxFile').addEventListener('change',async event=>{
  const file=(event.currentTarget as HTMLInputElement).files?.[0];if(!file)return;
  const request=++fileRequest;
  try{if(file.size>30_000_000)throw new Error('USTX 파일은 30MB 이하만 열 수 있습니다.');msg('USTX 악보를 브라우저에서 읽는 중입니다.');const [text,hash]=await Promise.all([file.text(),projectHash(file)]);if(request!==fileRequest)return;const parsed=parseUstx(text,file.name,hash.slice(0,20));applyTimeline(parsed,file);}
  catch(error){if(request===fileRequest)msg(error instanceof Error?error.message:'USTX 파일을 읽지 못했습니다.');}
});
$<HTMLInputElement>('audioFile').addEventListener('change',event=>{
  const file=(event.currentTarget as HTMLInputElement).files?.[0];if(!file)return;
  if(file.size>1_000_000_000){msg('음원은 1GB 이하로 선택해 주세요.');return;}
  if(audioUrl)URL.revokeObjectURL(audioUrl);selectedAudio=file;audioUrl=URL.createObjectURL(file);audio.src=audioUrl;audio.load();audioDuration=0;
  $('audioName').textContent=`${file.name} · 읽는 중`;
  audio.onloadedmetadata=()=>{audioDuration=Number.isFinite(audio.duration)?audio.duration:0;$('audioName').textContent=`${file.name} · ${fmt(audioDuration)}`;silentPreviewTime=0;updateAvailability();clock();msg(timeline?'믹스 음원을 연결했습니다. 미리 듣고 MP4로 저장할 수 있습니다.':'믹스 음원을 연결했습니다. USTX 악보도 선택해 주세요.');};
  audio.onerror=()=>{audioDuration=0;msg('이 음원을 재생할 수 없습니다. WAV 또는 MP3 파일을 선택해 주세요.');};
  updateAvailability();
});
$('play').addEventListener('click',async()=>{if(selectedAudio){try{if(audio.paused){if(audio.currentTime>=audio.duration-.02)audio.currentTime=0;await audio.play();}else audio.pause();}catch{msg('브라우저에서 이 음원을 재생하지 못했습니다.');}}else{if(silentPreviewTime>=duration())silentPreviewTime=0;visualPlaying=!visualPlaying;$('play').textContent=visualPlaying?'일시정지':'재생';}});
audio.onplay=()=>{$('play').textContent='일시정지';};audio.onpause=()=>{$('play').textContent='재생';};
$<HTMLInputElement>('seek').addEventListener('input',event=>{const value=Number((event.currentTarget as HTMLInputElement).value);if(selectedAudio&&Number.isFinite(audio.duration))audio.currentTime=Math.min(value,audio.duration);else silentPreviewTime=value;renderState=createRenderState(timeline,arts,renderState.colors);drawAt(selectedAudio?audio.currentTime:silentPreviewTime,0);});
for(const control of document.querySelectorAll<HTMLInputElement|HTMLSelectElement>('.settings input,.toggles input,.toggles select')){
  control.addEventListener('input',()=>{updateOutputs();persistGlobalSettings();if(control.id==='backgroundColor')document.body.style.backgroundColor=(control as HTMLInputElement).value;});
  control.addEventListener('change',()=>{updateOutputs();persistGlobalSettings();});
}
$<HTMLInputElement>('projectTitle').addEventListener('input',()=>{if(timeline){timeline.title=$<HTMLInputElement>('projectTitle').value;safeLocal.set(preference('title'),timeline.title);}});

async function exportMp4() {
  if(!timeline||!selectedAudio){msg('USTX와 믹스 음원을 모두 선택해 주세요.');return;}
  const height=$<HTMLSelectElement>('resolution').value==='720'?720:1080,width=height===1080?1920:1280,fps=30;
  exportBusy=true;exportCanceled=false;updateAvailability();progress.value=0;renderState=createRenderState(timeline,arts,renderState.colors);
  let audioContext:AudioContext|null=null,bufferSource:AudioBufferSource|null=null,videoSource:CanvasSource|null=null,output:Output|null=null;
  try{
    msg(`${width}×${height} H.264/AAC 지원을 확인하고 믹스 음원을 준비하는 중입니다.`);
    const audioContextDecode=new AudioContext({sampleRate:48_000});audioContext=audioContextDecode;
    const decoded=await audioContextDecode.decodeAudioData(await selectedAudio.arrayBuffer());
    const stereo=audioContextDecode.createBuffer(2,decoded.length,48_000);
    const left=decoded.getChannelData(0),right=decoded.numberOfChannels>1?decoded.getChannelData(1):left;
    stereo.copyToChannel(left,0);stereo.copyToChannel(right,1);
    const [videoOk,audioOk]=await Promise.all([
      canEncodeVideo('avc',{width,height,frameRate:fps,quality:new Quality({bitrate:height===1080?7_500_000:4_500_000})}),
      canEncodeAudio('aac',{numberOfChannels:2,sampleRate:48_000,quality:new Quality({bitrate:160_000})}),
    ]);
    if(!videoOk||!audioOk)throw new Error(`이 브라우저는 요청한 MP4 인코딩을 지원하지 않습니다 (H.264 ${videoOk?'지원':'미지원'}, AAC ${audioOk?'지원':'미지원'}). PC Chrome 또는 Edge에서 다시 시도해 주세요.`);
    if(exportCanceled)throw new DOMException('저장이 취소되었습니다.','AbortError');
    canvas.width=width;canvas.height=height;
    const target=new BufferTarget();output=new Output({format:new Mp4OutputFormat(),target});currentOutput=output;
    videoSource=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:height===1080?7_500_000:4_500_000})});
    bufferSource=new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:160_000})});
    output.addVideoTrack(videoSource,{frameRate:fps});output.addAudioTrack(bufferSource);
    await output.start();await bufferSource.add(stereo);bufferSource.close();
    const length=stereo.duration,totalFrames=Math.ceil(length*fps);let previous=0;
    for(let frame=0;frame<totalFrames;frame++){
      if(exportCanceled){await output.cancel();throw new DOMException('저장이 취소되었습니다.','AbortError');}
      const time=frame/fps,frameDuration=Math.min(1/fps,length-time),settings=readSettings();
      renderFrame(ctx,time,frame===0?0:1/fps,renderState,settings);
      await videoSource.add(time,frameDuration);
      const pct=Math.min(99,Math.floor((frame+1)/totalFrames*100));
      if(pct>=previous+1){progress.value=pct;msg(`MP4 인코딩 중 ${pct}% · ${fmt(time)} / ${fmt(length)}`);previous=pct;await new Promise<void>(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));}
    }
    videoSource.close();msg('MP4 트랙을 마무리하고 코덱·길이를 확인하는 중입니다.');await output.finalize();
    const result=target.buffer;if(!result)throw new Error('MP4 출력 파일이 비어 있습니다. 다시 시도해 주세요.');
    const input=new Input({formats:[MP4],source:new BufferSource(result)});
    const [mime,actualDuration,vTrack,aTrack]=await Promise.all([input.getMimeType(),input.computeDuration(),input.getPrimaryVideoTrack(),input.getPrimaryAudioTrack()]);
    if(!vTrack||!aTrack)throw new Error('만든 MP4에서 영상 또는 음성 트랙을 찾지 못했습니다. 파일을 다시 저장해 주세요.');
    const [vCodec,aCodec,frameStats,audioDecodes]=await Promise.all([vTrack.getCodecParameterString(),aTrack.getCodecParameterString(),vTrack.computeFrameRateMetrics(),aTrack.canDecode()]);
    if(!vCodec?.startsWith('avc1')||!aCodec?.startsWith('mp4a.40.2')||!audioDecodes)throw new Error(`MP4 codec 검증 실패: ${mime}`);
    const decodedAudio=await new AudioBufferSink(aTrack).getBuffer(Math.min(.25,actualDuration/2));
    if(!decodedAudio?.buffer.length)throw new Error('MP4 음성 샘플을 디코딩하지 못했습니다.');
    const blob=new Blob([result],{type:'video/mp4'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${($<HTMLInputElement>('projectTitle').value||'KaiseiVisualizer').replace(/[\\/:*?"<>|]/g,'_')}.mp4`;document.body.append(link);link.click();link.remove();
    progress.value=100;msg(`저장 완료 · ${(blob.size/1_048_576).toFixed(1)}MB · ${fmt(actualDuration)} · ${vCodec} ${frameStats.bestGuessFrameRate.toFixed(2)}fps + ${aCodec} 음성 포함`);setTimeout(()=>URL.revokeObjectURL(url),60_000);
  }catch(error){
    if(exportCanceled||(error instanceof DOMException&&error.name==='AbortError'))msg('MP4 저장을 취소했습니다. 다시 저장할 수 있습니다.');
    else msg(error instanceof Error?`MP4 저장 실패: ${error.message}`:`MP4 저장 실패: ${String(error)}`);
  }finally{
    if(output?.state==='started')try{await output.cancel();}catch{/* already closed */}
    bufferSource?.close();videoSource?.close();if(audioContext)try{await audioContext.close();}catch{/* decode context already closed */}
    currentOutput=null;exportBusy=false;canvas.width=1920;canvas.height=1080;updateAvailability();drawAt(selectedAudio?audio.currentTime:silentPreviewTime,0);
  }
}
$('export').addEventListener('click',()=>void exportMp4());
$('cancel').addEventListener('click',()=>{exportCanceled=true;msg('현재 프레임을 마치고 저장을 취소합니다.');if(currentOutput)void currentOutput.cancel().catch(()=>{});});
$('backgroundColor').addEventListener('input',()=>{document.body.style.backgroundColor=$<HTMLInputElement>('backgroundColor').value;});

updateOutputs();updateAvailability();renderState=createRenderState();requestAnimationFrame(tick);
