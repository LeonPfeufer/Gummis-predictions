export const asDate = value => value?.toDate ? value.toDate() : new Date(value);
export const seasonOf = match => match.season ?? asDate(match.startTime).getUTCFullYear();
export const maxWins = series => ({ BO1: 1, BO3: 2, BO5: 3 })[series] || 1;
export function scoreOptions(series, pick) {
  if (!['A','B'].includes(pick) || maxWins(series) === 1) return [];
  return Array.from({ length: maxWins(series) }, (_, n) => pick === 'A' ? `${maxWins(series)}-${n}` : `${n}-${maxWins(series)}`);
}
export function isLocked(match, now = Date.now()) {
  return !match.startTime || !Number.isFinite(+asDate(match.startTime)) || now >= +asDate(match.startTime) ||
    Boolean(match.result) || ['running','finished','canceled','postponed'].includes(match.status);
}
export function pointsFor(match, pick) {
  if (match.status === 'canceled' || !match.result || match.result !== pick?.pick) return 0;
  return pick.exactScore && pick.exactScore === match.resultScore ? 2 : 1;
}
export function standings(matches, picks, users) {
  const byId = new Map(matches.map(m => [m.id, m]));
  const totals = new Map();
  for (const pick of picks) {
    if (!byId.has(pick.matchId)) continue;
    const row = totals.get(pick.userId) || { uid: pick.userId, name: users.get(pick.userId)?.displayName || pick.userName || 'Player', points: 0 };
    row.points += pointsFor(byId.get(pick.matchId), pick);
    totals.set(pick.userId, row);
  }
  return [...totals.values()].sort((a,b) => b.points - a.points || a.name.localeCompare(b.name));
}
