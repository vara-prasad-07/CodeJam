import {vi} from 'vitest';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(window,'matchMedia',{value:vi.fn(()=>({matches:true,addEventListener(){},removeEventListener(){}})),configurable:true});
HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
HTMLElement.prototype.scrollBy=vi.fn();
Object.defineProperty(navigator,'clipboard',{value:{writeText:vi.fn().mockResolvedValue(undefined)},configurable:true});
