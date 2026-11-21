import { NCEngine, TranslateHandler, TranslateMessageParam, TranslateStatus } from '@nexconn/chat';

export const languages = {en:'English',hi:'Hindi',te:'Telugu'} as const;
export function validLanguage(value:unknown): value is keyof typeof languages { return typeof value==='string' && Object.hasOwn(languages,value); }

// Resolve only matching callbacks; never forward a translation as a chat message.
export function createTranslator(timeoutMs=18000) {
 const pending = new Map<string,{resolve(value:unknown):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>}>();
 const finish=(key:string,error?:Error,value?:unknown)=>{
  const job=pending.get(key);if(!job){return;}clearTimeout(job.timer);pending.delete(key);
  if(error){job.reject(error);}else{job.resolve(value);}
 };
 return {
  install(){NCEngine.addTranslateHandler('codejam-private-translations',new TranslateHandler({onTranslationCompleted({results}){
   for(const item of results){
    const language=item.translateInfo?.targetLanguage;
    if(!validLanguage(language)){if(item.code!==0){for(const key of pending.keys()){if(JSON.parse(key)[0]===item.identifier){finish(key,new Error(`Nexconn translation failed (code ${item.code}). Check translation access and retry.`));}}}continue;}
    const key=JSON.stringify([item.identifier,language]);
    if(item.code!==0||item.translateInfo?.status===TranslateStatus.FAILED){finish(key,new Error(`Nexconn translation failed (code ${item.code}). Check translation access in the Nexconn console and retry.`));continue;}
    if(item.translateInfo?.status===TranslateStatus.SUCCESS){
     const text=item.translateInfo.translatedText;
     if(typeof text!=='string'||!text.trim()||text.length>24000){finish(key,new Error('Nexconn returned an empty or oversized translation. Retry.'));}
     else{finish(key,undefined,{text,language});}
    }
   }
  }}));},
  cancel(){for(const key of pending.keys()){finish(key,new Error('Translation canceled because the chat session changed.'));}},
  async translate(input:{id:string;text:string;language:string}){
   if(!validLanguage(input.language)||typeof input.id!=='string'||!input.id||typeof input.text!=='string'||!input.text.trim()||input.text.length>12000){throw new Error('Choose English, Hindi or Telugu and a message containing text.');}
   const key=JSON.stringify([input.id,input.language]);
   if(pending.has(key)){throw new Error('This message is already being translated into that language.');}
   return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(key,new Error('Translation timed out. Check Nexconn translation access and retry.')),timeoutMs);
    pending.set(key,{resolve,reject,timer});
    void NCEngine.translateModule.translateMessages({list:[new TranslateMessageParam(input.id,'auto',input.language,input.text)],force:false}).then(result=>{
     if(!result.isOk){finish(key,new Error(`Nexconn could not translate this message (code ${result.code}). Check translation access and supported languages in the Nexconn console.`));}
    },()=>finish(key,new Error('Nexconn translation is unavailable. Reconnect and retry.')));
   });
  },
 };
}
