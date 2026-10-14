/** Business logic only; no Firebase dependency. */
export const CATEGORIES = [
  { id: 'u12m', age: 12, gender: 'ชาย', label: '12 ปี ชาย', format: 'league', expected: 3, groups: ['-'] },
  { id: 'u12f', age: 12, gender: 'หญิง', label: '12 ปี หญิง', format: 'semis', expected: 8, groups: ['A', 'B'] },
  { id: 'u15m', age: 15, gender: 'ชาย', label: '15 ปี ชาย', format: 'direct', expected: 4, groups: ['A', 'B'] },
  { id: 'u15f', age: 15, gender: 'หญิง', label: '15 ปี หญิง', format: 'semis', expected: 8, groups: ['A', 'B'] },
  { id: 'u18m', age: 18, gender: 'ชาย', label: '18 ปี ชาย', format: 'league', expected: 3, groups: ['-'] },
  { id: 'u18f', age: 18, gender: 'หญิง', label: '18 ปี หญิง', format: 'league', expected: 3, groups: ['-'] }
];
export const getCategory = id => CATEGORIES.find(c => c.id === id);
export const ROUND_LABELS = { league: 'พบกันหมด', group: 'รอบแบ่งสาย', semi1: 'รองชนะเลิศ คู่ที่ 1', semi2: 'รองชนะเลิศ คู่ที่ 2', final: 'ชิงชนะเลิศ', third: 'ชิงอันดับ 3' };
export const KO_ROUNDS = ['semi1', 'semi2', 'final', 'third'];
// Change these targets only if tournament organizers officially specify other set lengths.
export const SET_TARGETS = [25, 25, 15];
export const normGroup = g => g === 'A' || g === 'B' ? g : '-';

export function validateScores(scores, { requireFinished = false, targets = SET_TARGETS } = {}) {
  const result = { ok: false, error: '', homeSets: 0, awaySets: 0, completed: false, scores: [] };
  if (!Array.isArray(scores) || scores.length > 3) { result.error = 'ระบุได้สูงสุด 3 เซต'; return result; }
  for (let i = 0; i < scores.length; i++) {
    const s = scores[i];
    if (!s || !Number.isInteger(s.home) || !Number.isInteger(s.away) || s.home < 0 || s.away < 0) {
      result.error = `คะแนนเซต ${i + 1} ต้องเป็นจำนวนเต็มไม่ติดลบทั้งสองทีม`; return result;
    }
    const hi = Math.max(s.home, s.away), lo = Math.min(s.home, s.away);
    if (hi < targets[i] || hi - lo < 2 || (lo < targets[i] - 1 && hi !== targets[i])) {
      result.error = `เซต ${i + 1} ต้องถึง ${targets[i]} แต้มและชนะห่าง 2 แต้ม (หรือดิวซ์)`; return result;
    }
    if (result.homeSets === 2 || result.awaySets === 2) {
      result.error = 'การแข่งขันจบแล้วเมื่อมีทีมชนะครบ 2 เซต'; return result;
    }
    if (s.home > s.away) result.homeSets++; else result.awaySets++;
    result.scores.push({ home: s.home, away: s.away });
  }
  result.completed = result.homeSets === 2 || result.awaySets === 2;
  if (requireFinished && !result.completed) { result.error = 'ยืนยันผลได้เมื่อมีทีมชนะครบ 2 เซต'; return result; }
  result.ok = true;
  return result;
}

export function matchWinner(match) {
  if (match?.status !== 'final') return null;
  const r = validateScores(match.scores || [], { requireFinished: true });
  if (!r.ok) return null;
  return r.homeSets === 2 ? match.homeId : match.awayId;
}
export function isPoolMatch(match) { return match.round === 'group' || match.round === 'league'; }
export function matchPoints(match) {
  const winner = matchWinner(match);
  if (!winner) return null;
  const s = validateScores(match.scores).scores;
  const loserPoints = s.length === 3 ? 1 : 0;
  return { winner, home: winner === match.homeId ? (s.length === 3 ? 2 : 3) : loserPoints,
    away: winner === match.awayId ? (s.length === 3 ? 2 : 3) : loserPoints };
}

const groupBy = (values, fn) => {
  const groups = [];
  for (const v of values) {
    const k = fn(v);
    if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, rows: [v] });
    else groups[groups.length - 1].rows.push(v);
  }
  return groups;
};
const numericKey = row => `${row.setDiff}/${row.pointDiff}/${row.pointsFor}`;
const globalCompare = (a, b) => b.setDiff - a.setDiff || b.pointDiff - a.pointDiff || b.pointsFor - a.pointsFor || a.name.localeCompare(b.name, 'th');
const teamsKey = arr => arr.map(t => t.id).sort().join('|');

/** All head-to-head pairings among teams tied on league points must be completed before using mini-table. */
function rankTied(rows, completed, orders, canDraw, depth = 0) {
  if (rows.length <= 1) return rows;
  const ids = new Set(rows.map(r => r.id));
  const mutual = completed.filter(m => ids.has(m.homeId) && ids.has(m.awayId));
  const allPairsPlayed = rows.every((a, i) => rows.slice(i + 1).every(b => mutual.some(m =>
    (m.homeId === a.id && m.awayId === b.id) || (m.homeId === b.id && m.awayId === a.id))));
  if (allPairsPlayed && depth < 10) {
    const mini = new Map(rows.map(r => [r.id, 0]));
    for (const m of mutual) {
      const p = matchPoints(m);
      mini.set(m.homeId, mini.get(m.homeId) + p.home);
      mini.set(m.awayId, mini.get(m.awayId) + p.away);
    }
    const byMini = [...rows].sort((a, b) => mini.get(b.id) - mini.get(a.id));
    const groups = groupBy(byMini, r => mini.get(r.id));
    if (groups.length > 1) return groups.flatMap(g => rankTied(g.rows, completed, orders, canDraw, depth + 1));
  }
  // When the mini-league does not separate teams, use overall set/point differentials as specified.
  const sorted = [...rows].sort(globalCompare);
  return groupBy(sorted, numericKey).flatMap(g => {
    if (g.rows.length === 1) return g.rows;
    const key = teamsKey(g.rows);
    const order = canDraw && orders.find(o => teamsKey((o.ids || []).map(id => ({ id }))) === key &&
      Array.isArray(o.order) && o.order.length === g.rows.length && new Set(o.order).size === g.rows.length &&
      g.rows.every(r => o.order.includes(r.id)))?.order;
    return g.rows.map(r => ({ ...r, drawKey: key, drawRequired: canDraw && !order, drawn: !!order, provisionalTie: !canDraw }))
      .sort((a, b) => order ? order.indexOf(a.id) - order.indexOf(b.id) : a.name.localeCompare(b.name, 'th'));
  });
}

/** Standings are calculated from CONFIRMED pool/league results only. */
export function computeTable(teams, matches, categoryId, group = '-', orders = []) {
  const pool = teams.filter(t => t.category === categoryId && normGroup(t.group) === normGroup(group));
  const ids = new Set(pool.map(t => t.id));
  const confirmed = matches.filter(m => m.category === categoryId && isPoolMatch(m) &&
    normGroup(m.group) === normGroup(group) && ids.has(m.homeId) && ids.has(m.awayId) && matchWinner(m));
  const rows = pool.map(t => ({ ...t, played: 0, won: 0, lost: 0, points: 0, setsFor: 0,
    setsAgainst: 0, setDiff: 0, pointsFor: 0, pointsAgainst: 0, pointDiff: 0 }));
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const m of confirmed) {
    const home = byId.get(m.homeId), away = byId.get(m.awayId);
    const res = validateScores(m.scores), p = matchPoints(m);
    home.played++; away.played++;
    home.points += p.home; away.points += p.away;
    if (p.winner === home.id) { home.won++; away.lost++; } else { away.won++; home.lost++; }
    home.setsFor += res.homeSets; home.setsAgainst += res.awaySets;
    away.setsFor += res.awaySets; away.setsAgainst += res.homeSets;
    for (const set of res.scores) {
      home.pointsFor += set.home; home.pointsAgainst += set.away;
      away.pointsFor += set.away; away.pointsAgainst += set.home;
    }
  }
  for (const r of rows) {
    r.setDiff = r.setsFor - r.setsAgainst;
    r.pointDiff = r.pointsFor - r.pointsAgainst;
  }
  const byPoints = groupBy(rows.sort((a, b) => b.points - a.points), r => r.points);
  const canDraw = groupComplete(teams, matches, categoryId, group);
  return byPoints.flatMap(g => rankTied(g.rows, confirmed, orders, canDraw)).map((r, i) => ({ ...r, rank: i + 1 }));
}

export function getUnresolvedBlocks(table) {
  const blocks = new Map();
  for (const r of table) if (r.drawRequired) {
    if (!blocks.has(r.drawKey)) blocks.set(r.drawKey, []);
    blocks.get(r.drawKey).push(r);
  }
  return [...blocks.values()];
}
export function groupComplete(teams, matches, category, group) {
  const participants = teams.filter(t => t.category === category && normGroup(t.group) === normGroup(group));
  if (participants.length < 2) return false;
  return participants.every((a, i) => participants.slice(i + 1).every(b => matches.some(m =>
    m.category === category && isPoolMatch(m) && normGroup(m.group) === normGroup(group) && matchWinner(m) &&
    ((m.homeId === a.id && m.awayId === b.id) || (m.homeId === b.id && m.awayId === a.id)))));
}
export function roundRobinPairs(teams) {
  const out = [];
  for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++)
    out.push([teams[i].id, teams[j].id]);
  return out;
}

export function buildNextKnockouts(categoryId, teams, matches, draws = []) {
  const config = getCategory(categoryId);
  if (!config || config.format === 'league') return { error: 'รุ่นนี้จัดอันดับจากรอบพบกันหมด ไม่มีรอบน็อกเอาต์' };
  const current = matches.filter(m => m.category === categoryId && KO_ROUNDS.includes(m.round));
  const existing = new Set(current.map(m => m.round));
  const template = (round, homeId, awayId) => ({ category: categoryId, group: '-', round, homeId, awayId,
    scheduledAt: '', court: 'สนาม 1', scores: [], status: 'scheduled' });
  if (config.format === 'direct') {
    if (existing.has('final') || existing.has('third')) return { error: 'มีคู่ชิงชนะเลิศ/อันดับ 3 อยู่แล้ว' };
    if (!config.groups.every(g => groupComplete(teams, matches, categoryId, g))) return { error: 'รอบแบ่งสายทั้งสองสายต้องแข่งขันและยืนยันผลครบก่อน' };
    const standings = config.groups.map(g => computeTable(teams, matches, categoryId, g, draws.find(d => d.category === categoryId && d.group === g)?.orders || []));
    if (standings.some(t => t.length < 2 || t.some(r => r.drawRequired))) return { error: 'จำนวนทีมไม่ครบหรือยังมีอันดับที่ต้องจับสลาก' };
    return { matches: [template('final', standings[0][0].id, standings[1][0].id),
      template('third', standings[0][1].id, standings[1][1].id)] };
  }
  const semi1 = current.find(m => m.round === 'semi1'), semi2 = current.find(m => m.round === 'semi2');
  if (!semi1 && !semi2) {
    if (!config.groups.every(g => groupComplete(teams, matches, categoryId, g))) return { error: 'รอบแบ่งสายต้องยืนยันผลครบทุกคู่ก่อนสร้างรอบรองฯ' };
    const [a, b] = config.groups.map(g => computeTable(teams, matches, categoryId, g,
      draws.find(d => d.category === categoryId && d.group === g)?.orders || []));
    if (a.length < 2 || b.length < 2 || [...a, ...b].some(r => r.drawRequired)) return { error: 'ต้องมีทีมอย่างน้อยสายละ 2 ทีมและไม่มีอันดับที่รอจับสลาก' };
    return { matches: [template('semi1', a[0].id, b[1].id), template('semi2', b[0].id, a[1].id)] };
  }
  if (!semi1 || !semi2) return { error: 'คู่รองชนะเลิศไม่ครบ กรุณาตรวจสอบโปรแกรม' };
  if (existing.has('final') || existing.has('third')) return { error: 'มีคู่ชิงชนะเลิศ/อันดับ 3 อยู่แล้ว' };
  const w1 = matchWinner(semi1), w2 = matchWinner(semi2);
  if (!w1 || !w2) return { error: 'ต้องยืนยันผลรอบรองชนะเลิศทั้ง 2 คู่ก่อน' };
  const l1 = w1 === semi1.homeId ? semi1.awayId : semi1.homeId;
  const l2 = w2 === semi2.homeId ? semi2.awayId : semi2.homeId;
  return { matches: [template('final', w1, w2), template('third', l1, l2)] };
}
