// Translation providers receive text only. Timing remains owned by the editor.
// A future provider should call your backend proxy. Never embed a service API key in this site.
const providers=new Map();
export function registerTranslationProvider(id,provider){
  if(!id||typeof provider.translate!=='function')throw Error('Invalid translation provider');
  providers.set(id,provider);
}
export async function translateCues(id,cues,{source='auto',target='ko',signal}={}){
  const provider=providers.get(id);if(!provider)throw Error('번역 제공자가 연결되지 않았습니다.');
  const texts=await provider.translate(cues.map(c=>c.text),{source,target,signal});
  if(!Array.isArray(texts)||texts.length!==cues.length||texts.some(t=>typeof t!=='string'||!t.trim()))throw Error('번역 응답의 자막 수 또는 내용이 올바르지 않습니다.');
  return cues.map((cue,i)=>({...cue,text:texts[i]}));
}
