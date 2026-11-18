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
  ['dash', 'exp', 'set'].forEach(t => $('tab-' + t).hidden = t !== b.dataset.tab);
  if (b.dataset.tab === 'exp') loadExp();
  if (b.dataset.tab === 'set') loadSettings();
});

const now = new Date();
const state = { year: now.getFullYear(), ym: null, scope: 'month', data: null };

function start(d) {
  $('shell').hidden = false;
  const years = []; for (let y = 2026; y <= now.getFullYear(); y++) years.push(y);
  $('year').innerHTML = years.map(y => `<option value="${y}">${y}年</option>`).join('');
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
  if (d.year === now.getFullYear()) store.set(KEY.data, d);
  if (!d.months.includes(state.ym)) state.ym = d.months[d.months.length - 1] || null;
  $('month').innerHTML = d.months.map(ym => `<option value="${ym}">${ymLabel(ym)}</option>`).join('');
  $('month').value = state.ym || '';
  $('month').hidden = state.scope === 'year';
  $('updated').textContent = d.updated + ' 時点';
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
  if (d.missingPrices && d.missingPrices.length) notes.push('光回線の単価が入っていない商材：' + d.missingPrices.map(esc).join('・') + '（設定タブで入れてください。入るまで0円で数えます）');
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

  $('bizTitle').textContent = year ? `事業別（${d.year}年 累計）` : `事業別（${d.year}年${ymLabel(state.ym)}）`;
  const row = (name, s, e, cls, salesNA) => `<tr class="${cls || ''}"><td>${name}</td><td class="${salesNA ? 'na' : ''}">${salesNA ? '—' : yen(s)}</td><td>${yen(e)}</td><td class="${s - e < 0 ? 'neg' : ''}">${yen(s - e)}</td><td>${!salesNA && s ? Math.round((s - e) / s * 100) + '%' : '—'}</td></tr>`;
  $('bizTable').innerHTML = '<thead><tr><th>事業</th><th>売上</th><th>経費</th><th>利益</th><th>利益率</th></tr></thead><tbody>' +
    d.biz.map(b => row(b.name, t.biz[b.key].sales, t.biz[b.key].expense, '', b.expenseOnly)).join('') +
    row('合計', t.sales, t.expense, 'total') + '</tbody>';

  // 光回線の内訳（月のときだけ）
  const fd = !year && d.detail[state.ym] && d.detail[state.ym].kaisen;
  $('fiberDetail').innerHTML = fd && fd.products && fd.products.length ? `<p class="muted small" style="margin:10px 0 0">光回線の内訳（開通 ${fd.count}件）：` +
    fd.products.map(p => `${esc(p.product)} ${p.count}件 × ${p.price == null ? '単価なし' : yen(p.price)}`).join(' ／ ') + '</p>' : '';

  drawChart(d);
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
      tip.innerHTML = `<b>${d.year}年${ymLabel(r.ym)}</b><div class="row"><span><i class="sw s1"></i> 売上</span><span>${yen(r.t.sales)}</span></div><div class="row"><span><i class="sw s2"></i> 経費</span><span>${yen(r.t.expense)}</span></div><div class="row"><span><i class="sw ln"></i> 利益</span><span>${yen(r.t.profit)}</span></div>`;
      tip.hidden = false;
      const x = Math.min(p.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
      tip.style.left = x + 'px'; tip.style.top = (p.clientY + 12) + 'px';
    };
    rc.addEventListener('mousemove', show); rc.addEventListener('touchstart', show, { passive: true });
    rc.addEventListener('mouseleave', () => tip.hidden = true);
  });
}
window.addEventListener('resize', () => { if (state.data && state.data.months.length) drawChart(state.data); });
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
      list.map(r => `<tr><td>${r.date.slice(5).replace('-', '/')}</td><td style="text-align:left">${esc(bizName(r.biz))}</td><td style="text-align:left">${esc(r.category)}</td><td style="text-align:left">${esc(r.memo)}</td><td>${yen(r.amount)}</td><td><button class="del" data-id="${esc(r.id)}">消す</button></td></tr>`).join('') + '</tbody>'
      : '<tr><td class="muted">この月の経費はまだありません</td></tr>';
    // 消すは2回押し（1回目で赤くなる）
    $('expTable').querySelectorAll('.del').forEach(b => b.onclick = () => {
      if (!b.classList.contains('arm')) { b.classList.add('arm'); b.textContent = 'もう一度押すと消す'; setTimeout(() => { b.classList.remove('arm'); b.textContent = '消す'; }, 4000); return; }
      b.disabled = true;
      api('deleteExpense', b.dataset.id).then(() => { loadExp(); refresh(); }).catch(e => alert(e.message));
    });
  }).catch(e => { if (e.message !== 'auth') $('expTable').innerHTML = `<tr><td class="err">${esc(e.message)}</td></tr>`; });
}
$('expMonth').onchange = loadExp;
$('eAdd').onclick = () => {
  const item = { date: $('eDate').value, biz: $('eBiz').value, category: $('eCat').value.trim(), memo: $('eMemo').value.trim(), amount: $('eAmt').value };
  if (!item.date || !item.amount) { $('eErr').textContent = '日付と金額を入れてください'; return; }
  $('eAdd').disabled = true; $('eErr').textContent = '';
  api('addExpense', item).then(() => {
    $('eCat').value = ''; $('eMemo').value = ''; $('eAmt').value = '';
    $('expMonth').value = item.date.slice(0, 7); loadExp(); refresh();
  }).catch(e => $('eErr').textContent = e.message).finally(() => $('eAdd').disabled = false);
};

// ===== 設定 =====
function loadSettings() {
  if (!$('wYm').value) $('wYm').value = today().slice(0, 7);
  $('priceList').innerHTML = '<span class="muted">読み込み中…</span>';
  api('settings').then(s => {
    $('priceList').innerHTML = s.products.length ? s.products.map(p => `<label><span>${esc(p.product)}</span><input type="number" inputmode="numeric" min="0" data-p="${esc(p.product)}" value="${p.price == null ? '' : p.price}" placeholder="円"></label>`).join('')
      : '<span class="muted">商材が読めませんでした（取得元の kaisen_osaka を確認）</span>';
  }).catch(e => { if (e.message !== 'auth') $('priceList').innerHTML = `<span class="err">${esc(e.message)}</span>`; });
}
$('savePrices').onclick = () => {
  const prices = {};
  $('priceList').querySelectorAll('input[data-p]').forEach(i => prices[i.dataset.p] = i.value === '' ? null : Number(i.value));
  $('priceMsg').textContent = '保存中…';
  api('setPrices', prices).then(() => { $('priceMsg').textContent = '保存しました'; refresh(); }).catch(e => $('priceMsg').textContent = e.message);
};
$('wSave').onclick = () => {
  $('wMsg').textContent = '保存中…';
  api('setManualSales', $('wYm').value, 'webma', $('wAmt').value, $('wMemo').value).then(() => { $('wMsg').textContent = `${$('wYm').value} を保存しました`; refresh(); }).catch(e => $('wMsg').textContent = e.message);
};

// ===== 起動 =====
if (!store.get(KEY.pass, '')) showLogin();
else start(store.get(KEY.data, null));
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
