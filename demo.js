import { CATEGORIES, roundRobinPairs } from './logic.js';

export function makeDemo() {
  const teams = [], matches = [];
  let ti = 1, mi = 1, slot = 0;
  for (const c of CATEGORIES) {
    for (const group of c.groups) {
      const number = c.expected / c.groups.length;
      for (let j = 0; j < number; j++) {
        teams.push({ id: `demo-team-${ti++}`, category: c.id, group,
          name: `ทีมตัวอย่าง ${c.age}${c.gender === 'ชาย' ? 'ช' : 'ญ'}${group === '-' ? '' : group}-${j + 1}` });
      }
      const groupTeams = teams.filter(t => t.category === c.id && t.group === group);
      for (const [homeId, awayId] of roundRobinPairs(groupTeams)) {
        const d = 16 + Math.floor(slot / 14) % 3;
        const hour = 8 + (slot % 7);
        const m = { id: `demo-match-${mi++}`, category: c.id, group,
          round: c.format === 'league' ? 'league' : 'group', homeId, awayId,
          scheduledAt: `2026-11-${d}T${String(hour).padStart(2, '0')}:00`,
          court: `สนาม ${(slot % 2) + 1}`, scores: [], status: 'scheduled' };
        // Only illustrate some confirmed and in-progress results, not actual tournament outcomes.
        if (c.id === 'u12m' && slot < 3 || c.id === 'u15m' || c.id === 'u12f' && group === 'A' && matches.filter(x => x.category === c.id && x.group === group).length < 2) {
          m.status = 'final';
          m.scores = slot % 2 ? [{ home: 25, away: 21 }, { home: 21, away: 25 }, { home: 15, away: 11 }] :
            [{ home: 25, away: 17 }, { home: 25, away: 20 }];
        } else if (c.id === 'u18m' && groupTeams[0].id === homeId) {
          m.status = 'live'; m.scores = [{ home: 25, away: 22 }];
        }
        matches.push(m);
        slot++;
      }
    }
  }
  const boys = matches.filter(m => m.category === 'u15m');
  if (boys.length === 2) {
    const winners = boys.map(m => m.scores.length === 2 ? m.homeId : m.awayId);
    const losers = boys.map((m, i) => winners[i] === m.homeId ? m.awayId : m.homeId);
    matches.push({ id: `demo-match-${mi++}`, category: 'u15m', group: '-', round: 'final', homeId: winners[0], awayId: winners[1],
      scheduledAt: '2026-11-18T13:00', court: 'สนาม 1', scores: [], status: 'scheduled' });
    matches.push({ id: `demo-match-${mi++}`, category: 'u15m', group: '-', round: 'third', homeId: losers[0], awayId: losers[1],
      scheduledAt: '2026-11-18T11:00', court: 'สนาม 1', scores: [], status: 'scheduled' });
  }
  return { teams, matches, draws: [] };
}
