import {parseDocument} from './vendor/yaml/index.js';
export function parseUSTX(text){
 const doc=parseDocument(text,{schema:'failsafe',uniqueKeys:true});
 if(doc.errors.length)throw Error('USTX YAML 오류: '+doc.errors[0].message);
 const root=doc.toJS({maxAliasCount:100});
 if(!root||!Array.isArray(root.tracks)||!Array.isArray(root.voice_parts))throw Error('USTX 트랙 또는 보컬 파트가 없습니다.');
 const num=(v,f,label)=>{const n=Number(v??f);if(!Number.isFinite(n))throw Error(label+' 값이 올바르지 않습니다.');return n;};
 const resolution=num(root.resolution,480,'resolution');if(resolution<=0)throw Error('resolution은 양수여야 합니다.');
 const initial=num(root.bpm,120,'BPM');if(initial<=0)throw Error('BPM은 양수여야 합니다.');
 const tempos=(root.tempos||[]).map(e=>({tick:num(e.position,0,'템포 위치'),bpm:num(e.bpm,initial,'BPM')})).sort((a,b)=>a.tick-b.tick);
 if(tempos.some(e=>e.bpm<=0))throw Error('BPM은 양수여야 합니다.');
 const events=[{tick:0,bpm:initial,seconds:0}];
 for(const e of tempos){const last=events.at(-1);if(e.tick<=0){events[0].bpm=e.bpm;}else if(e.tick===last.tick){last.bpm=e.bpm;}else events.push({...e,seconds:last.seconds+(e.tick-last.tick)*60/resolution/last.bpm});}
 const seconds=tick=>{let lo=0,hi=events.length;while(lo+1<hi){const mid=(lo+hi)>>1;if(events[mid].tick<=tick)lo=mid;else hi=mid;}const e=events[lo];return e.seconds+(tick-e.tick)*60/resolution/e.bpm;};
 const tracks=root.tracks.map((t,i)=>({id:i,name:String(t.track_name||t.singer||`트랙 ${i+1}`),notes:[]}));
 let duration=0;
 for(const [pi,p] of root.voice_parts.entries()){
  const ti=num(p.track_no,0,'트랙 번호');if(!Number.isInteger(ti)||!tracks[ti])throw Error('존재하지 않는 보컬 트랙입니다.');
  const base=num(p.position,0,'파트 시작');
  for(const [ni,n] of (p.notes||[]).entries()){
   const start=base+num(n.position,0,'노트 시작'),length=num(n.duration,0,'노트 길이');if(start<0||length<0)throw Error('음표 시작과 길이는 음수일 수 없습니다.');
   const end=seconds(start+length),lyric=String(n.lyric||'');duration=Math.max(duration,end);
   tracks[ti].notes.push({start:seconds(start),end,lyric,rest:!lyric||/^r$/i.test(lyric),id:`${pi}:${ni}`});
  }
 }
 for(const t of tracks)t.notes.sort((a,b)=>a.start-b.start||a.end-b.end);
 const vocal=tracks.filter(t=>t.notes.some(n=>!n.rest));if(!vocal.length)throw Error('자막으로 변환할 보컬 음표가 없습니다.');
 return {title:String(root.name||'USTX'),tracks:vocal,notes:vocal[0].notes,duration,warnings:[]};
}
