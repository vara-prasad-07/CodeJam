import { applicationDefault } from 'firebase-admin/app';

﻿export const encodeValue = value => {
 if (value === null) { return {nullValue:null}; }
 if (typeof value === 'string') { return {stringValue:value}; }
 if (typeof value === 'boolean') { return {booleanValue:value}; }
 if (typeof value === 'number') { return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value}; }
 if (Array.isArray(value)) { return {arrayValue:{values:value.filter(v=>v!==undefined).map(encodeValue)}}; }
 if (value && typeof value === 'object') { return {mapValue:{fields:encodeFields(value)}}; }
 throw new Error('Unsupported Firestore value.');
};
export const encodeFields = object => Object.fromEntries(Object.entries(object).filter(([k,v])=>k!=='_version'&&v!==undefined).map(([k,v])=>[k,encodeValue(v)]));
export const decodeValue = value => {
 if ('nullValue' in value) { return null; }
 if ('stringValue' in value) { return value.stringValue; }
 if ('booleanValue' in value) { return value.booleanValue; }
 if ('integerValue' in value) { return Number(value.integerValue); }
 if ('doubleValue' in value) { return value.doubleValue; }
 if ('timestampValue' in value) { return value.timestampValue; }
 if ('arrayValue' in value) { return (value.arrayValue.values||[]).map(decodeValue); }
 if ('mapValue' in value) { return decodeFields(value.mapValue.fields||{}); }
 return null;
};
export const decodeFields = fields => Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,decodeValue(v)]));
// Admin credentials authenticate through IAM; Firestore client rules can deny all access.
// Cache short-lived OAuth tokens and share refreshes across concurrent requests.
export function createAdminTokenProvider({credential,clock=Date.now}={}) {
 let cached,refreshing;
 const unavailable=()=>{const e=new Error('Firebase Admin credentials unavailable. Set GOOGLE_APPLICATION_CREDENTIALS to the private service-account JSON file on the backend.');e.status=503;return e;};
 return async()=>{
  if(cached&&cached.until-clock()>60000){return cached.token;}
  if(!refreshing){refreshing=(async()=>{
   try{
    credential ||= applicationDefault();
    const result=await credential.getAccessToken();
    if(typeof result.access_token!=='string'||!result.access_token||!(Number(result.expires_in)>0)){throw unavailable();}
    cached={token:result.access_token,until:clock()+Number(result.expires_in)*1000};return cached.token;
   }catch{throw unavailable();}
  })().finally(()=>{refreshing=undefined;});}
  return refreshing;
 };
}
export function createFirestoreStore({projectId=process.env.FIREBASE_PROJECT_ID||process.env.projectId||process.env.GOOGLE_CLOUD_PROJECT,getAccessToken=createAdminTokenProvider(),fetchImpl=fetch}={}) {
 if (!projectId) { throw new Error('Set FIREBASE_PROJECT_ID (or projectId) to the Firebase project containing your database.'); }
 const base=`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
 const clean = resource => {if(!/^[\w/-]+$/.test(resource)||resource.includes('..')){throw new Error('Invalid database resource.');}return resource;};
 const decode = doc => ({...decodeFields(doc.fields||{}),_version:doc.updateTime});
 async function request(suffix,method='GET',body,query={}) {
  const url=new URL(base+suffix);for(const[k,v]of Object.entries(query)){url.searchParams.set(k,v);}
  const bearer=await getAccessToken();
  if(typeof bearer!=='string'||!bearer){const e=new Error('Firebase Admin did not provide an access token.');e.status=503;throw e;}
  let response;try{response=await fetchImpl(url,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{const e=new Error('Firestore is unreachable. Check the network and retry.');e.status=503;throw e;}
  const result=await response.json().catch(()=>({}));
  if(response.status===404){return null;}
  if(!response.ok){const e=new Error(`Firestore ${result.error?.status||response.status}. Check the configured project and database access.`);const conflict=response.status===409||response.status===412||(result.error?.status==='FAILED_PRECONDITION'&&Object.hasOwn(query,'currentDocument.updateTime'));e.status=conflict?409:503;throw e;}
  return result;
 }
 return {
  kind:'firestore',access:'server-iam',
  async get(collection,id){const result=await request('/'+clean(collection)+'/'+clean(id));return result?decode(result):null;},
  async put(collection,id,value,version){const query=version?{'currentDocument.updateTime':version}:{};const result=await request('/'+clean(collection)+'/'+clean(id),'PATCH',{fields:encodeFields(value)},query);return decode(result);},
  async remove(collection,id){await request('/'+clean(collection)+'/'+clean(id),'DELETE');},
  async list(collection,filter){
   const parts=clean(collection).split('/'),collectionId=parts.pop(),parent=parts.length?'/'+parts.join('/'):'';
   const query={from:[{collectionId}],...(filter?{where:{fieldFilter:{field:{fieldPath:filter.field},op:filter.op||'EQUAL',value:encodeValue(filter.value)}}}:{}),limit:500};
   const result=await request(parent+':runQuery','POST',{structuredQuery:query});return (result||[]).filter(row=>row.document).map(row=>decode(row.document));
  },
 };
}

// Isolated unit-test adapter; never selected automatically by the application.
export function createMemoryStore(){const rows=new Map();let serial=0;return {kind:'test-memory',async get(c,id){return structuredClone(rows.get(c+'/'+id)||null);},async put(c,id,value,version){const old=rows.get(c+'/'+id);if(version&&old?._version!==version){const e=new Error('Conflict');e.status=409;throw e;}const row={...structuredClone(value),_version:String(++serial)};rows.set(c+'/'+id,row);return structuredClone(row);},async remove(c,id){rows.delete(c+'/'+id);},async list(c,filter){return [...rows].filter(([key])=>key.startsWith(c+'/')&&!key.slice(c.length+1).includes('/')).map(([,value])=>structuredClone(value)).filter(value=>!filter||(filter.op==='ARRAY_CONTAINS'?value[filter.field]?.includes(filter.value):value[filter.field]===filter.value));}};}
