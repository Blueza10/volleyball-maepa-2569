import { firebaseConfig } from './firebase-config.js';
import { makeDemo } from './demo.js';
import { CATEGORIES, getCategory, ROUND_LABELS, KO_ROUNDS, normGroup, validateScores,
  matchWinner, computeTable, getUnresolvedBlocks, groupComplete, roundRobinPairs,
  buildNextKnockouts, isPoolMatch } from './logic.js';

const configured = !Object.values(firebaseConfig).some(v => !v || String(v).startsWith('PASTE_'));
const example = makeDemo();
const state = {
  ...(configured ? { teams: [], matches: [], draws: [] } : example), demo: !configured, ready: !configured, error: '', category: 'u12m', tab: 'overview', filter: 'all',
  user: null, admin: false, editMatch: null, sdk: null, db: null, auth: null
};
const el = id => document.getElementById(id);
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const team = id => state.teams.find(t => t.id === id);
const name = id => team(id)?.name || 'รอกำหนดทีม';
const inCat = (list, c = state.category) => list.filter(x => x.category === c);
const isKO = m => KO_ROUNDS.includes(m.round);
const isCategoryKOStarted = c => state.matches.some(m => m.category === c && isKO(m));
const hasFinals = c => state.matches.some(m => m.category === c && ['final', 'third'].includes(m.round));
const drawOrders = (c, g) => state.draws.find(d => d.category === c && d.group === g)?.orders || [];
const showGroup = g => g === '-' ? 'รวม' : `สาย ${g}`;
const msg = (text, type = '') => `<div class="notice ${type}">${e(text)}</div>`;
const noData = (a, b) => `<div class="empty"><strong>${e(a)}</strong>${e(b)}</div>`;
const stat = (icon, value, label) => `<div class="stat"><span class="stat-icon">${icon}</span><div><b>${value}</b><small>${e(label)}</small></div></div>`;
const statusTag = m => m.status === 'final' ? '<span class="pill done">✓ ยืนยันแล้ว</span>' :
  m.status === 'live' ? '<span class="pill live">● กำลังบันทึก</span>' : '<span class="pill scheduled">รอแข่งขัน</span>';
function dateText(stamp) {
  if (!stamp) return 'ยังไม่กำหนดเวลา';
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(stamp);
  if (!match) return stamp;
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${Number(match[1]) + 543} • ${match[4]}:${match[5]} น.`;
}
function orderMatches(matches) {
  return [...matches].sort((a, b) => (a.scheduledAt || '9999').localeCompare(b.scheduledAt || '9999') ||
    (a.round || '').localeCompare(b.round || '') || a.id.localeCompare(b.id));
}
const matchLabel = m => `${ROUND_LABELS[m.round] || m.round}${m.group && m.group !== '-' ? ' • สาย ' + m.group : ''}`;
function matchCard(m, edit = false) {
  const s = validateScores(m.scores || []);
  const score = (m.scores?.length && s.ok) ? `${s.homeSets}<span class="colon">:</span>${s.awaySets}` : 'VS';
  const setStr = m.scores?.length ? m.scores.map((p, i) => `<span class="score-chip">S${i + 1}: ${p.home}–${p.away}</span>`).join(' ') : 'ยังไม่มีผลรายเซต';
  return `<article class="match-card"><div class="match-header"><span>${e(matchLabel(m))}</span>${statusTag(m)}</div>
    <div class="match-body"><div class="team-name">${e(name(m.homeId))}</div><div class="set-score ${score === 'VS' ? 'unplayed' : ''}">${score}</div><div class="team-name right">${e(name(m.awayId))}</div></div>
    <div class="match-footer"><span>${e(dateText(m.scheduledAt))} • ${e(m.court || 'ยังไม่กำหนดสนาม')}</span><span>${setStr}</span></div>
    ${edit ? `<div class="match-footer"><span>จัดการคู่แข่งขัน</span><span><button class="btn secondary small" data-action="edit" data-id="${e(m.id)}">กรอกผล / แก้เวลา</button> <button class="btn danger small" data-action="remove-match" data-id="${e(m.id)}">ลบคู่</button></span></div>` : ''}</article>`;
}

function renderStandings() {
  const config = getCategory(state.category);
  const descriptions = `คำนวณเฉพาะคู่ที่ยืนยันผลแล้ว • ชนะ 2–0 = 3/0 คะแนน • ชนะ 2–1 = 2/1 คะแนน`;
  const sections = config.groups.map(group => {
    const standings = computeTable(state.teams, state.matches, config.id, group, drawOrders(config.id, group));
    const complete = groupComplete(state.teams, state.matches, config.id, group);
    const warning = getUnresolvedBlocks(standings).length ? '<span class="pill alert">รอจับสลากตัดสินอันดับ</span>' : '';
    if (!standings.length) return `<section><h3 class="group-title">${showGroup(group)}</h3>${noData('ยังไม่มีรายชื่อทีม', 'ผู้จัดสามารถเพิ่มทีมในเมนูผู้ดูแล')}</section>`;
    return `<section><div class="split-heading"><h3 class="group-title">${config.groups.length > 1 ? showGroup(group) : 'ตารางคะแนนสะสม'}</h3><span>${complete ? '<span class="pill done">แข่งขันครบทุกคู่</span>' : '<span class="pill scheduled">อันดับระหว่างการแข่งขัน</span>'} ${warning}</span></div>
    <div class="table-scroll"><table class="standings"><thead><tr><th>อันดับ</th><th>ทีม</th><th>แข่ง</th><th>ชนะ</th><th>แพ้</th><th>เซตได้–เสีย</th><th>ผลต่างเซต</th><th>ผลต่างแต้ม</th><th>แต้มได้</th><th>คะแนน</th></tr></thead><tbody>
    ${standings.map(r => `<tr class="${r.rank <= 2 ? 'top' : ''}"><td>${r.rank}${r.drawRequired ? ' ⚠' : ''}${r.drawn ? ' 🎲' : ''}</td><td>${e(r.name)}</td><td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td>${r.setsFor}–${r.setsAgainst}</td><td>${r.setDiff > 0 ? '+' : ''}${r.setDiff}</td><td>${r.pointDiff > 0 ? '+' : ''}${r.pointDiff}</td><td>${r.pointsFor}</td><td class="pts">${r.points}</td></tr>`).join('')}</tbody></table></div>
    <div class="table-note">${e(descriptions)}${getUnresolvedBlocks(standings).length ? ' • ⚠ อันดับที่เสมอทุกเกณฑ์เป็นอันดับชั่วคราวจนกว่าจะบันทึกผลจับสลาก' : ''}</div></section>`;
  });
  return `<div class="section-stack">${sections.join('')}</div>`;
}
function renderSchedule() {
  const m = orderMatches(inCat(state.matches)).filter(x => state.filter === 'all' || x.scheduledAt?.slice(8, 10) === state.filter);
  const filters = [['all', 'ทั้งหมด'], ['16', '16 พ.ย.'], ['17', '17 พ.ย.'], ['18', '18 พ.ย.']];
  return `<div class="split-heading"><h3 class="subheading">โปรแกรมและผลการแข่งขัน</h3><div class="filters">${filters.map(([key, label]) => `<button data-action="filter" data-id="${key}" class="${state.filter === key ? 'active' : ''}">${label}</button>`).join('')}</div></div>
  ${m.length ? `<div class="match-list">${m.map(x => matchCard(x)).join('')}</div>` : noData('ไม่พบรายการแข่งขันในช่วงนี้', 'ผู้จัดสามารถกำหนดโปรแกรมและเวลาแข่งขันในเมนูผู้ดูแล')}`;
}
function bracketSlot(round, ms, alt) { const m = ms.find(m => m.round === round); return m ? matchCard(m) : `<div class="placeholder">${e(alt)}</div>`; }
function renderBracket() {
  const config = getCategory(state.category), ms = inCat(state.matches).filter(isKO);
  if (config.format === 'league') return `<h3 class="subheading">จัดอันดับด้วยคะแนนสะสม</h3>${msg('รุ่นนี้แข่งขันพบกันหมด จัดอันดับที่ 1–3 จากตารางคะแนน ไม่มีรอบน็อกเอาต์')}${renderStandings()}`;
  return `<div class="split-heading"><h3 class="subheading">สายการแข่งขันรอบสุดท้าย</h3><span class="pill teal">${config.format === 'semis' ? 'รองชนะเลิศ → รอบชิง' : 'แชมป์สาย A พบ แชมป์สาย B'}</span></div>
  ${config.format === 'semis' ? `<div class="bracket"><section class="bracket-col"><h3>รอบรองชนะเลิศ</h3>${bracketSlot('semi1', ms, 'อันดับ 1 สาย A พบอันดับ 2 สาย B')}${bracketSlot('semi2', ms, 'อันดับ 1 สาย B พบอันดับ 2 สาย A')}</section>
  <section class="bracket-col"><h3>รอบชิงอันดับ 3</h3>${bracketSlot('third', ms, 'ผู้แพ้รอบรองชนะเลิศทั้ง 2 คู่')}</section>
  <section class="bracket-col"><h3>รอบชิงชนะเลิศ</h3>${bracketSlot('final', ms, 'ผู้ชนะรอบรองชนะเลิศทั้ง 2 คู่')}</section></div>` :
  `<div class="grid-two"><section><h3 class="subheading">ชิงชนะเลิศ</h3>${bracketSlot('final', ms, 'อันดับ 1 สาย A พบอันดับ 1 สาย B')}</section><section><h3 class="subheading">ชิงอันดับ 3</h3>${bracketSlot('third', ms, 'อันดับ 2 สาย A พบอันดับ 2 สาย B')}</section></div>`}
  <p class="table-note">คู่รอบน็อกเอาต์สร้างโดยผู้จัดเมื่อยืนยันผลรอบแบ่งสายครบและไม่มีอันดับค้างจับสลาก • ไม่เปลี่ยนคู่ย้อนหลังอัตโนมัติเมื่อแก้ผลรอบก่อนหน้า</p>`;
}
function renderOverview() {
  const c = getCategory(state.category), teams = inCat(state.teams), matches = inCat(state.matches);
  const done = matches.filter(m => matchWinner(m));
  const upcoming = orderMatches(matches.filter(m => m.status !== 'final')).slice(0, 3);
  return `<div class="grid-two"><div class="summary-card"><h3>ภาพรวมรุ่น ${e(c.label)}</h3>
    <div class="mini-stat">${teams.length} <small style="font-size:.85rem">/ ${c.expected} ทีมตามแผน</small></div>
    <p>${c.format === 'league' ? 'พบกันหมด จัดอันดับ 1–3' : c.format === 'direct' ? 'สองสาย สายละ 2 ทีม • ผู้ชนะเข้าชิงแชมป์ ผู้แพ้ชิงอันดับ 3' : 'สองสาย สายละ 4 ทีม • อันดับ 1–2 เข้ารอบรองชนะเลิศ'}</p>
    <p>ยืนยันผลแล้ว <strong>${done.length}</strong> จาก <strong>${matches.length}</strong> คู่ที่สร้าง</p>
  </div><div class="summary-card"><h3>กติกาคะแนนสะสม</h3><p>ชนะ 2–0: ผู้ชนะ 3 คะแนน / ผู้แพ้ 0 คะแนน</p><p>ชนะ 2–1: ผู้ชนะ 2 คะแนน / ผู้แพ้ 1 คะแนน</p><p>คะแนนเท่ากันใช้ผลพบกันเอง → ผลต่างเซต → ผลต่างแต้ม → แต้มได้ → จับสลาก</p></div></div>
  <div class="split-heading" style="margin-top:23px"><h3 class="subheading">โปรแกรมถัดไป / กำลังบันทึกผล</h3><button class="btn secondary small" data-action="tab" data-id="schedule">ดูทุกคู่ →</button></div>
  ${upcoming.length ? `<div class="match-list">${upcoming.map(x => matchCard(x)).join('')}</div>` : noData('ยังไม่มีโปรแกรมที่รอแข่งขัน', 'เมื่อผู้จัดเพิ่มคู่แข่งขัน โปรแกรมจะแสดงที่นี่')}`;
}

function teamForm() {
  const cfg = getCategory(state.category);
  return `<div class="form-block"><h3>เพิ่มทีมในรุ่น ${e(cfg.label)}</h3><form id="team-form" class="form-grid"><div class="form-field"><label for="team-name">ชื่อทีม / โรงเรียน</label><input id="team-name" name="teamName" maxlength="100" placeholder="เช่น โรงเรียน..." required></div>
    <div class="form-field"><label for="team-group">สายการแข่งขัน</label><select id="team-group" name="group">${cfg.groups.map(g => `<option value="${g}">${showGroup(g)}</option>`).join('')}</select></div>
    <div><button class="btn" type="submit">+ เพิ่มทีม</button></div></form></div>
    <div class="admin-box"><h3>รายชื่อทีม (${inCat(state.teams).length})</h3>${inCat(state.teams).length ? inCat(state.teams).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name, 'th')).map(t => `<div class="admin-row"><span><span class="pill">${showGroup(t.group)}</span> ${e(t.name)}</span><button class="btn danger small" data-action="remove-team" data-id="${e(t.id)}">ลบ</button></div>`).join('') : '<p class="helper">ยังไม่มีทีม</p>'}
    <p class="helper">จำนวนทีมและสายยังปรับได้ก่อนสร้างโปรแกรม หากทีมมีคู่แข่งขันแล้วจะไม่อนุญาตให้ลบเพื่อป้องกันข้อมูลผลการแข่งขันเสียหาย</p></div>`;
}
function manualMatchForm() {
  const c = getCategory(state.category), teams = inCat(state.teams);
  const opts = teams.map(t => `<option value="${e(t.id)}">${e(t.name)}${t.group === '-' ? '' : ' (สาย ' + t.group + ')'}</option>`).join('');
  return `<div class="form-block"><h3>กำหนดคู่แข่งขัน</h3><p class="helper">กดสร้างพบกันหมดเพื่อเติมคู่ภายในสายอัตโนมัติ (ไม่สร้างคู่ซ้ำ) แล้วกำหนดวันเวลาแต่ละคู่ หรือเพิ่มคู่เองด้านล่าง</p>
    <button class="btn secondary" data-action="generate">⚙ สร้างคู่พบกันหมดที่ยังไม่มี</button>
    <hr style="border:0;border-top:1px solid #e4eced;margin:18px 0">
    <form id="match-form"><div class="form-grid"><div class="form-field"><label>ทีม A</label><select name="homeId" required><option value="">เลือกทีม</option>${opts}</select></div>
    <div class="form-field"><label>ทีม B</label><select name="awayId" required><option value="">เลือกทีม</option>${opts}</select></div>
    <div class="form-field"><label>รอบ/สาย</label><select name="group">${c.groups.map(g => `<option value="${g}">${showGroup(g)}</option>`).join('')}</select></div>
    <div class="form-field"><label>วันและเวลา</label><input type="datetime-local" name="scheduledAt" min="2026-11-16T00:00" max="2026-11-18T23:59"></div>
    <div class="form-field"><label>สนาม</label><input name="court" maxlength="60" value="สนาม 1"></div><div><button class="btn" type="submit">+ เพิ่มคู่แข่งขัน</button></div></div></form>
    <p class="helper">คู่รอบชิงและรองชนะเลิศใช้ปุ่ม “สร้างรอบน็อกเอาต์” ด้านล่างเพื่อเลือกทีมจากอันดับที่ยืนยันแล้ว</p></div>`;
}
function editor() {
  const m = state.matches.find(x => x.id === state.editMatch);
  if (!m) return '';
  const results = m.scores || [];
  const fields = [0, 1, 2].map(i => `<div class="form-field"><label>เซต ${i + 1} • ${i === 2 ? '15 แต้ม' : '25 แต้ม'}</label><div style="display:flex;gap:7px"><input type="number" name="h${i}" min="0" max="999" placeholder="ทีม A" value="${results[i]?.home ?? ''}"><input type="number" name="a${i}" min="0" max="999" placeholder="ทีม B" value="${results[i]?.away ?? ''}"></div></div>`).join('');
  return `<div class="form-block" id="score-editor"><h3>แก้ไขคู่: ${e(name(m.homeId))} – ${e(name(m.awayId))}</h3>
    <form id="result-form" data-id="${e(m.id)}"><div class="form-grid"><div class="form-field"><label>วันและเวลา</label><input type="datetime-local" name="scheduledAt" value="${e(m.scheduledAt || '')}" min="2026-11-16T00:00" max="2026-11-18T23:59"></div><div class="form-field"><label>สนาม</label><input name="court" maxlength="60" value="${e(m.court || '')}"></div><div></div>${fields}</div>
    <div class="form-actions"><button type="submit" name="intent" value="draft" class="btn secondary">บันทึกระหว่างแข่ง / แก้เวลา</button><button type="submit" name="intent" value="final" class="btn">✓ ยืนยันผลการแข่งขัน</button><button type="button" class="btn secondary" data-action="cancel-edit">ยกเลิก</button></div></form>
    <p class="helper">บันทึกแต่ละเซตแล้วผู้ชมจะเห็นผลทันที แต่คะแนนสะสมจะอัปเดตเฉพาะเมื่อกด “ยืนยันผลการแข่งขัน” เท่านั้น • หากต้องการแก้ผลที่ยืนยันแล้วให้เปิดคู่เดิมและยืนยันอีกครั้ง</p></div>`;
}
function drawForms() {
  const cfg = getCategory(state.category);
  return cfg.groups.map(g => {
    const table = computeTable(state.teams, state.matches, cfg.id, g, drawOrders(cfg.id, g));
    return getUnresolvedBlocks(table).map(block => `<form class="draw-panel draw-form" data-group="${g}" data-ids="${e(block.map(t => t.id).join('|'))}"><h4>🎲 ต้องจับสลากจริง • ${showGroup(g)}</h4><p class="helper">ทีมเสมอกันทุกเกณฑ์: ${block.map(t => e(t.name)).join(', ')} • จับสลากนอกระบบก่อนแล้วเลือกลำดับด้านล่าง</p>
      <div class="form-grid">${block.map((_, i) => `<div class="form-field"><label>ลำดับ ${i + 1}</label><select name="r${i}">${block.map(t => `<option value="${e(t.id)}">${e(t.name)}</option>`).join('')}</select></div>`).join('')}</div><div class="form-actions"><button class="btn" type="submit">บันทึกผลจับสลาก</button></div></form>`).join('');
  }).join('');
}
function adminView() {
  if (state.demo) return msg('ขณะนี้เป็นโหมดตัวอย่าง ผู้จัดต้องตั้งค่า firebase-config.js และ Firebase ก่อนจึงจะเพิ่มทีม/คะแนนจริงได้', 'warn');
  if (!state.user) return `<div class="login-wrap"><h3 class="subheading">เข้าสู่ระบบผู้ดูแลการแข่งขัน</h3><p class="helper">ใช้บัญชี Email/Password ที่ผู้รับผิดชอบสร้างไว้ใน Firebase Authentication เท่านั้น</p>
    <form id="login-form" class="form-block"><div class="form-field"><label>อีเมลผู้ดูแล</label><input type="email" name="email" required autocomplete="username"></div>
    <div class="form-field"><label>รหัสผ่าน</label><input type="password" name="password" required autocomplete="current-password"></div><div class="form-actions"><button class="btn" type="submit">เข้าสู่ระบบ</button></div></form></div>`;
  if (!state.admin) return `<div class="admin-heading"><strong>เข้าสู่ระบบด้วย ${e(state.user.email || state.user.uid)}</strong><button class="btn secondary small" data-action="logout">ออกจากระบบ</button></div>${msg('บัญชีนี้ยังไม่ได้รับสิทธิ์ผู้จัด กรุณาเพิ่มเอกสาร admins/{UID} ใน Firestore Console และตรวจสอบกฎความปลอดภัย', 'warn')}`;
  const cfg = getCategory(state.category), allMatches = orderMatches(inCat(state.matches));
  return `<div class="admin-heading"><div><span class="pill done">ผู้ดูแลได้รับสิทธิ์แล้ว</span> <span class="muted">${e(state.user.email)}</span></div><div class="form-actions" style="margin-top:0"><button class="btn secondary small" data-action="backup">↓ สำรอง JSON</button><button class="btn secondary small" data-action="logout">ออกจากระบบ</button></div></div>
    <div class="management">${teamForm()}${manualMatchForm()}
    <section class="admin-box"><div class="split-heading"><h3>ผลการแข่งขันและเวลาของคู่ที่สร้างแล้ว (${allMatches.length})</h3></div>${editor()}${allMatches.length ? `<div class="match-list">${allMatches.map(m => matchCard(m, true)).join('')}</div>` : noData('ยังไม่มีคู่แข่งขัน', 'เพิ่มทีมก่อน แล้วกดสร้างคู่พบกันหมด')}</section>
    ${cfg.format !== 'league' ? `<section class="form-block"><h3>รอบน็อกเอาต์</h3><p class="helper">ระบบจะสร้างรองชนะเลิศหลังจบรอบแบ่งสาย (สำหรับรุ่นหญิง 12/15 ปี) และสร้างรอบชิงหลังยืนยันผลรองฯ • รุ่นชาย 15 ปีสร้างคู่ชิงได้ทันทีหลังจบการแข่งขันในสาย</p><div class="form-actions"><button class="btn" data-action="playoffs">+ สร้างรอบน็อกเอาต์ขั้นถัดไป</button><button class="btn danger" data-action="clear-playoffs">ลบรอบน็อกเอาต์ทั้งหมด</button></div></section>` : ''}
    <section><h3 class="subheading">การจับสลากกรณีเสมอทุกเกณฑ์</h3>${drawForms() || '<p class="helper">ไม่มีอันดับที่ต้องตัดสินด้วยการจับสลากในขณะนี้</p>'}</section></div>`;
}
function render() {
  const cat = getCategory(state.category);
  el('notice').innerHTML = state.demo ? msg('โหมดสาธิต: รายชื่อทีมและผลที่เห็นเป็นข้อมูลตัวอย่าง ไม่ใช่ผลการแข่งขันจริง กรุณาเชื่อม Firebase เพื่อใช้งานจริง', 'warn') :
    state.error ? msg(state.error, 'error') : !state.ready ? msg('กำลังเชื่อมต่อข้อมูลการแข่งขัน…') : '';
  el('stats').innerHTML = stat('🏐', '6', 'รุ่นการแข่งขัน') + stat('👥', state.teams.length, 'ทีมที่ลงทะเบียน') +
    stat('📋', state.matches.length, 'คู่แข่งขัน') + stat('✓', state.matches.filter(m => matchWinner(m)).length, 'ยืนยันผลแล้ว');
  el('category-chips').innerHTML = CATEGORIES.map(c => `<button class="${c.id === cat.id ? 'active' : ''}" data-action="category" data-id="${c.id}" aria-pressed="${c.id === cat.id}">${e(c.label)}</button>`).join('');
  el('category-title').textContent = `รุ่นอายุไม่เกิน ${cat.age} ปี ${cat.gender}`;
  el('category-description').textContent = cat.format === 'league' ? 'พบกันหมด • จัดอันดับ 1–3' : cat.format === 'direct' ? 'แบ่ง 2 สาย • ชิงชนะเลิศ / ชิงอันดับ 3' : 'แบ่ง 2 สาย • รอบรองชนะเลิศ / ชิงอันดับ 3 / ชิงชนะเลิศ';
  el('category-tag').textContent = `เป้าหมาย ${cat.expected} ทีม`;
  const tabs = [['overview', 'ภาพรวม'], ['schedule', 'ตารางแข่งขัน / ผล'], ['standings', 'ตารางอันดับ'], ['bracket', 'รอบสุดท้าย'], ['admin', '⚙ ผู้ดูแล']];
  el('tabs').innerHTML = tabs.map(([key, label]) => `<button data-action="tab" data-id="${key}" class="${state.tab === key ? 'active' : ''}" aria-current="${state.tab === key ? 'page' : 'false'}">${label}</button>`).join('');
  el('tab-content').innerHTML = state.tab === 'overview' ? renderOverview() : state.tab === 'schedule' ? renderSchedule() :
    state.tab === 'standings' ? renderStandings() : state.tab === 'bracket' ? renderBracket() : adminView();
}
let toastTimer;
function toast(text) { const node = el('toast'); node.textContent = text; node.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.add('hidden'), 4500); }
const errText = err => err?.code === 'permission-denied' ? 'ไม่มีสิทธิ์เขียนข้อมูล กรุณาตรวจสอบเอกสาร admins/{UID} และ Firestore Rules' : err?.message || String(err);
function requireAdmin() { if (!state.admin || state.demo) throw new Error('ฟังก์ชันนี้สำหรับผู้ดูแลที่ได้รับสิทธิ์เท่านั้น'); }
function firebaseFns() { if (!state.sdk || !state.db) throw new Error('ยังไม่เชื่อม Firebase'); return state.sdk; }
function existingSamePair(cat, group, a, b) {
  return state.matches.some(m => m.category === cat && isPoolMatch(m) && normGroup(m.group) === normGroup(group) &&
    ((m.homeId === a && m.awayId === b) || (m.homeId === b && m.awayId === a)));
}
function assertEditAllowed(m) {
  if (isPoolMatch(m) && isCategoryKOStarted(m.category)) throw new Error('ต้องลบรอบน็อกเอาต์ทั้งหมดก่อนแก้ผลรอบแบ่งสาย เพื่อป้องกันคู่รอบต่อไปไม่ตรงอันดับ');
  if (['semi1', 'semi2'].includes(m.round) && hasFinals(m.category)) throw new Error('ต้องลบรอบน็อกเอาต์ทั้งหมดก่อนแก้ผลรองชนะเลิศที่ใช้สร้างคู่ชิงแล้ว');
}
async function createDocs(collectionName, objects) {
  if (!objects.length) return;
  const { collection, doc, writeBatch } = firebaseFns();
  const batch = writeBatch(state.db);
  for (const obj of objects) batch.set(doc(collection(state.db, collectionName)), obj);
  await batch.commit();
}
async function handleAction(target) {
  const action = target.dataset.action, id = target.dataset.id;
  if (action === 'category') { state.category = id; state.editMatch = null; state.filter = 'all'; render(); return; }
  if (action === 'tab') { state.tab = id; state.editMatch = null; render(); return; }
  if (action === 'filter') { state.filter = id; render(); return; }
  if (action === 'cancel-edit') { state.editMatch = null; render(); return; }
  if (action === 'edit') { requireAdmin(); state.editMatch = id; state.tab = 'admin'; render(); el('score-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (action === 'logout') { await firebaseFns().signOut(state.auth); state.editMatch = null; toast('ออกจากระบบแล้ว'); return; }
  requireAdmin();
  const f = firebaseFns();
  if (action === 'backup') {
    const backup = { event: 'แม่ปะ–แม่กาษา 2569', exportedAt: new Date().toISOString(), teams: state.teams, matches: state.matches, draws: state.draws };
    const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    link.href = url; link.download = 'volleyball-2569-backup.json'; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000); toast('สำรองข้อมูล JSON จากข้อมูลที่โหลดอยู่เรียบร้อย'); return;
  }
  if (action === 'remove-team') {
    if (state.matches.some(m => m.homeId === id || m.awayId === id)) throw new Error('ทีมนี้มีคู่แข่งขันแล้ว ต้องลบคู่แข่งขันที่เกี่ยวข้องก่อน');
    if (!confirm(`ต้องการลบทีม ${name(id)}?`)) return;
    await f.deleteDoc(f.doc(state.db, 'teams', id)); toast('ลบทีมแล้ว');
  }
  if (action === 'remove-match') {
    const m = state.matches.find(x => x.id === id);
    if (!m) return;
    assertEditAllowed(m);
    if (!confirm(`ลบคู่ ${name(m.homeId)} – ${name(m.awayId)} รวมถึงผลที่บันทึกไว้?`)) return;
    await f.deleteDoc(f.doc(state.db, 'matches', id)); state.editMatch = null; toast('ลบคู่แข่งขันแล้ว');
  }
  if (action === 'generate') {
    const c = getCategory(state.category), create = [];
    for (const group of c.groups) {
      const t = inCat(state.teams).filter(x => x.group === group).sort((a, b) => a.name.localeCompare(b.name, 'th'));
      for (const [homeId, awayId] of roundRobinPairs(t)) if (!existingSamePair(c.id, group, homeId, awayId)) {
        create.push({ category: c.id, group, round: c.format === 'league' ? 'league' : 'group', homeId, awayId,
          scheduledAt: '', court: 'สนาม 1', status: 'scheduled', scores: [] });
      }
    }
    if (!create.length) { toast('ไม่พบคู่ใหม่ที่ต้องสร้าง (ตรวจสอบจำนวนทีม/คู่เดิม)'); return; }
    if (!confirm(`ต้องการสร้างโปรแกรมพบกันหมดใหม่ ${create.length} คู่ (ยังไม่กำหนดเวลา)?`)) return;
    await createDocs('matches', create); toast(`สร้าง ${create.length} คู่แล้ว`);
  }
  if (action === 'playoffs') {
    const r = buildNextKnockouts(state.category, state.teams, state.matches, state.draws);
    if (r.error) throw new Error(r.error);
    if (!confirm(`สร้างคู่รอบน็อกเอาต์ ${r.matches.length} คู่ โดยอิงจากอันดับที่ยืนยันแล้ว?`)) return;
    await createDocs('matches', r.matches); toast('สร้างคู่รอบน็อกเอาต์แล้ว กรุณากำหนดเวลาแข่ง');
  }
  if (action === 'clear-playoffs') {
    const ms = inCat(state.matches).filter(isKO);
    if (!ms.length) { toast('ยังไม่มีคู่รอบน็อกเอาต์'); return; }
    if (!confirm(`ลบรอบน็อกเอาต์ ${ms.length} คู่ รวมผลคะแนนทั้งหมด ใช่หรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้`)) return;
    const batch = f.writeBatch(state.db); ms.forEach(m => batch.delete(f.doc(state.db, 'matches', m.id)));
    await batch.commit(); state.editMatch = null; toast('ลบรอบน็อกเอาต์ทั้งหมดแล้ว');
  }
}
function scoreInputs(fd) {
  const scores = [];
  let gap = false;
  for (let i = 0; i < 3; i++) {
    const h = String(fd.get(`h${i}`) ?? '').trim(), a = String(fd.get(`a${i}`) ?? '').trim();
    if (h === '' && a === '') { gap = true; continue; }
    if (gap) throw new Error('กรุณากรอกเซตเรียงกันโดยไม่เว้นเซตกลาง');
    if (h === '' || a === '') throw new Error(`กรุณากรอกคะแนนทั้งสองทีมในเซต ${i + 1}`);
    scores.push({ home: Number(h), away: Number(a) });
  }
  return scores;
}
function validCompetitionTime(t) {
  if (t && !/^2026-11-(16|17|18)T([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('วันที่แข่งขันต้องเป็นวันที่ 16–18 พฤศจิกายน 2569');
}
async function handleForm(form, submitter) {
  const fd = new FormData(form), f = firebaseFns();
  if (form.id === 'login-form') {
    await f.signInWithEmailAndPassword(state.auth, fd.get('email'), fd.get('password'));
    toast('เข้าสู่ระบบแล้ว กำลังตรวจสอบสิทธิ์ผู้จัด'); return;
  }
  requireAdmin();
  if (form.id === 'team-form') {
    const teamName = String(fd.get('teamName') || '').trim(), group = String(fd.get('group'));
    const c = getCategory(state.category);
    if (!teamName || teamName.length > 100 || !c.groups.includes(group)) throw new Error('ชื่อทีม/สายไม่ถูกต้อง');
    if (inCat(state.teams).some(t => t.group === group && t.name.toLowerCase() === teamName.toLowerCase())) throw new Error('มีทีมชื่อนี้ในสายเดียวกันแล้ว');
    await f.addDoc(f.collection(state.db, 'teams'), { category: c.id, group, name: teamName });
    form.reset(); toast('เพิ่มทีมแล้ว');
  }
  if (form.id === 'match-form') {
    const homeId = String(fd.get('homeId')), awayId = String(fd.get('awayId')), group = String(fd.get('group')),
      scheduledAt = String(fd.get('scheduledAt') || ''), court = String(fd.get('court') || '').trim();
    validCompetitionTime(scheduledAt);
    const c = getCategory(state.category);
    if (!homeId || !awayId || homeId === awayId || !c.groups.includes(group) || !team(homeId) || !team(awayId) ||
      team(homeId).category !== c.id || team(awayId).category !== c.id || team(homeId).group !== group || team(awayId).group !== group)
      throw new Error('กรุณาเลือกสองทีมที่แตกต่างกันและอยู่ในสายเดียวกัน');
    if (existingSamePair(c.id, group, homeId, awayId)) throw new Error('คู่นี้มีอยู่ในโปรแกรมแล้ว');
    await f.addDoc(f.collection(state.db, 'matches'), { category: c.id, group, round: c.format === 'league' ? 'league' : 'group',
      homeId, awayId, scheduledAt, court, scores: [], status: 'scheduled' });
    form.reset(); toast('เพิ่มคู่แข่งขันแล้ว');
  }
  if (form.id === 'result-form') {
    const id = form.dataset.id, m = state.matches.find(x => x.id === id);
    if (!m) throw new Error('ไม่พบคู่แข่งขัน');
    assertEditAllowed(m);
    const scores = scoreInputs(fd), final = submitter?.value === 'final';
    const result = validateScores(scores, { requireFinished: final });
    if (!result.ok) throw new Error(result.error);
    const scheduledAt = String(fd.get('scheduledAt') || ''), court = String(fd.get('court') || '').trim();
    validCompetitionTime(scheduledAt);
    if (court.length > 60) throw new Error('ชื่อสนามยาวเกินไป');
    if (m.status === 'final' && !final && !confirm('คู่นี้ยืนยันแล้ว การบันทึกแบบร่างจะนำผลออกจากตารางคะแนนสะสมจนกว่าจะยืนยันใหม่ ยืนยันหรือไม่?')) return;
    await f.updateDoc(f.doc(state.db, 'matches', id), { scores, status: final ? 'final' : (scores.length ? 'live' : 'scheduled'), scheduledAt, court });
    state.editMatch = null; toast(final ? 'ยืนยันผลและอัปเดตตารางคะแนนแล้ว' : 'บันทึกผลรายเซต/เวลาแล้ว');
  }
  if (form.classList.contains('draw-form')) {
    const group = form.dataset.group, ids = form.dataset.ids.split('|');
    const values = ids.map((_, i) => String(fd.get(`r${i}`)));
    if (new Set(values).size !== ids.length || values.some(v => !ids.includes(v))) throw new Error('โปรดเลือกทีมไม่ซ้ำกันทุกอันดับ');
    const current = state.draws.find(d => d.category === state.category && d.group === group);
    const key = [...ids].sort().join('|');
    const others = (current?.orders || []).filter(o => [...o.ids].sort().join('|') !== key);
    await f.setDoc(f.doc(state.db, 'draws', `${state.category}_${group}`), { category: state.category, group,
      orders: [...others, { ids, order: values }], note: 'ยืนยันลำดับโดยผลการจับสลากจริงจากคณะผู้จัดการแข่งขัน' });
    toast('บันทึกผลจับสลากแล้ว');
  }
}

document.addEventListener('click', async ev => {
  const btn = ev.target.closest('[data-action]');
  if (!btn) return;
  btn.disabled = true;
  try { await handleAction(btn); } catch (err) { toast(errText(err)); console.error(err); }
  finally { btn.disabled = false; }
});
document.addEventListener('submit', async ev => {
  const form = ev.target;
  if (!form.matches('form')) return;
  ev.preventDefault();
  const submitter = ev.submitter || null;
  if (submitter) submitter.disabled = true;
  try { await handleForm(form, submitter); } catch (err) { toast(errText(err)); console.error(err); }
  finally { if (submitter) submitter.disabled = false; }
});

async function connect() {
  if (!configured) { render(); return; }
  try {
    // Pin one SDK version across all imports. No build step required for GitHub Pages.
    const [{ initializeApp }, firestore, authFns] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
    ]);
    state.sdk = { ...firestore, ...authFns };
    const app = initializeApp(firebaseConfig);
    state.db = firestore.getFirestore(app);
    state.auth = authFns.getAuth(app);
    let loaded = 0;
    const receive = key => snap => {
      state[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      loaded++; if (loaded >= 3) state.ready = true;
      state.error = ''; render();
    };
    const failed = err => { state.error = `เชื่อมฐานข้อมูลไม่สำเร็จ: ${errText(err)}`; render(); };
    firestore.onSnapshot(firestore.collection(state.db, 'teams'), receive('teams'), failed);
    firestore.onSnapshot(firestore.collection(state.db, 'matches'), receive('matches'), failed);
    firestore.onSnapshot(firestore.collection(state.db, 'draws'), receive('draws'), failed);
    authFns.onAuthStateChanged(state.auth, async user => {
      state.user = user; state.admin = false;
      if (user) {
        try { state.admin = (await firestore.getDoc(firestore.doc(state.db, 'admins', user.uid))).exists(); }
        catch (err) { state.error = `ตรวจสอบสิทธิ์ผู้จัดไม่สำเร็จ: ${errText(err)}`; }
      }
      render();
    });
  } catch (err) { state.error = `เริ่ม Firebase ไม่สำเร็จ: ${errText(err)}`; render(); }
}
render();
connect();
