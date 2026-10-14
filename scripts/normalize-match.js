// Pure conversion kept separate so changes in the provider schema can be tested.
export function normalizeMatch(raw, season, tournamentIds) {
  if (!Number.isSafeInteger(raw.id) || !tournamentIds.includes(raw.tournament_id)) throw new Error('Unexpected match or tournament ID');
  const startTime = new Date(raw.begin_at || raw.scheduled_at);
  if (!(raw.begin_at || raw.scheduled_at) || !Number.isFinite(+startTime)) return null;
  if (startTime.getUTCFullYear() !== season) throw new Error(`Match ${raw.id} is outside the configured season`);
  if (!['not_started','running','finished','canceled','postponed'].includes(raw.status)) throw new Error(`Unknown status for match ${raw.id}`);
  const teams = raw.opponents?.map(o => o.opponent) || [];
  // Wait for both participants to be confirmed before accepting predictions.
  if (teams.length !== 2 || teams.some(t => !t?.id || !t.name)) return null;
  if (![1,3,5].includes(raw.number_of_games)) throw new Error(`Unsupported series format for match ${raw.id}`);
  const [a,b] = teams;
  let result = null, resultScore = null;
  if (raw.status === 'finished') {
    result = raw.winner_id === a.id ? 'A' : raw.winner_id === b.id ? 'B' : null;
    if (!result) throw new Error(`Finished match ${raw.id} has no valid winner`);
    const x = raw.results?.find(r => r.team_id === a.id)?.score;
    const y = raw.results?.find(r => r.team_id === b.id)?.score;
    const wins = Math.ceil(raw.number_of_games/2);
    // Walkovers can award a winner without a played score. Never invent an exact result.
    if (Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 &&
        ((result === 'A' && x === wins && y < wins) || (result === 'B' && y === wins && x < wins))) resultScore = `${x}-${y}`;
  }
  return {
    id:`pandascore_${raw.id}`,source:'pandascore',sourceId:raw.id,tournamentId:raw.tournament_id,
    season,teamA:a.acronym || a.name,teamB:b.acronym || b.name,teamAId:a.id,teamBId:b.id,
    teamALogo:a.image_url || null,teamBLogo:b.image_url || null,
    startTime,series:`BO${raw.number_of_games}`,status:raw.status,
    stage:raw.tournament?.name || '',result,resultScore
  };
}

export function reconcile(existing, incoming, now = Date.now()) {
  if (!existing) return incoming;
  if (existing.manualOverride) return null;
  if (existing.teamAId !== incoming.teamAId || existing.teamBId !== incoming.teamBId) {
    // Reordering must not turn existing A picks into B picks.
    if (existing.teamAId === incoming.teamBId && existing.teamBId === incoming.teamAId) {
      incoming = {...incoming,teamA:incoming.teamB,teamB:incoming.teamA,teamAId:incoming.teamBId,teamBId:incoming.teamAId,teamALogo:incoming.teamBLogo,teamBLogo:incoming.teamALogo,result:incoming.result === 'A' ? 'B' : incoming.result === 'B' ? 'A' : null,resultScore:incoming.resultScore?.split('-').reverse().join('-') || null};
    } else throw new Error(`Participants changed for ${incoming.id}; manual review required`);
  }
  if (existing.series !== incoming.series) throw new Error(`Series format changed for ${incoming.id}; manual review required`);
  const oldDate = existing.startTime?.toDate ? existing.startTime.toDate() : new Date(existing.startTime);
  // A delayed feed must never reopen an already locked match or erase a final result.
  if (+oldDate <= now && +incoming.startTime > +oldDate) incoming = {...incoming,startTime:oldDate};
  if (existing.result && !incoming.result && incoming.status !== 'canceled') incoming = {...incoming,result:existing.result,resultScore:existing.resultScore,status:existing.status};
  return incoming;
}
