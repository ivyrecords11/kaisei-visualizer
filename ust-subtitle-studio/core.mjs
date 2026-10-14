export function decodeUST(buffer, encoding='auto') {
  if(encoding!=='auto')return new TextDecoder(encoding,{fatal:true}).decode(buffer);
  const bytes=new Uint8Array(buffer);
  if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(buffer);
  if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(buffer);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(buffer);}catch{return new TextDecoder('shift_jis',{fatal:true}).decode(buffer);}
}
export function parseUST(text) {
  const sections=[];let current=null;
  for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
    const header=line.trim().match(/^\[#([^\]]+)\]$/);
    if(header){current={id:header[1],values:{}};sections.push(current);continue;}
    const eq=line.indexOf('=');if(current&&eq>0)current.values[line.slice(0,eq).trim()]=line.slice(eq+1).trim();
  }
  const setting=sections.find(s=>s.id==='SETTING')?.values||{};
  let bpm=Number(setting.Tempo||120),time=0;
  if(!Number.isFinite(bpm)||bpm<=0)throw Error('기본 템포가 올바르지 않습니다.');
  const notes=[],warnings=[];
  for(const {id,values:v} of sections){
    if(!/^\d+$/.test(id))continue;
    if(v.Tempo){const value=Number(v.Tempo);if(!Number.isFinite(value)||value<=0)throw Error(`${id}: 템포를 확인하세요.`);bpm=value;}
    const ticks=Number(v.Length);if(!Number.isFinite(ticks)||ticks<0)throw Error(`${id}: 음표 길이를 확인하세요.`);
    const end=time+ticks/480*60/bpm;
    notes.push({start:time,end,lyric:v.Lyric||'',rest:!v.Lyric||/^r$/i.test(v.Lyric),id});time=end;
  }
  if(!notes.length)throw Error('UST 음표를 찾지 못했습니다. .ust 파일을 선택하세요. USTX는 아직 지원하지 않습니다.');
  if(!setting.Tempo)warnings.push('기본 템포가 없어 120 BPM으로 계산했습니다.');
  return {title:setting.ProjectName||'Untitled',notes,duration:time,warnings};
}
export function lyricText(raw,clean=false){
  if(!clean)return raw;
  // Remove only a recognizable VCV prefix before Japanese kana; preserve CVVC/English words.
  return raw.replace(/^[aiueonN-]\s+(?=[\u3040-\u30ff])/,'');
}
export function makeCues(notes,{mode='phrase',gap=.25,maxDuration=6,clean=false,separator=''}={}){
  const cues=[];let current=null;
  for(const n of notes){
    if(n.rest||n.end<=n.start)continue;
    const lyric=lyricText(n.lyric,clean),continuation=/^[+ー]$/.test(lyric);
    if(continuation){if(current&&n.start-current.end<=gap+.000001)current.end=n.end;continue;}
    if(!current||mode==='note'||n.start-current.end>gap+.000001||n.end-current.start>maxDuration){current={start:n.start,end:n.end,text:lyric};cues.push(current);}
    else{current.end=n.end;current.text+=separator+lyric;}
  }
  return cues;
}
export function validateCues(cues,offset=0){
  if(!Number.isFinite(offset))throw Error('시간 보정값을 확인하세요.');
  let lastEnd=-Infinity;
  return cues.map((c,i)=>{
    if(!Number.isFinite(c.start)||!Number.isFinite(c.end))throw Error(`${i+1}번 자막의 시간을 확인하세요.`);
    const start=Math.round((c.start+offset)*1000),end=Math.round((c.end+offset)*1000);
    if(start<0||end<=start)throw Error(`${i+1}번 자막: 시작은 0초 이상, 끝은 시작보다 뒤여야 합니다.`);
    if(start<lastEnd)throw Error(`${i+1}번 자막이 이전 자막과 겹칩니다. 시간을 수정하세요.`);
    const text=String(c.text).trim();if(!text)throw Error(`${i+1}번 자막에 가사를 입력하세요.`);
    lastEnd=end;return {start,end,text};
  });
}
export function stamp(ms,vtt=false){const hours=Math.floor(ms/3600000),minutes=Math.floor(ms/60000)%60,seconds=Math.floor(ms/1000)%60;return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}${vtt?'.':','}${String(ms%1000).padStart(3,'0')}`;}
export function serialize(cues,format='srt',offset=0){
  const valid=validateCues(cues,offset),vtt=format==='vtt';
  const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r?\n\s*\r?\n/g,'\n');
  return (vtt?'WEBVTT\n\n':'')+valid.map((c,i)=>`${vtt?'':`${i+1}\n`}${stamp(c.start,vtt)} --> ${stamp(c.end,vtt)}\n${escape(c.text)}\n`).join('\n');
}
