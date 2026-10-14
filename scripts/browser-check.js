// Isolated browser smoke test: all Firebase calls use in-memory fixtures.
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname,'..');
const mock = `
const state = {user:null,callback:null,listeners:{},matches:[{id:'fixture',teamA:'T1',teamB:'G2',series:'BO3',startTime:new Date('2026-10-20T14:00:00Z'),result:null,status:'not_started'}],picks:[],users:[]};
window.mockState = state;
export const initializeApp = () => ({}), getAuth = () => ({}), getFirestore = () => ({});
export class GoogleAuthProvider {}
export const collection = (_,path) => path, doc = (_,path,id) => path+'/'+id, query = x => x, where = () => null;
export const serverTimestamp = () => new Date();
const snap = path => path.includes('/') ? {exists:()=>false,data:()=>null} : {docs:state[path].map(d => ({id:d.id,data:()=>d}))};
function emit(path) {state.listeners[path]?.(snap(path));}
export const onSnapshot = (path,cb) => {state.listeners[path]=cb;queueMicrotask(()=>cb(snap(path)));return ()=>delete state.listeners[path];};
export const onAuthStateChanged = (_,cb) => {state.callback=cb;queueMicrotask(()=>cb(null));};
export async function signInWithPopup() {state.user={uid:'friend',displayName:'Test Friend'};await state.callback(state.user);}
export async function signOut() {state.user=null;await state.callback(null);}
export async function setDoc(path,data) {if(path.startsWith('users/')){state.users=[{id:'friend',...data}];emit('users');}}
export async function addDoc() {throw Error('Unexpected production write');}
export async function runTransaction(_,action) {await action({get:async()=>({exists:()=>true,data:()=>state.matches[0]}),set:(_,data)=>{state.picks=[data];queueMicrotask(()=>emit('picks'));}});}
`;
const server = createServer(async (req,res) => {
  try {
    const name = new URL(req.url,'http://localhost').pathname;
    if (name === '/mock-firebase.js') {res.writeHead(200,{'Content-Type':'text/javascript'});res.end(mock);return;}
    const file = resolve(root,'.'+(name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) {res.writeHead(403);res.end();return;}
    const body = await readFile(file);
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[extname(file)] || 'application/octet-stream'});res.end(body);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1100}});
  const errors = [];page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-19T12:00:00Z')});
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.route('https://www.gstatic.com/firebasejs/**',route=>route.fulfill({contentType:'text/javascript',body:`export * from '${url}/mock-firebase.js';`,headers:{'Access-Control-Allow-Origin':'*'}}));
  await page.goto(url);
  await page.getByRole('button',{name:'T1',exact:true}).waitFor();
  assert.equal(await page.locator('.match').count(),1);
  await page.getByRole('button',{name:'Sign in with Google'}).click();
  await page.getByRole('button',{name:'Sign out'}).waitFor();
  await page.getByRole('button',{name:'T1',exact:true}).click();
  await page.getByLabel('Exact series score').selectOption('2-1');
  await page.getByRole('button',{name:'Save pick',exact:true}).click();
  await page.getByText('Saved: T1 · 2-1',{exact:true}).waitFor();
  assert.equal(await page.locator('#stat-picks').textContent(),'1');
  await mkdir(resolve(root,'test-results'),{recursive:true});
  await page.screenshot({path:resolve(root,'test-results/desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,'Mobile page must not overflow');
  await page.screenshot({path:resolve(root,'test-results/mobile.png'),fullPage:true});
  await page.clock.setSystemTime(new Date('2026-10-20T14:00:01Z'));
  await page.clock.runFor(1000);
  await page.getByText('Locked · awaiting result',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Update pick',exact:true}).count(),0);
  await page.evaluate(()=>{window.mockState.matches[0].result='A';window.mockState.matches[0].resultScore='2-1';window.mockState.matches[0].status='finished';window.mockState.listeners.matches({docs:window.mockState.matches.map(d=>({id:d.id,data:()=>d}))});});
  await page.getByRole('button',{name:'Results',exact:true}).click();
  await page.getByText('Your pick: T1 · 2-1 · +2 points',{exact:true}).waitFor();
  assert.equal(await page.locator('#stat-points').textContent(),'2');
  assert.deepEqual(errors,[]);
  console.log('Browser check passed: sign-in, save, mobile layout, automatic lock, final scoring; no live Firebase writes.');
} finally {await browser?.close();server.close();}
