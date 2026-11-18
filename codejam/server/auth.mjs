export function createFirebaseAuth({apiKey=process.env.FIREBASE_API_KEY||process.env.apiKey,fetchImpl=fetch}={}){
 async function call(method,payload){
  if(!apiKey){const e=new Error('Firebase apiKey is missing.');e.status=503;throw e;}
  const response=await fetchImpl('https://identitytoolkit.googleapis.com/v1/accounts:'+method+'?key='+encodeURIComponent(apiKey),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok){const code=data.error?.message?.split(' : ')[0];const errors={EMAIL_EXISTS:'This email is already registered.',INVALID_LOGIN_CREDENTIALS:'Email or password is incorrect.',EMAIL_NOT_FOUND:'Email or password is incorrect.',INVALID_PASSWORD:'Email or password is incorrect.',OPERATION_NOT_ALLOWED:'Enable this sign-in provider in Firebase Authentication.',TOO_MANY_ATTEMPTS_TRY_LATER:'Too many attempts. Try again later.',WEAK_PASSWORD:'Choose a password with at least 6 characters.',INVALID_ID_TOKEN:'Google sign-in expired. Please retry.'};const e=new Error(errors[code]||'Firebase sign-in failed. Check your account details and retry.');e.status=400;throw e;}return data;
 }
 return {
  async password(mode,{email,password,name}){
   if(typeof email!=='string'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||typeof password!=='string'||password.length<6||password.length>256){const e=new Error('Enter a valid email and a password of at least 6 characters.');e.status=400;throw e;}
   const data=await call(mode==='signup'?'signUp':'signInWithPassword',{email,password,returnSecureToken:true});
   if(mode==='signup'&&name){await call('update',{idToken:data.idToken,displayName:name,returnSecureToken:false});}
   return {uid:data.localId,email:data.email,name:mode==='signup'?name:data.displayName};
  },
  async google(idToken){if(typeof idToken!=='string'||idToken.length>10000){throw new Error('Invalid Google sign-in token.');}const data=await call('lookup',{idToken});const user=data.users?.[0];if(!user||user.disabled){const e=new Error('Google sign-in could not be verified.');e.status=401;throw e;}return {uid:user.localId,email:user.email,name:user.displayName};},
 };
}
