import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, inMemoryPersistence, setPersistence } from 'firebase/auth';
const button=document.getElementById('google') as HTMLButtonElement;
const error=document.getElementById('error')!;
const ticket=location.hash.slice(1);history.replaceState(null,'',location.pathname);
button.addEventListener('click',async()=>{
 button.disabled=true;error.hidden=true;
 try{
  if(!ticket){throw new Error('Start Google sign-in from the CodeJam extension.');}
  const response=await fetch('/auth/config');const config=await response.json();const auth=getAuth(initializeApp(config));await setPersistence(auth,inMemoryPersistence);
  const account=await signInWithPopup(auth,new GoogleAuthProvider());const idToken=await account.user.getIdToken();
  const result=await fetch('/auth/browser/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ticket,idToken})});const data=await result.json();if(!result.ok){throw new Error(data.error||'Sign-in failed.');}
  document.getElementById('success')!.hidden=false;button.hidden=true;
 }catch(e){const code=(e as {code?:string}).code;error.textContent=code==='auth/unauthorized-domain'?'Add localhost to Firebase Authentication → Settings → Authorized domains, then retry.':code==='auth/popup-closed-by-user'?'The Google window was closed. Click again to retry.':(e as Error).message;error.hidden=false;button.disabled=false;}
});
