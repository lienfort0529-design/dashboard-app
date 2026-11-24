// 全事業ダッシュボード（GitHub Pages）。データは Apps Script「全事業ダッシュボードAPI」
const API_URL = 'https://script.google.com/macros/s/AKfycbw5Lol3EeVAcN8S2T7DaCTrSRsaYVXFiY60b2P8SScMjJQ7u0oLXUORgWqk3Ji_NxwWyg/exec';
const KEY = { pass: 'zjPass', data: 'zjData' }; // localStorage は他のアプリと同じオリジンなので zj〜
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const $ = id => document.getElementById(id);
const yen = n => (n < 0 ? '−' : '') + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP');
const man = n => { const a = Math.abs(n); return (n < 0 ? '−' : '') + (a >= 1e8 ? (a / 1e8).toFixed(1) + '億' : a >= 1e4 ? Math.round(a / 1e4).toLocaleString() + '万' : Math.round(a)); };
const ymLabel = ym => Number(ym.slice(5)) + '月';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// text/plain で送ると、ブラウザの事前確認（CORS）が要らない
function api(fn, ...args) {
  return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ fn: fn, args: args, pass: store.get(KEY.pass, '') }) })
    .then(r => r.json()).then(o => {
      if (o.auth) { showLogin('合言葉が違います'); throw new Error('auth'); }
      if (o.error) throw new Error(o.error);
      return o.result;
    });
}

// ===== 入口 =====
function showLogin(msg) { $('shell').hidden = true; $('login').hidden = false; $('loginErr').textContent = msg || ''; $('pass').focus(); }
$('loginBtn').onclick = () => {
  store.set(KEY.pass, $('pass').value.trim());
  $('loginErr').textContent = '確認中…';
  api('summary', state.year).then(d => { $('login').hidden = true; start(d); }).catch(e => { if (e.message !== 'auth') $('loginErr').textContent = e.message; });
};
$('pass').onkeydown = e => { if (e.key === 'Enter') $('loginBtn').click(); };
$('logout').onclick = () => { store.del(KEY.pass); store.del(KEY.data); showLogin(); };

document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
  ['dash', 'stmt', 'exp', 'set'].forEach(t => $('tab-' + t).hidden = t !== b.dataset.tab);
  if (b.dataset.tab === 'stmt') loadStmt();
  if (b.dataset.tab === 'exp') loadExp();
  if (b.dataset.tab === 'set') loadSettings();
});

const now = new Date();
// 1期＝5月〜翌4月（4月決算）。year＝決算月の年（2027 → 2027年4月期＝2026年5月〜2027年4月）
const FY_END = 4, fyNow = now.getFullYear() + (now.getMonth() + 1 > FY_END ? 1 : 0);
const fyLabel = y => `${y}年${FY_END}月期`;
const ymFull = ym => `${ym.slice(0, 4)}年${Number(ym.slice(5))}月`;
const state = { year: fyNow, ym: null, scope: 'month', data: null };

function start(d) {
  $('shell').hidden = false;
  const years = []; for (let y = 2027; y <= fyNow; y++) years.push(y);
  $('year').innerHTML = years.map(y => `<option value="${y}">${fyLabel(y)}</option>`).join('');
  $('year').value = state.year;
  if (d) setData(d);
  refresh();
}

function refresh(fresh) {
  $('updated').textContent = '読み込み中…';
  return api('summary', state.year, !!fresh).then(setData).catch(e => { if (e.message !== 'auth') $('updated').textContent = '読み込めませんでした：' + e.message; });
}

function setData(d) {
  state.data = d;
  if (d.year === fyNow) store.set(KEY.data, d);
  if (!d.months.includes(state.ym)) state.ym = d.months[d.months.length - 1] || null;
  $('month').innerHTML = d.months.map(ym => `<option value="${ym}">${ymLabel(ym)}</option>`).join('');
  $('month').value = state.ym || '';
  $('month').hidden = state.scope === 'year';
  $('updated').textContent = d.updated + ' 時点';
  $('pendBadge').hidden = !d.pending; $('pendBadge').textContent = d.pending || '';
  render();
}

$('year').onchange = () => { state.year = Number($('year').value); state.ym = null; refresh(); };
$('month').onchange = () => { state.ym = $('month').value; render(); };
$('reload').onclick = () => refresh(true);
document.querySelectorAll('#scope button').forEach(b => b.onclick = () => {
  state.scope = b.dataset.v;
  document.querySelectorAll('#scope button').forEach(x => x.classList.toggle('on', x === b));
  $('month').hidden = state.scope === 'year';
  render();
});

// ===== 集計 =====
const salesBiz = d => d.biz.filter(b => !b.expenseOnly);
function totals(d, yms) {
  const t = { sales: 0, expense: 0, biz: {} };
  d.biz.forEach(b => t.biz[b.key] = { sales: 0, expense: 0 });
  yms.forEach(ym => d.biz.forEach(b => {
    const s = d.sales[ym][b.key] || 0, e = d.expense[ym][b.key] || 0;
    t.biz[b.key].sales += s; t.biz[b.key].expense += e; t.sales += s; t.expense += e;
  }));
  t.profit = t.sales - t.expense;
  return t;
}

function render() {
  const d = state.data;
  if (!d) return;
  const notes = [];
  if (!d.months.length) notes.push(`${d.start.slice(0, 4)}年${Number(d.start.slice(5))}月から表示します（LINE経理に事業を付けてからの数字）。`);
  if (d.pending) notes.push(`確認待ちの明細が ${d.pending}件 あります（明細タブで確かめて「反映」すると売上に入ります）`);
  (d.errors || []).forEach(e => notes.push('読めませんでした：' + esc(e)));
  $('notice').innerHTML = notes.map(n => `<div class="notice">${n}</div>`).join('');
  if (!d.months.length) { $('tiles').innerHTML = ''; $('bizTable').innerHTML = ''; $('fiberDetail').innerHTML = ''; $('chart').innerHTML = '<div class="empty">まだ表示する月がありません</div>'; $('monthTable').innerHTML = ''; return; }

  const year = state.scope === 'year';
  const yms = year ? d.months : [state.ym];
  const t = totals(d, yms);
  // 比較：月＝前月、年間＝なし
  const i = d.months.indexOf(state.ym), prev = !year && i > 0 ? totals(d, [d.months[i - 1]]) : null;
  const diff = (cur, old, goodUp) => {
    if (!prev) return year ? `${ymLabel(d.months[0])}〜${ymLabel(d.months[d.months.length - 1])}の合計` : '前月の数字なし';
    const v = cur - old, good = goodUp ? v >= 0 : v <= 0;
    return `前月比 <span class="${v === 0 ? '' : good ? 'up' : 'down'}">${v >= 0 ? '+' : '−'}${yen(Math.abs(v)).slice(1)}</span>`;
  };
  $('tiles').innerHTML = [
    ['売上', t.sales, prev && prev.sales, true, ''],
    ['経費', t.expense, prev && prev.expense, false, ''],
    ['利益', t.profit, prev && prev.profit, true, 'profit'],
  ].map(([k, v, o, up, cls]) => `<div class="tile ${cls}"><div class="k">${k}${k === '利益' && t.sales ? `（利益率 ${Math.round(t.profit / t.sales * 100)}%）` : ''}</div><div class="v">${yen(v)}</div><div class="d">${diff(v, o, up)}</div></div>`).join('');

  $('bizTitle').textContent = year ? `事業別（${fyLabel(d.year)} 累計）` : `事業別（${ymFull(state.ym)}）`;
  const row = (name, s, e, cls, salesNA) => `<tr class="${cls || ''}"><td>${name}</td><td class="${salesNA ? 'na' : ''}">${salesNA ? '—' : yen(s)}</td><td>${yen(e)}</td><td class="${s - e < 0 ? 'neg' : ''}">${yen(s - e)}</td><td>${!salesNA && s ? Math.round((s - e) / s * 100) + '%' : '—'}</td></tr>`;
  $('bizTable').innerHTML = '<thead><tr><th>事業</th><th>売上</th><th>経費</th><th>利益</th><th>利益率</th></tr></thead><tbody>' +
    d.biz.map(b => row(b.name, t.biz[b.key].sales, t.biz[b.key].expense, '', b.expenseOnly)).join('') +
    row('合計', t.sales, t.expense, 'total') + '</tbody>';

  // 明細の件数（月のときだけ）
  const dm = !year && d.detail[state.ym] || {};
  const parts = (d.stmtBiz || []).filter(k => dm[k] && dm[k].count).map(k => `${esc(bizName(k))} ${dm[k].count}件`);
  $('fiberDetail').innerHTML = parts.length ? `<p class="muted small" style="margin:10px 0 0">反映した明細：${parts.join(' ／ ')}</p>` : '';

  drawChart(d);
  drawBizChart(d);
  $('monthTable').innerHTML = '<thead><tr><th>月</th><th>売上</th><th>経費</th><th>利益</th></tr></thead><tbody>' +
    d.months.map(ym => { const m = totals(d, [ym]); return `<tr><td>${ymLabel(ym)}</td><td>${yen(m.sales)}</td><td>${yen(m.expense)}</td><td class="${m.profit < 0 ? 'neg' : ''}">${yen(m.profit)}</td></tr>`; }).join('') +
    (() => { const a = totals(d, d.months); return `<tr class="total"><td>累計</td><td>${yen(a.sales)}</td><td>${yen(a.expense)}</td><td class="${a.profit < 0 ? 'neg' : ''}">${yen(a.profit)}</td></tr>`; })() + '</tbody>';
}

// ===== グラフ：月ごとの売上・経費（棒）と利益（線）。同じ円の軸1本 =====
function drawChart(d) {
  const el = $('chart'), W = Math.max(320, el.clientWidth || 600), H = 240, L = 48, R = 8, T = 10, B = 26;
  const rows = d.months.map(ym => ({ ym: ym, t: totals(d, [ym]) }));
  const max = Math.max(1, ...rows.map(r => Math.max(r.t.sales, r.t.expense, r.t.profit)));
  const min = Math.min(0, ...rows.map(r => r.t.profit));
  const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map(m => m * p).find(x => x >= v); };
  const step = nice((max - min) / 4), top = Math.ceil(max / step) * step, bot = Math.floor(min / step) * step;
  const y = v => T + (top - v) / (top - bot) * (H - T - B);
  const cw = (W - L - R) / rows.length, bw = Math.max(4, Math.min(28, cw * 0.32)), gap = 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="月ごとの売上・経費・利益">`;
  for (let v = bot; v <= top + 1e-6; v += step) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${man(v)}</text>`;
  const bar = (x, v, color) => {
    const y0 = y(0), y1 = y(Math.max(v, 0)), h = Math.max(0, y0 - y1), r = Math.min(4, h, bw / 2);
    if (h <= 0) return '';
    return `<path fill="${color}" d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z"/>`;
  };
  const pts = [];
  rows.forEach((r, i) => {
    const cx = L + cw * i + cw / 2;
    s += bar(cx - bw - gap / 2, r.t.sales, 'var(--s1)') + bar(cx + gap / 2, r.t.expense, 'var(--s2)');
    s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${ymLabel(r.ym)}</text>`;
    pts.push([cx, y(r.t.profit)]);
  });
  s += `<line class="base" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
  if (pts.length > 1) s += `<polyline fill="none" stroke="var(--ln)" stroke-width="2" stroke-linejoin="round" points="${pts.map(p => p.join(',')).join(' ')}"/>`;
  pts.forEach(p => s += `<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--ln)" stroke="var(--surface)" stroke-width="2"/>`);
  rows.forEach((r, i) => s += `<rect data-i="${i}" x="${L + cw * i}" y="${T}" width="${cw}" height="${H - T - B}" fill="transparent"/>`);
  el.innerHTML = s + '</svg>';
  const tip = $('tip');
  el.querySelectorAll('rect[data-i]').forEach(rc => {
    const show = e => {
      const r = rows[rc.dataset.i], p = e.touches ? e.touches[0] : e;
      tip.innerHTML = `<b>${ymFull(r.ym)}</b><div class="row"><span><i class="sw s1"></i> 売上</span><span>${yen(r.t.sales)}</span></div><div class="row"><span><i class="sw s2"></i> 経費</span><span>${yen(r.t.expense)}</span></div><div class="row"><span><i class="sw ln"></i> 利益</span><span>${yen(r.t.profit)}</span></div>`;
      tip.hidden = false;
      const x = Math.min(p.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = x + 'px'; tip.style.top = (p.clientY + 12) + 'px';
    };
    rc.addEventListener('mousemove', show); rc.addEventListener('touchstart', show, { passive: true });
    rc.addEventListener('mouseleave', () => tip.hidden = true);
  });
}
// ===== 事業ごとの推移：売上・経費・利益を切り替え、事業ごとに折れ線1本（色は事業で固定） =====
const BIZ_COLOR = { jutaku: 'var(--b1)', kyushu: 'var(--b2)', kaisen: 'var(--b3)', webma: 'var(--b4)', common: 'var(--b5)' };
let bizMetric = 'sales';
document.querySelectorAll('#bizMetric button').forEach(b => b.onclick = () => {
  bizMetric = b.dataset.v;
  document.querySelectorAll('#bizMetric button').forEach(x => x.classList.toggle('on', x === b));
  if (state.data && state.data.months.length) drawBizChart(state.data);
});
function drawBizChart(d) {
  const el = $('bizChart'), W = Math.max(320, el.clientWidth || 600), H = 240, L = 48, R = 12, T = 10, B = 26;
  const val = (ym, b) => { const s = d.sales[ym][b.key] || 0, e = d.expense[ym][b.key] || 0; return bizMetric === 'sales' ? s : bizMetric === 'expense' ? e : s - e; };
  // 売上は売上のある事業だけ。数字が全部 0 の事業は出さない
  const series = d.biz.filter(b => !(bizMetric === 'sales' && b.expenseOnly)).map(b => ({ b: b, v: d.months.map(ym => val(ym, b)) })).filter(x => x.v.some(v => v));
  $('bizLegend').innerHTML = series.map(x => `<span><i class="sw" style="background:${BIZ_COLOR[x.b.key]}"></i>${esc(x.b.name)}</span>`).join('');
  if (!series.length) { el.innerHTML = '<div class="empty">まだ数字がありません</div>'; return; }
  const all = series.flatMap(x => x.v), max = Math.max(1, ...all), min = Math.min(0, ...all);
  const nice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map(m => m * p).find(x => x >= v); };
  const step = nice((max - min) / 4), top = Math.ceil(max / step) * step, bot = Math.floor(min / step) * step;
  const y = v => T + (top - v) / (top - bot) * (H - T - B);
  const n = d.months.length, cw = (W - L - R) / n, x = i => L + cw * i + cw / 2;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="事業ごとの月の推移">`;
  for (let v = bot; v <= top + 1e-6; v += step) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${man(v)}</text>`;
  d.months.forEach((ym, i) => s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${ymLabel(ym)}</text>`);
  s += `<line class="base" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/><line class="xh" id="bizXh" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>`;
  series.forEach(sr => {
    const c = BIZ_COLOR[sr.b.key];
    if (n > 1) s += `<polyline fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" points="${sr.v.map((v, i) => x(i) + ',' + y(v)).join(' ')}"/>`;
    sr.v.forEach((v, i) => s += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${c}" stroke="var(--surface)" stroke-width="2"/>`);
  });
  d.months.forEach((ym, i) => s += `<rect data-i="${i}" x="${L + cw * i}" y="${T}" width="${cw}" height="${H - T - B}" fill="transparent"/>`);
  el.innerHTML = s + '</svg>';
  const tip = $('tip'), xh = el.querySelector('#bizXh'), label = { sales: '売上', expense: '経費', profit: '利益' }[bizMetric];
  el.querySelectorAll('rect[data-i]').forEach(rc => {
    const i = Number(rc.dataset.i);
    const show = e => {
      const p = e.touches ? e.touches[0] : e;
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${ymFull(d.months[i])}の${label}</b>` + series.slice().sort((a, b) => b.v[i] - a.v[i]).map(sr => `<div class="row"><span><i class="sw" style="background:${BIZ_COLOR[sr.b.key]}"></i> ${esc(sr.b.name)}</span><span>${yen(sr.v[i])}</span></div>`).join('');
      tip.hidden = false;
      tip.style.left = Math.min(p.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + 'px'; tip.style.top = (p.clientY + 12) + 'px';
    };
    rc.addEventListener('mousemove', show); rc.addEventListener('touchstart', show, { passive: true });
    rc.addEventListener('mouseleave', () => { tip.hidden = true; xh.setAttribute('visibility', 'hidden'); });
  });
}
window.addEventListener('resize', () => { if (state.data && state.data.months.length) { drawChart(state.data); drawBizChart(state.data); } });
document.addEventListener('touchstart', e => { if (!e.target.closest('#chart')) $('tip').hidden = true; }, { passive: true });

// ===== 経費 =====
const bizOptions = () => ((state.data && state.data.biz) || []).map(b => `<option value="${b.key}">${b.name}</option>`).join('');
const bizName = k => (((state.data && state.data.biz) || []).find(b => b.key === k) || {}).name || k;
function loadExp() {
  if (!$('expMonth').value) $('expMonth').value = today().slice(0, 7);
  if (!$('eDate').value) $('eDate').value = today();
  if (!$('eBiz').options.length) $('eBiz').innerHTML = bizOptions();
  $('expTable').innerHTML = '<tr><td class="muted">読み込み中…</td></tr>';
  api('expenses', $('expMonth').value).then(list => {
    $('expTotal').textContent = list.length ? `${list.length}件　合計 ${yen(list.reduce((a, r) => a + r.amount, 0))}` : '';
    $('expTable').innerHTML = list.length ? '<thead><tr><th>日付</th><th>事業</th><th>科目</th><th>内容</th><th>金額</th><th></th></tr></thead><tbody>' +
      list.map(r => `<tr><td>${r.date.slice(5).replace('-', '/')}</td><td style="text-align:left">${esc(bizName(r.biz))}</td><td style="text-align:left">${esc(r.category)}</td><td style="text-align:left">${esc(r.memo)}${r.id.startsWith('fx:') ? '<span class="tag">固定</span>' : ''}</td><td><button class="amt" data-id="${esc(r.id)}" data-v="${r.amount}" title="金額を直す">${yen(r.amount)}</button></td><td><button class="del" data-id="${esc(r.id)}">消す</button></td></tr>`).join('') + '</tbody>'
      : '<tr><td class="muted">この月の経費はまだありません</td></tr>';
    // 金額を押すと、その場で直せる
    $('expTable').querySelectorAll('.amt').forEach(b => b.onclick = () => {
      const td = b.parentNode;
      td.innerHTML = `<span class="amt-edit"><input type="number" inputmode="numeric" value="${b.dataset.v}"><button class="del">保存</button></span>`;
      const inp = td.querySelector('input'); inp.focus();
      const save = () => { td.querySelector('button').disabled = true; api('updateExpense', b.dataset.id, { amount: inp.value }).then(() => { loadExp(); refresh(true); }).catch(e => alert(e.message)); };
      td.querySelector('button').onclick = save; inp.onkeydown = e => { if (e.key === 'Enter') save(); };
    });
    // 消すは2回押し（1回目で赤くなる）
    $('expTable').querySelectorAll('.del').forEach(b => b.onclick = () => {
      if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'もう一度押すと消す'; setTimeout(() => { b.classList.remove('arm'); b.textContent = '消す'; }, 4000); return; }
      b.disabled = true;
      api('deleteExpense', b.dataset.id).then(() => { loadExp(); refresh(); }).catch(e => alert(e.message));
    });
  }).catch(e => { if (e.message !== 'auth') $('expTable').innerHTML = `<tr><td class="err">${esc(e.message)}</td></tr>`; });
}
$('expMonth').onchange = loadExp;

// ===== カード明細 =====
const EXP_CATS = ['旅費交通費', '会議費', '接待交際費', '消耗品費', '通信費', '広告宣伝費', '車両費', '支払手数料', '外注費', '地代家賃', '水道光熱費', '新聞図書費', '研修費', '福利厚生費', '租税公課', '諸会費', '雑費'];
const cat2 = sel => '<option value="">科目</option>' + EXP_CATS.map(c => `<option${c === sel ? ' selected' : ''}>${c}</option>`).join('');
const biz2 = sel => ((state.data && state.data.biz) || []).map(b => `<option value="${b.key}"${b.key === sel ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
let cardLines = [];
function cardTotal() {
  const on = [...$('cTable').querySelectorAll('tr[data-i]')].filter(tr => tr.querySelector('[data-f=on]').checked);
  $('cTotal').textContent = `${on.length}件　合計 ${yen(on.reduce((a, tr) => a + (Number(tr.querySelector('[data-f=amount]').value) || 0), 0))}`;
}
function drawCard() {
  $('cBox').hidden = !cardLines.length;
  $('cAllBiz').innerHTML = '<option value="">選ぶ</option>' + biz2(''); $('cAllCat').innerHTML = cat2('');
  $('cTable').innerHTML = '<thead><tr><th></th><th>利用日</th><th>お店</th><th>金額</th><th>事業</th><th>科目</th></tr></thead><tbody>' + cardLines.map((l, i) => `<tr data-i="${i}">
    <td><input type="checkbox" data-f="on" ${l.done ? 'disabled' : l.amount > 0 ? 'checked' : ''}></td>
    <td><input type="date" data-f="date" value="${l.date}"></td>
    <td style="text-align:left"><input data-f="memo" value="${esc(l.shop)}" style="width:100%;min-width:140px">${l.done ? '<span class="tag">入れ済み</span>' : l.dup ? '<span class="tag">重複かも</span>' : ''}${l.amount < 0 ? '<span class="tag">返品・マイナス</span>' : ''}</td>
    <td><input type="number" data-f="amount" value="${l.amount}" style="width:100px"></td>
    <td><select data-f="biz">${biz2('common')}</select></td>
    <td><select data-f="category">${cat2('')}</select></td></tr>`).join('') + '</tbody>';
  $('cTable').querySelectorAll('input,select').forEach(x => x.onchange = cardTotal);
  cardTotal();
}
$('cAllBiz').onchange = () => { if ($('cAllBiz').value) $('cTable').querySelectorAll('[data-f=biz]').forEach(s => s.value = $('cAllBiz').value); };
$('cAllCat').onchange = () => { if ($('cAllCat').value) $('cTable').querySelectorAll('[data-f=category]').forEach(s => s.value = $('cAllCat').value); };
$('cRead').onclick = () => {
  const file = $('cFile').files[0];
  if (!file) { $('cMsg').textContent = 'ファイルを選んでください'; return; }
  $('cRead').disabled = true; $('cMsg').textContent = '読み取り中…（30秒ほどかかることがあります）';
  const rd = new FileReader();
  rd.onload = () => api('readCardStatement', { name: file.name, data: String(rd.result).split(',')[1] }).then(r => {
    cardLines = r.lines; drawCard();
    $('cMsg').textContent = r.lines.length ? `${r.lines.length}行 読めました。確かめて「まとめて入れる」を押してください` : '利用日と金額の行が見つかりませんでした（CSV があればそちらも試してください）';
  }).catch(e => $('cMsg').textContent = e.message).finally(() => $('cRead').disabled = false);
  rd.readAsDataURL(file);
};
$('cAdd').onclick = () => {
  const list = [...$('cTable').querySelectorAll('tr[data-i]')].filter(tr => tr.querySelector('[data-f=on]').checked).map(tr => {
    const o = { id: cardLines[tr.dataset.i].id }; tr.querySelectorAll('[data-f]').forEach(x => { if (x.dataset.f !== 'on') o[x.dataset.f] = x.value; }); return o;
  });
  if (!list.length) { $('cMsg').textContent = '入れる行がありません'; return; }
  $('cAdd').disabled = true;
  api('addExpenses', list).then(r => {
    $('cMsg').textContent = `${r.added}件 経費に入れました` + (r.dup ? `（${r.dup}件は入れ済み）` : '');
    cardLines = []; drawCard(); $('cFile').value = ''; loadExp(); refresh(true);
  }).catch(e => $('cMsg').textContent = e.message).finally(() => $('cAdd').disabled = false);
};
$('eAdd').onclick = () => {
  const item = { date: $('eDate').value, biz: $('eBiz').value, category: $('eCat').value.trim(), memo: $('eMemo').value.trim(), amount: $('eAmt').value };
  if (!item.date || !item.amount) { $('eErr').textContent = '日付と金額を入れてください'; return; }
  $('eAdd').disabled = true; $('eErr').textContent = '';
  api('addExpense', item).then(() => {
    $('eCat').value = ''; $('eMemo').value = ''; $('eAmt').value = '';
    $('expMonth').value = item.date.slice(0, 7); loadExp(); refresh();
  }).catch(e => $('eErr').textContent = e.message).finally(() => $('eAdd').disabled = false);
};

// ===== 明細 =====
const stmtBizOptions = (sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + ((state.data && state.data.stmtBiz) || ['kaisen', 'webma']).map(k => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(bizName(k))}</option>`).join('');
let partnerCache = [];
function loadPartners() {
  return api('partners').then(list => { partnerCache = list; $('partnerList').innerHTML = list.map(p => `<option value="${esc(p.name)}">`).join(''); return list; });
}
function loadStmt() {
  if (!$('stmtMonth').value) $('stmtMonth').value = today().slice(0, 7);
  if (!$('uBiz').options.length) $('uBiz').innerHTML = stmtBizOptions();
  loadPartners().catch(() => {});
  $('pendList').innerHTML = '<p class="muted">読み込み中…</p>';
  api('statements', $('stmtMonth').value).then(list => {
    const pend = list.filter(r => r.status === '確認待ち'), rest = list.filter(r => r.status !== '確認待ち' && (r.date || r.received).slice(0, 7) === $('stmtMonth').value);
    $('pendBadge').hidden = !pend.length; $('pendBadge').textContent = pend.length || '';
    $('pendList').innerHTML = pend.length ? pend.map(r => `<div class="stmt" data-id="${esc(r.id)}">
      <div class="head"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.name)}</a><span class="muted small">${esc(r.received)} 受信・${r.source.startsWith('gm:') ? 'メール' : '画面から'}</span></div>
      <div class="form">
        <label>事業<select data-f="biz">${stmtBizOptions(r.biz, r.biz ? '' : '選んでください')}</select></label>
        <label>取引先<input data-f="partner" list="partnerList" value="${esc(r.partner)}"></label>
        <label>支払日<input data-f="date" type="date" value="${esc(r.date)}"></label>
        <label>金額（円）<input data-f="amount" type="number" inputmode="numeric" value="${r.amount || ''}"></label>
        <div class="acts"><button class="primary" data-act="ok">反映</button><button class="ghost" data-act="ng">除外</button></div>
      </div>
      <p class="muted small" style="margin:6px 0 0">${esc(r.note)}</p><p class="err small" data-err></p></div>`).join('')
      : '<p class="muted">確認待ちの明細はありません</p>';
    $('pendList').querySelectorAll('.stmt').forEach(el => {
      const f = k => el.querySelector(`[data-f="${k}"]`).value, err = el.querySelector('[data-err]');
      el.querySelector('[data-act="ok"]').onclick = e => {
        e.target.disabled = true; err.textContent = '';
        api('approveStatement', el.dataset.id, { biz: f('biz'), partner: f('partner'), date: f('date'), amount: f('amount') })
          .then(() => { loadStmt(); refresh(true); }).catch(x => { err.textContent = x.message; e.target.disabled = false; });
      };
      el.querySelector('[data-act="ng"]').onclick = e => {
        e.target.disabled = true;
        api('setStatementStatus', el.dataset.id, '除外').then(() => loadStmt()).catch(x => { err.textContent = x.message; e.target.disabled = false; });
      };
    });
    const ok = rest.filter(r => r.status === '反映');
    $('stmtTotal').textContent = ok.length ? `反映 ${ok.length}件　合計 ${yen(ok.reduce((a, r) => a + r.amount, 0))}` : '';
    $('stmtTable').innerHTML = rest.length ? '<thead><tr><th>支払日</th><th>事業</th><th>取引先</th><th>金額</th><th>状態</th><th></th></tr></thead><tbody>' +
      rest.map(r => `<tr><td>${esc((r.date || '').slice(5).replace('-', '/'))}</td><td style="text-align:left">${esc(bizName(r.biz))}</td><td style="text-align:left"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.partner || r.name)}</a></td><td>${r.status === '反映' ? yen(r.amount) : '—'}</td><td>${esc(r.status)}</td><td><button class="del" data-id="${esc(r.id)}">確認待ちに戻す</button></td></tr>`).join('') + '</tbody>'
      : '<tr><td class="muted">この月に反映した明細はまだありません</td></tr>';
    $('stmtTable').querySelectorAll('.del').forEach(b => b.onclick = () => {
      b.disabled = true;
      api('setStatementStatus', b.dataset.id, '確認待ち').then(() => { loadStmt(); refresh(true); }).catch(e => alert(e.message));
    });
  }).catch(e => { if (e.message !== 'auth') $('pendList').innerHTML = `<p class="err">${esc(e.message)}</p>`; });
}
$('stmtMonth').onchange = loadStmt;
$('uPartner').onchange = () => { const p = partnerCache.find(x => x.name === $('uPartner').value.trim()); if (p && p.biz) $('uBiz').value = p.biz; };
$('uAdd').onclick = () => {
  const file = $('uFile').files[0];
  if (!file) { $('uMsg').textContent = 'ファイルを選んでください'; return; }
  if (file.size > 20 * 1024 * 1024) { $('uMsg').textContent = '20MB までのファイルにしてください'; return; }
  $('uAdd').disabled = true; $('uMsg').textContent = '読み取り中…（30秒ほどかかることがあります）';
  const rd = new FileReader();
  rd.onload = () => {
    api('uploadStatement', { biz: $('uBiz').value, partner: $('uPartner').value.trim(), name: file.name, data: String(rd.result).split(',')[1] })
      .then(r => {
        $('uMsg').textContent = r.dup ? 'このファイルはもう入っています' : `読み取りました：${r.amount ? yen(r.amount) : '金額なし'}・${r.date || '支払日なし'}。下の「確認待ち」で確かめてください`;
        $('uFile').value = ''; loadStmt(); refresh(true);
      }).catch(e => $('uMsg').textContent = e.message).finally(() => $('uAdd').disabled = false);
  };
  rd.readAsDataURL(file);
};
$('mailNow').onclick = () => {
  $('mailNow').disabled = true; $('mailMsg').textContent = '確認中…';
  api('checkMail').then(r => { $('mailMsg').textContent = r.busy ? 'いま自動で確認中です。少ししてから見てください' : r.added.length ? `${r.added.length}件 入りました` : '新しい明細はありません'; loadStmt(); refresh(true); })
    .catch(e => $('mailMsg').textContent = e.message).finally(() => $('mailNow').disabled = false);
};

// ===== 設定 =====
function partnerRow(p) {
  p = p || {};
  const join = v => Array.isArray(v) ? v.join(',') : (v || '');
  return `<div class="partner-row"><input data-f="name" placeholder="取引先名" value="${esc(p.name || '')}"><select data-f="biz">${stmtBizOptions(p.biz, '明細ごとに選ぶ')}</select><input data-f="email" type="email" placeholder="メールアドレス（空＝画面からだけ）" value="${esc(p.email || '')}"><input data-f="amountLabels" placeholder="金額の見出し" value="${esc(join(p.amountLabels))}"><input data-f="dateLabels" placeholder="日付の見出し" value="${esc(join(p.dateLabels))}"><button class="del" data-rm>消す</button></div>`;
}
function bindPartnerRows() { $('partnerRows').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => b.closest('.partner-row').remove()); }
// 固定費の科目（プルダウン）。一覧にない科目で保存されたものは、その行だけ選べるように足す
const FIXED_CATS = ['地代家賃', '水道光熱費', '通信費', 'リース料', '保険料', '支払手数料', '広告宣伝費', '外注費', '給料手当', '法定福利費', '福利厚生費', '車両費', '租税公課', '諸会費', '消耗品費', '新聞図書費', '雑費'];
const catOptions = sel => '<option value="">科目を選ぶ</option>' + (sel && !FIXED_CATS.includes(sel) ? [sel] : []).concat(FIXED_CATS).map(c => `<option${c === sel ? ' selected' : ''}>${esc(c)}</option>`).join('');
function fixedRow(f) {
  f = f || { day: 1, start: today().slice(0, 7) };
  const opts = ((state.data && state.data.biz) || []).map(b => `<option value="${b.key}"${b.key === (f.biz || 'common') ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
  return `<div class="fixed-row" data-id="${esc(f.id || '')}"><select data-f="biz">${opts}</select><select data-f="category">${catOptions(f.category)}</select><input data-f="memo" placeholder="内容（事務所家賃 など）" value="${esc(f.memo || '')}"><input data-f="amount" type="number" inputmode="numeric" placeholder="金額（円）" value="${f.amount || ''}"><input data-f="day" type="number" min="1" max="31" title="毎月の日" value="${f.day || 1}"><input data-f="start" type="month" title="開始月" value="${esc(f.start || '')}"><input data-f="end" type="month" title="終了月（空＝ずっと）" value="${esc(f.end || '')}"><button class="del" data-rm>消す</button></div>`;
}
function bindFixedRows() { $('fixedRows').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => b.closest('.fixed-row').remove()); }
$('addFixed').onclick = () => { $('fixedRows').insertAdjacentHTML('beforeend', fixedRow()); bindFixedRows(); };
$('saveFixed').onclick = () => {
  const list = [...$('fixedRows').querySelectorAll('.fixed-row:not(.partner-head)')].map(r => { const o = { id: r.dataset.id }; r.querySelectorAll('[data-f]').forEach(i => o[i.dataset.f] = i.value.trim()); return o; }).filter(f => f.memo || f.category || f.amount);
  $('fixedMsg').textContent = '保存中…'; $('saveFixed').disabled = true;
  api('saveFixedCosts', list).then(r => { drawFixed(r.list); $('fixedMsg').textContent = '保存しました' + (r.added.length ? `（経費に ${r.added.length}件 入れました）` : ''); refresh(true); })
    .catch(e => $('fixedMsg').textContent = e.message).finally(() => $('saveFixed').disabled = false);
};
function drawFixed(list) {
  $('fixedRows').innerHTML = '<div class="fixed-row partner-head"><span>事業</span><span>科目</span><span>内容</span><span>金額（円）</span><span>毎月の日</span><span>開始月</span><span>終了月</span><span></span></div>' + (list.length ? list : [null]).map(fixedRow).join('');
  bindFixedRows();
}
function loadSettings() {
  if (!$('wYm').value) $('wYm').value = today().slice(0, 7);
  $('fixedRows').innerHTML = '<span class="muted">読み込み中…</span>';
  api('fixedCosts').then(drawFixed).catch(e => { if (e.message !== 'auth') $('fixedRows').innerHTML = `<span class="err">${esc(e.message)}</span>`; });
  $('partnerRows').innerHTML = '<span class="muted">読み込み中…</span>';
  loadPartners().then(list => {
    $('partnerRows').innerHTML = '<div class="partner-row partner-head"><span>取引先名</span><span>事業</span><span>メールアドレス</span><span>金額の見出し</span><span>日付の見出し</span><span></span></div>' + (list.length ? list : [{}]).map(partnerRow).join('');
    bindPartnerRows();
  }).catch(e => { if (e.message !== 'auth') $('partnerRows').innerHTML = `<span class="err">${esc(e.message)}</span>`; });
}
$('addPartner').onclick = () => { $('partnerRows').insertAdjacentHTML('beforeend', partnerRow()); bindPartnerRows(); };
$('savePartners').onclick = () => {
  const list = [...$('partnerRows').querySelectorAll('.partner-row:not(.partner-head)')].map(r => { const o = {}; r.querySelectorAll('[data-f]').forEach(i => o[i.dataset.f] = i.value.trim()); return o; }).filter(p => p.name);
  $('partnerMsg').textContent = '保存中…';
  api('savePartners', list).then(l => { partnerCache = l; $('partnerMsg').textContent = '保存しました'; }).catch(e => $('partnerMsg').textContent = e.message);
};
$('wSave').onclick = () => {
  $('wMsg').textContent = '保存中…';
  api('setManualSales', $('wYm').value, 'webma', $('wAmt').value, $('wMemo').value).then(() => { $('wMsg').textContent = `${$('wYm').value} を保存しました`; refresh(); }).catch(e => $('wMsg').textContent = e.message);
};

// ===== 起動 =====
if (!store.get(KEY.pass, '')) showLogin();
else start(store.get(KEY.data, null));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
