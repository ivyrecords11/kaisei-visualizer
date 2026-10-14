import type { Note, Timeline, Track } from './types.ts';

export type Art = { image: HTMLCanvasElement; crop: { x: number; y: number; w: number; h: number }; primaryHue: number | null };
export type RenderState = {
  timeline: Timeline | null; arts: Map<number, Art>; colors: Map<number, string>;
  pitchCenter: number | null; pitchSpan: number | null; lastTime: number; lastFlash: Map<number, number>;
  lastSeen: Map<string, { pitch: number; time: number; color: string }>;
};
export type RenderSettings = {
  width: number; height: number; bg: string; pitchGrid: boolean; pitchNotes: boolean;
  pitchLine: boolean; currentTone: boolean; showNames: boolean; layout: 'pan'|'spread';
  offset: number; pitchStepPercent: number; trajectorySpeed: number; whiteFade: number; flashDuration: number;
  standFadeIn: number; standFadeOut: number; mainOpacity: number; nonMainOpacity: number;
  backgroundOpacity: number; characterSize: number; lyricScale: number;
  charSize: Map<number, number>; charBottom: Map<number, number>; charName: Map<number, string>;
};

export const defaultColors = ['#38a9e8','#f3914f','#a38cff','#52c99c','#fa79a0','#e5bb46','#61a8ff','#d57deb','#42d4c1','#efa16b','#a3d653','#aa94ff','#f078bf'];
const primaryHues = [0, 30, 55, 130, 180, 230, 280];
export function createRenderState(timeline: Timeline | null = null, arts = new Map<number, Art>(), colors = new Map<number, string>()): RenderState {
  return { timeline, arts, colors, pitchCenter: null, pitchSpan: null, lastTime: -1, lastFlash: new Map(), lastSeen: new Map() };
}
export function prepareArt(image: ImageBitmap): Art {
  const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
  const cctx = c.getContext('2d', { willReadFrequently: true })!; cctx.drawImage(image, 0, 0);
  const pixels = cctx.getImageData(0, 0, c.width, c.height).data;
  let left = c.width, right = -1, top = c.height, bottom = -1, opaque = 0, skinCount = 0;
  const counts = Array(7).fill(0), countsSansSkin = Array(7).fill(0);
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) {
    const i = (y * c.width + x) * 4, r = pixels[i], g = pixels[i+1], b = pixels[i+2], a = pixels[i+3];
    if (a > 16) { left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = y; }
    if (a < 128) continue; opaque++;
    const skin = r > 165 && g > 90 && b > 65 && r > g * 1.12 && g > b * 1.04 && (r-g) < 110;
    if (skin) skinCount++;
    const hi = Math.max(r,g,b), lo = Math.min(r,g,b), d = hi-lo;
    if (hi < 65 || d/hi < .28) continue;
    let hue = hi === r ? ((g-b)/d)%6 : hi === g ? (b-r)/d+2 : (r-g)/d+4; hue = (hue*60+360)%360;
    let best=0, distance=Infinity;
    for (let k=0;k<primaryHues.length;k++) { const gap=Math.abs(hue-primaryHues[k]); const wrap=Math.min(gap,360-gap); if(wrap<distance){best=k;distance=wrap;} }
    counts[best]++; if(!skin) countsSansSkin[best]++;
  }
  let count = 0, winner = -1;
  for (let i=0;i<7;i++) { const n = opaque && skinCount/opaque >= .5 ? counts[i] : countsSansSkin[i]; if(n>count){winner=i;count=n;} }
  const crop = right < left ? {x:0,y:0,w:c.width,h:c.height} : {x:left,y:top,w:right-left+1,h:bottom-top+1};
  return { image:c, crop, primaryHue: winner < 0 ? null : primaryHues[winner] };
}
function hsvColor(h: number): string {
  const s=.9,v=.92,c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c; let rgb:[number,number,number];
  if(h<60)rgb=[c,x,0];else if(h<120)rgb=[x,c,0];else if(h<180)rgb=[0,c,x];else if(h<240)rgb=[0,x,c];else if(h<300)rgb=[x,0,c];else rgb=[c,0,x];
  return '#'+rgb.map(k=>Math.round((k+m)*255).toString(16).padStart(2,'0')).join('');
}
export function getCharacterColors(timeline: Timeline, arts: Map<number, Art>, manual: Map<number,string>): Map<number,string> {
  const result = new Map<number,string>();
  timeline.tracks.forEach((track,index)=>result.set(track.id,manual.get(track.id)||hsvColor(arts.get(track.id)?.primaryHue ?? primaryHues[index%primaryHues.length])));
  return result;
}
const contains=(parts:Track['parts'],t:number)=>parts.some(([a,b])=>a<=t&&t<b);
const alpha=(hex:string,a:number)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${Math.max(0,Math.min(1,a))})`;};
function hueOf(hex:string):number{const n=parseInt(hex.slice(1),16),r=(n>>16)/255,g=((n>>8)&255)/255,b=(n&255)/255,hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo;if(!d)return 0;let h=hi===r?((g-b)/d)%6:hi===g?(b-r)/d+2:(r-g)/d+4;return(h*60+360)%360;}
function sat(hex:string):string{return hsvColor(hueOf(hex));}
function lighten(hex:string):string{const n=parseInt(hex.slice(1),16),r=(n>>16)/255,g=((n>>8)&255)/255,b=(n&255)/255,hi=Math.max(r,g,b),lo=Math.min(r,g,b),l=(hi+lo)/2,d=hi-lo;let h=hueOf(hex),s=d?d/(1-Math.abs(2*l-1)):0;const nl=Math.max(.44,Math.min(.68,l+.12)),ns=Math.max(.76,Math.min(.98,s+.36)),c=(1-Math.abs(2*nl-1))*ns,x=c*(1-Math.abs((h/60)%2-1)),m=nl-c/2;let rgb:[number,number,number];if(h<60)rgb=[c,x,0];else if(h<120)rgb=[x,c,0];else if(h<180)rgb=[0,c,x];else if(h<240)rgb=[0,x,c];else if(h<300)rgb=[x,0,c];else rgb=[c,0,x];return '#'+rgb.map(k=>Math.round((k+m)*255).toString(16).padStart(2,'0')).join('');}
function text(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,size:number,color:string,align:CanvasTextAlign='left',weight=600){ctx.font=`${weight} ${size}px Pretendard, 'Pretendard Variable', 'Segoe UI', sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(value,x,y);}
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string){ctx.fillStyle=fill;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function curve(points:Note[4],time:number,shapeAware=true):number{
 if(!points.length)return 0;if(time<=points[0][0])return points[0][1];if(time>=points.at(-1)![0])return points.at(-1)![1];
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1];if(time>b[0])continue;let u=(time-a[0])/Math.max(1e-9,b[0]-a[0]);if(shapeAware){if(a[2]==='io')u=.5-.5*Math.cos(Math.PI*u);else if(a[2]==='i')u=1-Math.cos(Math.PI*u/2);else if(a[2]==='o')u=Math.sin(Math.PI*u/2);else if(a[2]==='sp')u=u*u*(3-2*u);}return a[1]+(b[1]-a[1])*u;}return 0;
}
function pitchDev(track:Track,t:number):number{const seg=track.pitchCurve.find(([a,b])=>a<=t&&t<=b);if(!seg||!seg[2].length)return 0;const points=seg[2];if(t<=points[0][0]||t>=points.at(-1)![0])return 0;for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1];if(t<=b[0]){const u=(t-a[0])/Math.max(1e-9,b[0]-a[0]);return a[1]+(b[1]-a[1])*u;}}return 0;}
function drawLyric(ctx:CanvasRenderingContext2D,lyric:string,x:number,y:number,w:number,h:number,scale:number){if(!lyric||w<12||h<7)return;const maxW=Math.max(1,w-Math.min(3,w*.16));let s=lyric,size=Math.max(6,Math.min(h*.92,Math.min(18,h*.68)*scale));ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineJoin='round';ctx.font=`700 ${size}px 'Segoe UI', sans-serif`;if(ctx.measureText(s).width>maxW){while(s.length>1&&ctx.measureText(s+'…').width>maxW)s=s.slice(0,-1);if(s.length<lyric.length)s+='…';}ctx.strokeStyle='#777';ctx.lineWidth=Math.max(1,Math.min(2,size*.1));ctx.strokeText(s,x+w/2,y+h/2);ctx.fillStyle='#fff';ctx.fillText(s,x+w/2,y+h/2);ctx.restore();}
function drawStanding(ctx:CanvasRenderingContext2D,state:RenderState,track:Track,x:number,ground:number,w:number,h:number,color:string,opacity:number,name:string,showName:boolean){ctx.globalAlpha=opacity;const art=state.arts.get(track.id);if(art){const scale=Math.min(w/art.crop.w,h/art.crop.h),drawH=art.crop.h*scale;ctx.drawImage(art.image,art.crop.x,art.crop.y,art.crop.w,art.crop.h,x-art.crop.w*scale/2,ground-drawH,art.crop.w*scale,drawH);}else{rounded(ctx,x-55,ground-h,110,h,22,'#22495e');ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,ground-h+48,25,0,Math.PI*2);ctx.fill();rounded(ctx,x-37,ground-h+88,74,h-104,24,color);text(ctx,String(track.id+1).padStart(2,'0'),x,ground-h+58,24,'#123045','center');}ctx.globalAlpha=1;if(showName)text(ctx,name,x,ground+18,17,'#173f59','center',650);}

export function renderFrame(ctx:CanvasRenderingContext2D,timeSeconds:number,dtSeconds:number,state:RenderState,settings:RenderSettings):void{
 const data=state.timeline,W=settings.width,H=settings.height,floorY=H*.84,headX=W*.9,guideEnd=W*.98,speed=Math.max(1,Math.floor(settings.trajectorySpeed));
 if(ctx.canvas.width!==W)ctx.canvas.width=W;if(ctx.canvas.height!==H)ctx.canvas.height=H;ctx.fillStyle=settings.bg;ctx.fillRect(0,0,W,H);
 if(!data){text(ctx,'USTX와 믹스 음원을 선택해 시작하세요',W/2,H*.47,38,'#315d78','center');text(ctx,'선택한 파일은 이 브라우저에서만 처리됩니다',W/2,H*.53,22,'#597586','center');return;}
 const t=timeSeconds-settings.offset,tracks=data.tracks;
 const solo=tracks.some(track=>track.solo);
 const states=tracks.map((track,i)=>{const enabled=!track.muted&&(!solo||track.solo),first=track.notes[0]?.[0]??0,last=track.notes.at(-1)?.[1]??0,inRange=t>=first&&t<last,active=enabled&&inRange&&contains(track.parts,t),note=enabled?track.notes.filter(n=>n[0]<=t&&t<n[1]):[];return {track,i,enabled,active,inRange,note,first,last,inRangeOpacity:1};});
 const active=states.filter(s=>s.active),sounding=active.flatMap(s=>s.note.map(n=>n[2]));let focus=sounding;
 if(!focus.length){const upcoming=states.flatMap(s=>s.enabled?s.track.notes.filter(n=>n[0]>=t&&n[0]<=t+2).map(n=>({start:n[0],tone:n[2]})):[]).sort((a,b)=>a.start-b.start);if(upcoming.length){const first=upcoming[0].start;focus=upcoming.filter(n=>n.start<=first+.12).map(n=>n.tone);}else focus=[data.pitchMin,data.pitchMax];}
 const targetLow=Math.min(...focus),targetHigh=Math.max(...focus),targetSpan=Math.max(24,Math.min(60,(targetHigh-targetLow+1)/.8)),targetCenter=(targetLow+targetHigh)/2,mix=1-Math.exp(-Math.max(0,dtSeconds)/3);
 if(state.pitchCenter===null){state.pitchCenter=targetCenter;state.pitchSpan=targetSpan;}else{state.pitchCenter+=(targetCenter-state.pitchCenter)*mix;state.pitchSpan!+=(targetSpan-state.pitchSpan!)*mix;}
 const viewMin=state.pitchCenter-state.pitchSpan!/2,viewMax=state.pitchCenter+state.pitchSpan!/2,gridHeight=(floorY-H*.02)*settings.pitchStepPercent/100,pitchStep=gridHeight/state.pitchSpan!,gridTop=(floorY-gridHeight)/2,py=(pitch:number)=>gridTop+(viewMax-pitch)*pitchStep;
 if(t<state.lastTime-.05){state.lastFlash.clear();state.lastSeen.clear();}
 if(t>=state.lastTime)for(const s of states)if(s.enabled)for(let i=0;i<s.track.notes.length;i++){const n=s.track.notes[i],prev=s.track.notes[i-1];if(n[0]>state.lastTime&&n[0]<=t&&(!prev||n[5]-prev[6]>.08))state.lastFlash.set(s.track.id,n[0]);}
 state.lastTime=t;
 const sorted=[...states].sort((a,b)=>a.track.pan-b.track.pan);
 const centered=sorted.length>1&&sorted.every(s=>Math.abs(s.track.pan-sorted[0].track.pan)<1);
 const xpos=(s:typeof states[number])=>settings.layout==='pan'&&!centered?W/2+Math.max(-100,Math.min(100,s.track.pan))*(W*.0043):W*.05+(sorted.indexOf(s)/Math.max(1,sorted.length-1))*W*.9;
 const pillarBounds=(s:typeof states[number])=>{const i=sorted.indexOf(s),x=xpos(s),l=i===0?0:(xpos(sorted[i-1])+x)/2,r=i===sorted.length-1?W:(x+xpos(sorted[i+1]))/2;return[l,r];};
 const main=(s:typeof states[number])=>s.active&&(contains([s.track.parts[0]],t)||active.length===1);
 const mains=[...new Set(states.filter(main).map(s=>settings.charName.get(s.track.id)||s.track.name))];
 if(settings.pitchGrid)for(let p=Math.ceil(viewMin);p<=viewMax;p++){const y=py(p);ctx.strokeStyle=p%12===0?'#526b7b55':'#7895a428';ctx.lineWidth=p%12===0?2:1;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
 for(const s of sorted){const flashTime=state.lastFlash.get(s.track.id)??-Infinity,flashAge=t-flashTime,color=state.colors.get(s.track.id)||defaultColors[s.i%defaultColors.length];if(!s.note.length&&flashAge>settings.flashDuration)continue;const [left,right]=pillarBounds(s),width=Math.max(0,right-left);ctx.fillStyle=alpha(color,main(s)?.52:.24);ctx.fillRect(left,0,width,floorY+4);if(flashAge>=0&&flashAge<settings.flashDuration){const p=Math.min(1,flashAge/settings.flashDuration),ease=p*p*(3-2*p),mix=.7*(1-ease),n=parseInt(color.slice(1),16),rgb=[n>>16,(n>>8)&255,n&255].map(c=>Math.round(c+(255-c)*mix));ctx.fillStyle=alpha('#'+rgb.map(c=>c.toString(16).padStart(2,'0')).join(''),(main(s)?.98:.82)*(1-p));ctx.fillRect(left,0,width,floorY+4);}}
 if(settings.currentTone)for(const s of states)for(const n of s.note)state.lastSeen.set(`${s.track.id}:${n[2]}`,{pitch:n[2],time:t,color:state.colors.get(s.track.id)||defaultColors[s.i%defaultColors.length]});
 for(const [id,entry] of state.lastSeen){const age=t-entry.time,fade=Math.max(0,1-age/settings.whiteFade);if(!fade){state.lastSeen.delete(id);continue;}const gradient=ctx.createLinearGradient(headX,0,guideEnd,0);gradient.addColorStop(0,alpha(entry.color,0));gradient.addColorStop(.12,alpha(entry.color,.86));gradient.addColorStop(.88,alpha(entry.color,.78));gradient.addColorStop(1,alpha(entry.color,0));ctx.globalAlpha=fade;ctx.fillStyle=gradient;ctx.fillRect(headX,py(entry.pitch)-pitchStep*.47,guideEnd-headX,Math.max(2,pitchStep*.08));ctx.globalAlpha=1;}
 if(settings.pitchNotes){const low=t-headX/speed,height=Math.max(8,pitchStep*.7),byPitch=new Map<number,{voice:{note:Note;track:Track;color:string};start:number;end:number}[]>();
  for(const s of sorted){if(!s.enabled)continue;for(const note of s.track.notes){if(note[0]>t)break;if(note[1]<low)continue;const v={note,track:s.track,color:state.colors.get(s.track.id)||defaultColors[s.i%defaultColors.length]};const arr=byPitch.get(note[2])||[];arr.push({voice:v,start:Math.max(low,note[0]),end:Math.min(t,note[1])});byPitch.set(note[2],arr);}}
  for(const [tone,notes] of byPitch){const edges=[...new Set(notes.flatMap(n=>[n.start,n.end]))].sort((a,b)=>a-b);for(let i=0;i<edges.length-1;i++){const start=edges[i],end=edges[i+1],mid=(start+end)/2,voices=[...new Map(notes.filter(n=>n.start<mid&&n.end>mid).map(n=>[n.voice.track.id,n.voice])).values()];if(!voices.length)continue;const x1=Math.max(0,headX+(start-t)*speed),x2=Math.min(headX,headX+(end-t)*speed),y=py(tone)-height/2,w=Math.max(2,x2-x1);if(x2<=x1)continue;if(voices.length===1){const edge=Math.min(7,w/2),g=ctx.createLinearGradient(x1,0,x1+w,0);if(edge<1){ctx.fillStyle=voices[0].color;}else{g.addColorStop(0,alpha(voices[0].color,0));g.addColorStop(edge/w,voices[0].color);g.addColorStop(1-edge/w,voices[0].color);g.addColorStop(1,alpha(voices[0].color,0));ctx.fillStyle=g;}ctx.fillRect(x1,y,w,height);}else{const g=ctx.createLinearGradient(x1,0,x2,0);voices.forEach((v,j)=>g.addColorStop(j/Math.max(1,voices.length-1),v.color));ctx.fillStyle=g;ctx.fillRect(x1,y,w,height);}drawLyric(ctx,[...new Set(voices.map(v=>v.note[3].trim()).filter(Boolean))].join(' · '),x1,y,w,height,settings.lyricScale);}}
  if(settings.pitchLine)drawPitchLines(ctx,t,low,speed,headX,py,pitchStep,data,sorted,state);
 }
 const octaves=[];if(settings.pitchGrid)for(let p=Math.ceil(viewMin/12)*12;p<=viewMax;p+=12)octaves.push([p,py(p)]);
 for(const [pitch,y] of octaves){const x=headX+W*.008;rounded(ctx,x,y-15,W*.036,25,4,'#ffffffdc');text(ctx,`C${pitch/12-1}`,x+4,y,Math.max(14,W*.01),'#345269');}
 ctx.fillStyle='#667f8d88';ctx.fillRect(headX-2,0,4,floorY-10);ctx.fillStyle='#fff';ctx.fillRect(headX-1,0,2,floorY-10);
 if(mains.length)text(ctx,`MAIN  ${mains.join(' · ')}`,W*.04,H*.08,Math.max(18,W*.015),'#315d78');
 for(const s of states)if(s.inRange){const fadeIn=Math.min(settings.standFadeIn,(s.last-s.first)/2),fadeOut=Math.min(settings.standFadeOut,(s.last-s.first)/2);let env=1;if(fadeIn>0)env=Math.min(env,Math.max(0,(t-s.first)/fadeIn));if(fadeOut>0)env=Math.min(env,Math.max(0,(s.last-t)/fadeOut));s.inRangeOpacity=env;}
 const drawOrder=[...states].sort((a,b)=>{const h=(s:typeof states[number])=>((H*.25+H*.13*(main(s)?1:0))*settings.characterSize*(settings.charSize.get(s.track.id)??1));return h(b)-h(a);});
 for(const s of drawOrder){if(!s.inRange)continue;const isMain=main(s),scale=settings.characterSize*(settings.charSize.get(s.track.id)??1),grow=isMain?1.5:1,h=H*.25*scale*grow,w=H*.15*scale*grow,x=xpos(s),ground=floorY-(settings.charBottom.get(s.track.id)??0),color=state.colors.get(s.track.id)||defaultColors[s.i%defaultColors.length],op=(isMain?settings.mainOpacity:s.active?settings.nonMainOpacity:settings.backgroundOpacity)*(s.inRangeOpacity??0);drawStanding(ctx,state,s.track,x,ground,w,h,color,op,settings.charName.get(s.track.id)||s.track.name,settings.showNames);}
 if(settings.showNames){text(ctx,data.title,W*.04,H*.12,Math.max(15,W*.012),'#345d74');text(ctx,tracks.length+' VOICES / ONE SKY',W*.04,H*.145,Math.max(12,W*.008),'#567587');}
}

function drawPitchLines(ctx:CanvasRenderingContext2D,t:number,low:number,speed:number,headX:number,py:(p:number)=>number,pitchStep:number,data:Timeline,sorted:{track:Track;i:number;enabled:boolean}[],state:RenderState){
 const byTrack=sorted.filter(s=>s.enabled).map(s=>({track:s.track,color:state.colors.get(s.track.id)||defaultColors[s.i%defaultColors.length],notes:s.track.notes.filter(n=>n[1]>=low&&n[0]<=t)}));
 for(const group of byTrack){const paths:{notes:Note[]}[]=[];let path:Note[]=[];for(const n of group.notes){const prev=path.at(-1);if(prev&&n[5]-prev[6]>data.resolution){paths.push({notes:path});path=[];}path.push(n);}if(path.length)paths.push({notes:path});
  for(const p of paths){const first=p.notes[0],last=p.notes.at(-1)!;ctx.save();ctx.beginPath();ctx.rect(Math.max(0,headX+(first[0]-t)*speed),0,Math.max(0,Math.min(headX,headX+(last[1]-t)*speed)-Math.max(0,headX+(first[0]-t)*speed)),10000);ctx.clip();ctx.beginPath();let drawing=false,prevPitch=0,prevTime=0;
    for(let k=0;k<p.notes.length;k++){const n=p.notes[k],from=Math.max(low,n[0]),to=Math.min(t,n[1]);if(to<=from)continue;const gapFrom=from-n[0];if(drawing&&gapFrom>0){ctx.moveTo(headX+(prevTime-t)*speed,py(prevPitch));ctx.lineTo(headX+(from-t)*speed,py(n[2]+curve(n[4],from,true)+pitchDev(group.track,from)));}
      const count=Math.max(2,Math.min(1000,Math.ceil((to-from)*speed/3)));for(let j=0;j<=count;j++){const time=from+(to-from)*j/count,pitch=n[2]+curve(n[4],time,true)+pitchDev(group.track,time),x=headX+(time-t)*speed;if(!drawing){ctx.moveTo(x,py(pitch));drawing=true;}else ctx.lineTo(x,py(pitch));prevPitch=pitch;prevTime=time;}}
    ctx.strokeStyle=sat(group.color);ctx.lineWidth=Math.max(2,Math.min(3.6,pitchStep*.06));ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke();ctx.restore();
  }
 }
}
