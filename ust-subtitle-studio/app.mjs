import {parseUSTX} from './ustx.mjs';
import {decodeUST,parseUST,makeCues,serialize} from './core.mjs';
const $=id=>document.getElementById(id);
let source=null,buffer=null,cues=[],baseName='subtitles',audioUrl=null,sourceFormat='ust';
const demo='[#VERSION]\nUST Version1.2\n[#SETTING]\nTempo=120\nProjectName=작은 노래\n[#0000]\nLength=480\nLyric=R\n[#0001]\nLength=480\nLyric=き\n[#0002]\nLength=480\nLyric=み\n[#0003]\nLength=480\nLyric=の\n[#0004]\nLength=960\nLyric=声\n[#0005]\nLength=480\nLyric=R\n[#0006]\nLength=480\nLyric=空\nTempo=90\n[#0007]\nLength=480\nLyric=へ\n[#0008]\nLength=960\nLyric=届く\n[#TRACKEND]';
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':'';}
function guarded(fn){try{fn();}catch(e){status(e.message,true);}}
function options(){const gap=Number($('gap').value),maxDuration=Number($('maxDuration').value);if(!Number.isFinite(gap)||gap<0||!Number.isFinite(maxDuration)||maxDuration<=0)throw Error('분리 기준과 최대 길이를 확인하세요.');return {gap,maxDuration,mode:$('mode').value,separator:$('separator').value,clean:$('clean').checked};}
function parseSource(bytes){const text=decodeUST(bytes,$('encoding').value);return sourceFormat==='ustx'?parseUSTX(text):parseUST(text);}
function trackOptions(){const tracks=source?.tracks||[];$('trackLabel').hidden=!tracks.length;$('track').replaceChildren(...tracks.map(t=>new Option(t.name,String(t.id))));}
function rebuild(){if(!source)return;cues=makeCues(source.notes,options());render();status(`${source.title} · 자막 ${cues.length}개 생성${source.warnings.length?' · '+source.warnings.join(' '):''}`);}
async function loadFile(file){if(!file)return;if(!/\.ustx?$/i.test(file.name)){status('.ust 또는 .ustx 파일을 선택하세요.',true);return;}if(file.size>10*1024*1024){status('10 MB 이하의 UST 파일을 선택하세요.',true);return;}try{const next=await file.arrayBuffer();sourceFormat=/\.ustx$/i.test(file.name)?'ustx':'ust';const parsed=parseSource(next);buffer=next;source=parsed;baseName=file.name.replace(/\.ustx?$/i,'');$('filename').textContent=file.name;trackOptions();rebuild();}catch(e){status(e.message,true);}}
function render(){
  $('rows').replaceChildren();$('empty').hidden=cues.length>0;$('rebuild').disabled=!source;$('srt').disabled=$('vtt').disabled=!cues.length;
  $('stats').textContent=`자막 ${cues.length}개 · 악보 ${source?.duration.toFixed(2)||0}초`;
  cues.forEach((cue,i)=>{
    const row=document.createElement('div');row.className='cue';const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');row.append(number);
    for(const [key,title] of [['start','시작 (초)'],['end','끝 (초)'],['text','가사']]){
      const label=document.createElement('label');label.textContent=title;if(key==='text')label.className='lyric';
      const input=document.createElement(key==='text'?'textarea':'input');if(key!=='text'){input.type='number';input.step='.001';input.min='0';}
      input.value=key==='text'?cue.text:cue[key].toFixed(3);input.setAttribute('aria-label',`${i+1}번 ${title}`);
      input.addEventListener('input',()=>{cue[key]=key==='text'?input.value:input.value===''?NaN:Number(input.value);preview();});label.append(input);row.append(label);
    }
    const remove=document.createElement('button');remove.textContent='×';remove.title=`${i+1}번 자막 삭제`;remove.setAttribute('aria-label',remove.title);remove.onclick=()=>{cues.splice(i,1);render();};row.append(remove);$('rows').append(row);
  });preview();
}
function preview(){
  const offset=Number($('offset').value)||0,time=Number($('seek').value),max=Math.max(1,source?.duration||0,...cues.map(c=>Number.isFinite(c.end)?c.end+offset:0));$('seek').max=max;
  const i=cues.findIndex(c=>c.start+offset<=time&&time<c.end+offset);$('caption').textContent=i>=0?cues[i].text:'♪';$('time').textContent=time.toFixed(2)+'초';
  [...$('rows').children].forEach((row,n)=>row.classList.toggle('active',i===n));
}
function download(format){guarded(()=>{if(!cues.length)throw Error('먼저 UST를 불러오세요.');if($('offset').value==='')throw Error('시간 보정값을 입력하세요.');const text=serialize(cues,format,Number($('offset').value));const url=URL.createObjectURL(new Blob([text],{type:format==='vtt'?'text/vtt;charset=utf-8':'application/x-subrip;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=baseName+'.'+format;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status(`${a.download} 다운로드를 시작했습니다.`);});}
$('file').onchange=()=>loadFile($('file').files[0]);
$('encoding').onchange=()=>guarded(()=>{if(!buffer)return;if(cues.length&&!confirm('인코딩을 변경하면 편집한 자막이 다시 생성됩니다. 계속할까요?'))return;const next=parseSource(buffer);source=next;trackOptions();rebuild();});
$('demo').onclick=()=>guarded(()=>{if(cues.length&&!confirm('현재 편집 내용을 예제로 바꿀까요?'))return;sourceFormat='ust';buffer=new TextEncoder().encode(demo).buffer;source=parseUST(demo);baseName='sample';$('filename').textContent='예제 · 작은 노래';trackOptions();rebuild();});
$('rebuild').onclick=()=>guarded(()=>{if(cues.length&&!confirm('편집한 가사와 시간을 원본 UST 기준으로 다시 생성할까요?'))return;rebuild();});
$('srt').onclick=()=>download('srt');$('vtt').onclick=()=>download('vtt');$('offset').oninput=preview;
$('seek').oninput=()=>{if(audioUrl)$('audio').currentTime=Number($('seek').value);preview();};
$('audioFile').onchange=()=>{const file=$('audioFile').files[0];if(!file)return;if(audioUrl)URL.revokeObjectURL(audioUrl);audioUrl=URL.createObjectURL(file);$('audio').src=audioUrl;};
$('audio').ontimeupdate=()=>{$('seek').value=$('audio').currentTime;preview();};
for(const type of ['dragenter','dragover'])$('drop').addEventListener(type,e=>{e.preventDefault();$('drop').classList.add('over');});
$('drop').ondragleave=()=>$('drop').classList.remove('over');$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('over');loadFile(e.dataTransfer.files[0]);};

$('track').onchange=()=>guarded(()=>{const track=source?.tracks?.find(t=>String(t.id)===$('track').value);if(track){source.notes=track.notes;rebuild();}});
