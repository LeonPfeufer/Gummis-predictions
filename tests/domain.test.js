import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocked, scoreOptions, pointsFor, standings } from '../domain.js';
import { normalizeMatch, reconcile } from '../scripts/normalize-match.js';
const raw = () => ({id:123,tournament_id:55,begin_at:'2026-10-20T14:00:00Z',status:'not_started',number_of_games:3,opponents:[{opponent:{id:1,name:'Team One',acronym:'ONE'}},{opponent:{id:2,name:'Team Two',acronym:'TWO'}}],results:[]});
test('picks lock at start, invalid dates, live, postponed, canceled and completed matches', () => {
  const m = {startTime:'2026-10-20T14:00:00Z'};
  assert.equal(isLocked(m,+new Date(m.startTime)-1),false);
  assert.equal(isLocked(m,+new Date(m.startTime)),true);
  assert.equal(isLocked({startTime:'bad'}),true);
  assert.equal(isLocked({startTime:null}),true);
  for (const status of ['running','postponed','finished','canceled']) assert.equal(isLocked({...m,status},0),true);
});
test('exact score choices always imply the selected winner', () => {
  assert.deepEqual(scoreOptions('BO3','B'),['0-2','1-2']);
  assert.deepEqual(scoreOptions('BO5','A'),['3-0','3-1','3-2']);
  assert.deepEqual(scoreOptions('BO1','A'),[]);
  assert.deepEqual(scoreOptions('BO5',null),[]);
});
test('scoring awards two total for exact, one for winner, zero for wrong/canceled', () => {
  const m = {result:'A',resultScore:'2-1'};
  assert.equal(pointsFor(m,{pick:'A',exactScore:'2-1'}),2);
  assert.equal(pointsFor(m,{pick:'A',exactScore:'2-0'}),1);
  assert.equal(pointsFor(m,{pick:'B',exactScore:'1-2'}),0);
  assert.equal(pointsFor({...m,status:'canceled'},{pick:'A'}),0);
});
test('leaderboard excludes picks outside the displayed season', () => {
  const rows = standings([{id:'new',result:'A'}],[{userId:'u',matchId:'old',pick:'A'},{userId:'v',matchId:'new',pick:'A'}],new Map());
  assert.equal(rows.length,1); assert.equal(rows[0].uid,'v'); assert.equal(rows[0].points,1);
});
test('provider IDs are stable and only final results earn points', () => {
  const m = raw(); m.winner_id = 1; m.results = [{team_id:1,score:2},{team_id:2,score:1}];
  assert.equal(normalizeMatch(m,2026,[55]).result,null);
  m.status = 'finished'; const done = normalizeMatch(m,2026,[55]);
  assert.equal(done.id,'pandascore_123'); assert.equal(done.result,'A'); assert.equal(done.resultScore,'2-1');
});
test('unknown opponents/dates wait; wrong tournament, year and malformed finals fail', () => {
  assert.equal(normalizeMatch({...raw(),opponents:[]},2026,[55]),null);
  assert.equal(normalizeMatch({...raw(),begin_at:null},2026,[55]),null);
  assert.throws(() => normalizeMatch(raw(),2026,[56]));
  assert.throws(() => normalizeMatch({...raw(),begin_at:'2025-10-20'},2026,[55]));
  assert.throws(() => normalizeMatch({...raw(),status:'finished'},2026,[55]));
});
test('walkover winners do not fabricate exact scores', () => {
  const m = normalizeMatch({...raw(),status:'finished',winner_id:2},2026,[55]);
  assert.equal(m.result,'B'); assert.equal(m.resultScore,null);
});
test('reordered provider opponents preserve the meaning of existing predictions', () => {
  const old = normalizeMatch(raw(),2026,[55]);
  const r = raw(); r.opponents.reverse(); r.status = 'finished'; r.winner_id = 1; r.results = [{team_id:1,score:2},{team_id:2,score:0}];
  const next = reconcile(old,normalizeMatch(r,2026,[55]),0);
  assert.equal(next.teamAId,1); assert.equal(next.result,'A'); assert.equal(next.resultScore,'2-0');
});
test('sync preserves manual overrides, locks and finals and rejects changed participants', () => {
  const m = normalizeMatch(raw(),2026,[55]);
  assert.equal(reconcile({...m,manualOverride:true},m),null);
  assert.throws(() => reconcile(m,{...m,teamAId:9}));
  assert.throws(() => reconcile(m,{...m,series:'BO5'}));
  const delayed = reconcile(m,{...m,startTime:new Date('2026-10-21')},+new Date('2026-10-20T15:00Z'));
  assert.equal(+delayed.startTime,+m.startTime);
  assert.equal(reconcile({...m,result:'A',resultScore:'2-1',status:'finished'},m).result,'A');
});
