import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import App from './App.jsx';
import {normalizeMetrics,chartGeometry} from './metrics.js';
import {media,productViews} from './content.js';
const fixture=JSON.parse(fs.readFileSync(path.resolve('public/data/marketplace.json'),'utf8'));
let host,root;
beforeEach(async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>fixture}));host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>{root.render(<App/>);});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const button=label=>[...host.querySelectorAll('button')].find(b=>b.textContent===label||b.getAttribute('aria-label')===label);
async function click(el){await act(async()=>el.click());}
describe('real data and assets',()=>{
 it('imports the report accurately',()=>{expect(fixture.dailyAcquisition).toHaveLength(4);expect(fixture.report).toMatchObject({installs:5,pageViews:15,start:'2026-11-19',end:'2026-11-22'});expect(fixture.history.map(p=>p.installs)).toEqual([4,5,5,5]);});
 it('rejects invalid counts and keeps zero charts finite',()=>{const d=normalizeMetrics({installs:-1,history:[{date:'2026-11-22',installs:-2}]});expect(d.installs).toBeNull();expect(d.history).toEqual([]);expect(Number.isFinite(chartGeometry([{date:'2026-11-22',installs:0}]).points[0].y)).toBe(true);});
 it('connects supplied videos and screenshots',()=>{for(const asset of [media.demo.src,media.demo.poster,media.install.src,media.install.poster,...productViews.map(p=>p.image)])expect(fs.existsSync(path.resolve('public',asset.slice(1)))).toBe(true);});
 it('switches the three report views',async()=>{expect(host.querySelector('.acquisition-chart svg').getAttribute('aria-label')).toContain('2026-11-19: 4');await click(button('Daily installs'));expect(host.querySelector('.acquisition-chart svg').getAttribute('aria-label')).toContain('2026-11-22: 0');await click(button('Page views'));expect(host.querySelector('.acquisition-chart svg').getAttribute('aria-label')).toContain('2026-11-19: 7');expect(host.querySelector('.acquisition-chart svg').getAttribute('aria-label')).toContain('2026-11-22: 4');});
});
describe('product interactions',()=>{
 it('supports keyboard feature tabs',async()=>{await act(async()=>host.querySelector('[role=tab]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));expect(host.querySelector('[role=tab][aria-selected=true]').textContent).toBe('Shared code');expect(document.activeElement.id).toBe('tab-code');expect(host.querySelector('[role=tabpanel] img').getAttribute('src')).toBe('/assets/shared-code.png');});
 it('switches NexConn services',async()=>{await click([...host.querySelectorAll('.service-button')].find(b=>b.textContent.includes('Audio huddles')));expect(host.querySelector('.service-detail h3').textContent).toBe('Some things are easier to say.');expect(host.querySelector('.service-detail img').getAttribute('src')).toBe('/assets/huddel_snap.png');});
 it('plays the demo and restores focus on close',async()=>{const launch=button('Watch the demo');launch.focus();await click(launch);expect(host.querySelector('dialog[open] video').getAttribute('src')).toBe('/videos/demo.mp4');expect(document.body.style.overflow).toBe('hidden');await click(button('Close viewer'));expect(host.querySelector('dialog')).toBeNull();expect(document.activeElement).toBe(launch);expect(document.body.style.overflow).toBe('');});
 it('enlarges screenshots',async()=>{await click(button('Enlarge Team chat screenshot'));expect(host.querySelector('dialog img').getAttribute('src')).toBe('/assets/chat_snap.png');});
 it('copies the extension command',async()=>{await click(button('Copy installation command'));expect(navigator.clipboard.writeText).toHaveBeenCalledWith('code --install-extension CodeJam.codejam-workspace');expect(host.querySelector('[role=status]').textContent).toContain('Command copied');});
 it('closes mobile navigation after selection',async()=>{await click(button('Open navigation'));expect(host.querySelector('#mobile-navigation')).not.toBeNull();await click(host.querySelector('#mobile-navigation a'));expect(host.querySelector('#mobile-navigation')).toBeNull();});
 it('includes six use cases before the footer',()=>{expect(host.querySelectorAll('.team-card')).toHaveLength(6);expect(host.querySelector('.team-section').compareDocumentPosition(host.querySelector('footer'))&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();});
});
