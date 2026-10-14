// Fictional, in-memory fixtures for inspecting the design without any setup.
const future = new Date(); future.setDate(future.getDate()+1); future.setHours(14,0,0,0);
const fixtures = [
  {id:'preview-1',teamA:'T1',teamB:'G2',series:'BO3',stage:'Sample matchup',startTime:new Date(future),result:null,status:'not_started'},
  {id:'preview-2',teamA:'Gen.G',teamB:'BLG',series:'BO5',stage:'Sample matchup',startTime:new Date(+future+86400000),result:null,status:'not_started'},
  {id:'preview-3',teamA:'FLY',teamB:'FNC',series:'BO3',stage:'Sample result',startTime:new Date(+future-3*86400000),result:'A',resultScore:'2-1',status:'finished'}
];
const data = {matches:fixtures,users:[{id:'alex',displayName:'Alex'},{id:'sam',displayName:'Sam'},{id:'jo',displayName:'Jo'}],picks:[{id:'alex_preview-3',userId:'alex',matchId:'preview-3',pick:'A',exactScore:'2-1'},{id:'sam_preview-3',userId:'sam',matchId:'preview-3',pick:'A'},{id:'jo_preview-3',userId:'jo',matchId:'preview-3',pick:'B'}]};
const listeners = new Map(); let authCallback;
export const initializeApp = () => ({}), getAuth = () => ({}), getFirestore = () => ({});
export class GoogleAuthProvider {}
export const collection = (_,path) => path, doc = (_,path,id) => `${path}/${id}`, query = path => path, where = () => null;
export const serverTimestamp = () => new Date();
function snapshot(path) { const [group,id] = path.split('/'); const value = data[group]?.find(row => row.id === id); return id ? {exists:()=>!!value,data:()=>value} : {docs:(data[group] || []).map(row=>({id:row.id,data:()=>({...row})}))}; }
function emit(path) { listeners.get(path)?.(snapshot(path)); listeners.get(path.split('/')[0])?.(snapshot(path.split('/')[0])); }
export function onSnapshot(path, callback) {listeners.set(path,callback);queueMicrotask(()=>callback(snapshot(path)));return ()=>listeners.delete(path);}
export function onAuthStateChanged(_,callback) {authCallback=callback;queueMicrotask(()=>callback(null));}
export async function signInWithPopup() {await authCallback({uid:'you',displayName:'You'});}
export async function signOut() {await authCallback(null);}
export async function setDoc(path,value,options) {const [group,id]=path.split('/');data[group] ||= [];const index=data[group].findIndex(r=>r.id===id);const row={...(options?.merge && index>=0 ? data[group][index] : {}),...value,id};if(index>=0)data[group][index]=row;else data[group].push(row);emit(path);}
export async function addDoc(path,value) {await setDoc(`${path}/${crypto.randomUUID()}`,value);}
export async function runTransaction(_,action) {await action({get:async path=>snapshot(path),set:(path,value)=>setDoc(path,value)});}
