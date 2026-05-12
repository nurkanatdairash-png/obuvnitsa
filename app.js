
'use strict';

/* ═══════════════════════════════════════════════════════
   ACCESS CODES — change these to whatever you like
═══════════════════════════════════════════════════════ */
const SELLER_CODE = 'prodavets2025';
const OWNER_CODE  = 'hozayka2025';

/* ═══════════════════════════════════════════════════════
   SUPABASE INIT
═══════════════════════════════════════════════════════ */
const { createClient } = supabase;
const SB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
const ST = {
  user: null,
  profile: null,
  role: null,   // 'owner' | 'seller'
  page: 'dash',
  dashPrd: 'today',
  repPrd: 'today',
  stockFilt: 'all',
  stockSort: 'name',
  histType: 'all',
  calYear: new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  calSel: null,
  qsData: null,
  confFn: null,
  sett: { low: 2 },
  // Local data cache
  products: [],
  sales: [],
  realtimeSubs: [],
};

const CFG = {
  LOC: 'ru-RU',
  CUR: '₸',
  POLL: 30000,
};

let _saleInProgress = false;

/* ═══════════════════════════════════════════════════════
   UTILS
═══════════════════════════════════════════════════════ */
const fmt = n => (n || 0).toLocaleString(CFG.LOC) + ' ' + CFG.CUR;
const fmtD = d => d.toLocaleDateString(CFG.LOC, { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtT = d => d.toLocaleTimeString(CFG.LOC, { hour: '2-digit', minute: '2-digit' });
const todayS = () => fmtD(new Date());
function parseD(s) {
  if (!s) return new Date(0);
  // ISO date string (YYYY-MM-DD) from Supabase
  if (s.includes('-') && s.length >= 10) return new Date(s + 'T00:00:00');
  // DD.MM.YYYY
  const p = s.split('.');
  if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
  return new Date(s);
}
const gv = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
const gn = id => parseFloat(gv(id)) || 0;
const gi = id => parseInt(gv(id)) || 0;
const esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const escA = s => String(s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

function toast(msg, type = 'ok') {
  const box = document.getElementById('toastBox');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function confDialog(ico, title, text, okLbl = 'Удалить', okCls = 'btn-danger') {
  return new Promise(res => {
    ST.confFn = res;
    document.getElementById('confIco').textContent = ico;
    document.getElementById('confTtl').textContent = title;
    document.getElementById('confTxt').textContent = text;
    const btn = document.getElementById('confOkBtn');
    btn.textContent = okLbl; btn.className = 'btn ' + okCls;
    document.getElementById('confOvl').classList.add('show');
  });
}
function confRes(v) {
  document.getElementById('confOvl').classList.remove('show');
  if (ST.confFn) { ST.confFn(v); ST.confFn = null; }
}
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

function setSyncState(s) {
  const dot = document.getElementById('syncDot');
  const txt = document.getElementById('syncTxt');
  if (!dot) return;
  if (s === 'loading') { dot.className = 'sync-dot loading'; txt.textContent = 'Загрузка...'; }
  else if (s === 'ok') { dot.className = 'sync-dot'; txt.textContent = 'Обновлено ' + new Date().toLocaleTimeString(CFG.LOC, { hour: '2-digit', minute: '2-digit' }); }
  else if (s === 'offline') { dot.className = 'sync-dot offline'; txt.textContent = 'Нет интернета'; }
  else { dot.className = 'sync-dot offline'; txt.textContent = 'Ошибка!'; }
}

window.addEventListener('online', () => {
  setSyncState('loading');
  if (ST.role) loadAll().then(() => { saveCache(ST.role, ST.role); renderAll(); });
});
window.addEventListener('offline', () => setSyncState('offline'));

function selPay(el, groupId) {
  document.querySelectorAll('#' + groupId + ' .pay-opt').forEach(o => o.classList.remove('sel-pay'));
  el.classList.add('sel-pay');
}
function getSelPay(groupId) {
  const s = document.querySelector('#' + groupId + ' .pay-opt.sel-pay');
  return s ? s.dataset.val : 'Наличные';
}

/* ═══════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════ */
function showLoading() {
  document.getElementById('loadingPage').style.display = 'flex';
  document.getElementById('authPage').style.display = 'none';
  document.getElementById('app').style.display = 'none';
}
function showAuth() {
  document.getElementById('loadingPage').style.display = 'none';
  document.getElementById('authPage').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}
function showApp() {
  document.getElementById('loadingPage').style.display = 'none';
  document.getElementById('authPage').style.display = 'none';
  const app = document.getElementById('app');
  app.style.display = 'flex';
  app.style.flexDirection = 'column';
}

function showAuthErr(msg) {
  const el = document.getElementById('authErr');
  el.textContent = msg;
  el.className = 'auth-err show';
}

function doAuthLogin() {
  const code = (document.getElementById('accessCode')?.value || '').trim();
  if (!code) { showAuthErr('Введи код'); return; }

  let role = null;
  if (code === OWNER_CODE)  role = 'owner';
  if (code === SELLER_CODE) role = 'seller';
  if (!role) { showAuthErr('Неверный код'); return; }

  const enteredName = (document.getElementById('sellerName')?.value || '').trim();
  const defaultName = role === 'owner' ? 'Хозяйка' : 'Продавщица';
  const name = enteredName || defaultName;
  ST.user    = { id: role, email: name };
  ST.profile = { role, full_name: name };
  ST.role    = role;
  saveLastUser(role, name);
  initApp();
}

async function doLogout() {
  if (ST._pollTimer) { clearInterval(ST._pollTimer); ST._pollTimer = null; }
  ST.realtimeSubs.forEach(sub => SB.removeChannel(sub));
  ST.realtimeSubs = [];
  try { localStorage.removeItem(_cacheKey(ST.role, ST.role)); } catch {}
  clearLastUser();
  ST.user = null; ST.profile = null; ST.role = null;
  ST.products = []; ST.sales = [];
  showAuth();
}

/* ═══════════════════════════════════════════════════════
   LOAD PROFILE
═══════════════════════════════════════════════════════ */
function loadProfile() {
  // Profile is set at login and restored from localStorage — nothing to fetch
}

function initArriveDateDefault() {
  const el = document.getElementById('aArriveDate');
  if (el && !el.value) el.value = new Date().toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════════════════
   LOAD DATA FROM SUPABASE
═══════════════════════════════════════════════════════ */
async function loadProducts() {
  const { data, error } = await SB.from('products')
    .select('*')
    .gt('qty', 0)          // skip fully sold-out rows — massively reduces dataset size
    .order('created_at', { ascending: false })
    .limit(3000);          // hard ceiling to prevent silent truncation
  if (error) {
    console.error('Products load error:', error);
    if (error.code === '42P01') {
      toast('❌ Таблица products не создана. Запусти supabase-setup.sql в Supabase.', 'err');
    } else if (error.code === 'PGRST301' || error.message?.includes('RLS') || error.message?.includes('policy')) {
      toast('❌ Нет доступа к данным (RLS). Запусти supabase-setup.sql в Supabase.', 'err');
    } else {
      toast('❌ Ошибка загрузки склада: ' + error.message, 'err');
    }
    return;
  }
  ST.products = (data || []).map(p => ({
    id: p.id,
    rowId: p.row_id || p.id,
    code: p.code || '',
    name: p.name,
    brand: p.brand || '',
    type: p.type || '',
    color: p.color || '',
    material: p.material || '',
    season: p.season || '',
    audience: p.audience || '',
    buyPrice: ST.role === 'owner' ? (p.buy_price || 0) : 0,
    buyPriceRaw: p.buy_price || 0,
    sellPrice: p.sell_price || 0,
    supplier: p.supplier || '',
    notes: p.notes || '',
    size: Number(p.size),
    qty: Number(p.qty),
    series: p.series || '',
    date: p.arrive_date || fmtD(new Date(p.created_at)),
    ts: new Date(p.created_at).getTime(),
  }));
}

async function loadSales() {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  const { data, error } = await SB.from('sales')
    .select('*')
    .gte('created_at', cutoff.toISOString()) // load last 12 months only
    .order('created_at', { ascending: false })
    .limit(5000);          // hard ceiling
  if (error) {
    console.error('Sales load error:', error);
    if (error.code === '42P01') {
      toast('❌ Таблица sales не создана. Запусти supabase-setup.sql в Supabase.', 'err');
    } else {
      toast('❌ Ошибка загрузки продаж: ' + error.message, 'err');
    }
    return;
  }
  ST.sales = (data || []).map(s => ({
    id: s.id,
    productRowId: s.product_row_id || '',
    name: s.name,
    size: Number(s.size),
    color: s.color || '',
    qty: Number(s.qty),
    price: Number(s.price),
    buyPrice: ST.role === 'owner' ? (s.buy_price || 0) : 0,
    buyPriceRaw: s.buy_price || 0,
    discount: s.discount || 0,
    total: Number(s.total),
    profit: ST.role === 'owner' ? (s.profit || 0) : 0,
    profitRaw: s.profit || 0,
    payment: s.payment || 'Наличные',
    customer: s.customer || '',
    note: s.note || '',
    date: s.sale_date ? fmtD(new Date(s.sale_date + 'T00:00:00')) : fmtD(new Date(s.created_at)),
    time: s.sale_time || fmtT(new Date(s.created_at)),
    sellerName: s.seller_name || '—',
    ts: new Date(s.created_at).getTime(),
  }));
}

async function loadAll() {
  if (!navigator.onLine) { setSyncState('offline'); return; }
  setSyncState('loading');
  const timeout = new Promise(resolve => setTimeout(resolve, 10000));
  await Promise.race([
    Promise.all([loadProducts(), loadSales()]),
    timeout,
  ]);
  setSyncState(navigator.onLine ? 'ok' : 'offline');
}

/* ═══════════════════════════════════════════════════════
   REFRESH BUTTON
═══════════════════════════════════════════════════════ */
async function doRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('spinning');
  await loadAll();
  renderAll();
  btn.classList.remove('spinning');
  toast('✅ Данные обновлены', 'ok');
}

/* ═══════════════════════════════════════════════════════
   REALTIME SUBSCRIPTIONS
═══════════════════════════════════════════════════════ */
function setupRealtime() {
  // Remove old subs
  ST.realtimeSubs.forEach(sub => SB.removeChannel(sub));
  ST.realtimeSubs = [];

  const productsSub = SB.channel('products-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, async () => {
      if (!ST.role) return;
      await loadProducts();
      renderAll();
      setSyncState('ok');
    })
    .subscribe((status, err) => { if (err) console.warn('Realtime products error:', err); });

  const salesSub = SB.channel('sales-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, async () => {
      if (!ST.role) return;
      await loadSales();
      renderAll();
      setSyncState('ok');
    })
    .subscribe((status, err) => { if (err) console.warn('Realtime sales error:', err); });

  ST.realtimeSubs = [productsSub, salesSub];
}

/* ═══════════════════════════════════════════════════════
   LOCAL DATA CACHE  (shows stale data instantly on re-entry)
═══════════════════════════════════════════════════════ */
function _cacheKey(userId, role) { return `obuvnitsa_v1_${userId}_${role}`; }

function loadCache(userId, role) {
  try {
    const raw = localStorage.getItem(_cacheKey(userId, role));
    if (!raw) return false;
    const { products, sales } = JSON.parse(raw);
    if (!Array.isArray(products) || !Array.isArray(sales)) return false;
    ST.products = products;
    ST.sales = sales;
    return true;
  } catch { return false; }
}

function saveCache(userId, role) {
  try {
    localStorage.setItem(_cacheKey(userId, role), JSON.stringify({
      products: ST.products,
      sales: ST.sales,
    }));
  } catch {}
}

// ── Last-user record for zero-wait instant boot ──────────
const _LAST_KEY = 'obuvnitsa_last';

function saveLastUser(role, name) {
  try { localStorage.setItem(_LAST_KEY, JSON.stringify({ role, name: name || '' })); } catch {}
}
function clearLastUser() {
  try { localStorage.removeItem(_LAST_KEY); } catch {}
}

function _hasLocalSession() {
  try {
    const lu = JSON.parse(localStorage.getItem(_LAST_KEY));
    return !!(lu?.role);
  } catch { return false; }
}

// Instantly restore the app from localStorage — zero network requests
function tryInstantBoot() {
  try {
    const lu = JSON.parse(localStorage.getItem(_LAST_KEY));
    if (!lu?.role) return false;
    const name = lu.name || (lu.role === 'owner' ? 'Хозяйка' : 'Продавщица');
    ST.role    = lu.role;
    ST.user    = { id: lu.role, email: name };
    ST.profile = { role: lu.role, full_name: name };
    if (!loadCache(lu.role, lu.role)) return false;
    showApp();
    setupRoleUI();
    navTo('dash');
    renderAll();
    return true;
  } catch { return false; }
}

/* ═══════════════════════════════════════════════════════
   APP INIT (called after login)
═══════════════════════════════════════════════════════ */
async function initApp() {
  const alreadyVisible = document.getElementById('app').style.display !== 'none';
  if (!alreadyVisible) showLoading();

  loadProfile();
  saveLastUser(ST.role, ST.profile?.full_name);

  const hasCached = loadCache(ST.role, ST.role);
  if (!alreadyVisible) {
    if (hasCached) {
      showApp();
      setupRoleUI();
      navTo('dash');
      renderAll();
    }
  } else {
    setupRoleUI();
    renderAll();
  }

  await loadAll();
  saveCache(ST.role, ST.role);

  if (!hasCached && !alreadyVisible) {
    showApp();
    setupRoleUI();
    navTo('dash');
  }
  renderAll();

  setupRealtime();
  if (ST._pollTimer) clearInterval(ST._pollTimer);
  ST._pollTimer = setInterval(async () => {
    await loadAll();
    saveCache(ST.role, ST.role);
    renderAll();
  }, CFG.POLL);
}

function setupRoleUI() {
  const role = ST.role;
  const chip = document.getElementById('tbRole');
  const nameEl = document.getElementById('tbUserName');
  chip.textContent = role === 'owner' ? '👑 Хозяйка' : '🧑‍💼 Продавщица';
  chip.className = 'tb-role ' + role;
  if (nameEl) nameEl.textContent = ST.profile?.full_name || '';

  // Show/hide owner elements
  document.querySelectorAll('.owner-elem').forEach(el => {
    el.style.display = role === 'owner' ? '' : 'none';
  });
  document.querySelectorAll('th.owner-elem, td.owner-elem').forEach(el => {
    el.style.display = role === 'owner' ? 'table-cell' : 'none';
  });

  // Arrive form: show buy price only to owner
  const buyField = document.getElementById('buyPriceField');
  const marginField = document.getElementById('marginField');
  const sellerNote = document.getElementById('sellerArriveNote');
  if (buyField) buyField.style.display = role === 'owner' ? '' : 'none';
  if (marginField) marginField.style.display = role === 'owner' ? '' : 'none';
  if (sellerNote) sellerNote.style.display = role === 'seller' ? 'block' : 'none';

  initArriveDateDefault();

  // Date line
  const dl = document.getElementById('dashDateLine');
  if (dl) dl.textContent = new Date().toLocaleDateString(CFG.LOC, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Settings
  const setLow = document.getElementById('setLow');
  if (setLow) setLow.value = ST.sett.low || 2;

  // Profile card
  renderProfileCard();
  initHistYear();
  fillSuppList();
}

function renderProfileCard() {
  const el = document.getElementById('profileCard');
  if (!el) return;
  el.innerHTML = `
    <div class="info-row"><span class="ir-lbl">Имя</span><span class="ir-val">${esc(ST.profile?.full_name || '—')}</span></div>
    <div class="info-row"><span class="ir-lbl">Роль</span><span class="ir-val">${ST.role === 'owner' ? '👑 Хозяйка' : '🧑‍💼 Продавщица'}</span></div>`;
}

/* ═══════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════ */
function navTo(p) {
  if (ST.role !== 'owner' && p === 'reports') {
    toast('⚠️ Отчёты — только для хозяйки', 'warn'); return;
  }
  ST.page = p;
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.mob-nav-item').forEach(el => el.classList.remove('active'));
  const pg = document.getElementById('page-' + p); if (pg) pg.classList.add('active');
  document.querySelectorAll('.mob-nav-item').forEach(el => {
    if (el.getAttribute('onclick') && el.getAttribute('onclick').includes("'" + p + "'")) el.classList.add('active');
  });
  renderAll();
  window.scrollTo(0, 0);
}

/* ═══════════════════════════════════════════════════════
   COMPUTED HELPERS
═══════════════════════════════════════════════════════ */
function buildSoldMap() {
  const m = {};
  ST.sales.forEach(s => {
    // Track by productRowId (most accurate)
    if (s.productRowId) {
      m[s.productRowId] = (m[s.productRowId] || 0) + s.qty;
    }
    // Also track by name+size (fallback)
    const k2 = s.name + '||' + String(s.size);
    m[k2] = (m[k2] || 0) + s.qty;
    // Also track by name+size+color
    const k3 = s.name + '||' + String(s.size) + '||' + (s.color || '');
    m[k3] = (m[k3] || 0) + s.qty;
  });
  return m;
}
function getRem(prod, sm) {
  // Try by rowId first
  let sold = 0;
  if (prod.rowId) {
    sold = sm[prod.rowId] || 0;
  }
  // If no sales found by rowId, use name+size as fallback
  if (sold === 0) {
    const k2 = prod.name + '||' + String(prod.size);
    sold = sm[k2] || 0;
  }
  return Math.max(0, prod.qty - sold);
}
function buildGroups(sm) {
  const g = {};
  ST.products.forEach(p => {
    const key = (p.code || '') + '||' + p.name + '||' + p.color;
    if (!g[key]) g[key] = {
      code: p.code || '', name: p.name, brand: p.brand || '', type: p.type || '',
      color: p.color, material: p.material || '', season: p.season || '', audience: p.audience || '',
      sellPrice: p.sellPrice, buyPrice: p.buyPrice || 0, supplier: p.supplier || '',
      notes: p.notes || '', firstDate: p.date, sizes: [], totalIn: 0, totalSold: 0, totalRem: 0
    };
    const rem = getRem(p, sm);
    g[key].sizes.push({ ...p, rem });
    g[key].totalIn += p.qty;
    g[key].totalSold += p.qty - rem;
    g[key].totalRem += rem;
  });
  return Object.values(g);
}
const LOW = () => ST.sett.low || 2;

function byPrd(arr, prd, field = 'date') {
  const now = new Date(), today = fmtD(now);
  if (prd === 'today') return arr.filter(x => x[field] === today);
  if (prd === 'week') { const wk = new Date(now - 7 * 864e5); return arr.filter(x => parseD(x[field]) >= wk); }
  if (prd === 'month') return arr.filter(x => { const d = parseD(x[field]); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
  if (prd === '3m') { const t = new Date(now); t.setMonth(t.getMonth() - 3); return arr.filter(x => parseD(x[field]) >= t); }
  if (prd === 'year') return arr.filter(x => parseD(x[field]).getFullYear() === now.getFullYear());
  return arr;
}
function byDateRange(arr, from, to, field = 'date') {
  if (!from && !to) return arr;
  return arr.filter(x => {
    const d = parseD(x[field]);
    if (from && d < new Date(from)) return false;
    if (to) { const t = new Date(to); t.setDate(t.getDate() + 1); if (d >= t) return false; }
    return true;
  });
}

/* ═══════════════════════════════════════════════════════
   RENDER ALL
═══════════════════════════════════════════════════════ */
function renderAll() {
  renderDash(); renderStock(); renderArriveRecent();
  renderSalesForm(); renderSalesTbl();
  renderCalendar(); renderReports(); renderHistory();
  renderDbStats(); updateBadges(); fillSuppList();
}

function updateBadges() {
  const sm = buildSoldMap();
  const groups = buildGroups(sm);
  const lowCount = groups.filter(g => g.totalRem > 0 && g.totalRem <= LOW()).length;
  const b = document.getElementById('mobLowBadge');
  if (b) { b.style.display = lowCount > 0 ? 'block' : 'none'; b.textContent = lowCount; }
  const sub = document.getElementById('stockSub');
  if (sub) {
    const remPairs = ST.products.reduce((a, p) => a + getRem(p, sm), 0);
    const invStr = ST.role === 'owner'
      ? ` · вложено ${fmt(ST.products.reduce((a, p) => a + (p.buyPriceRaw || 0) * getRem(p, sm), 0))}`
      : '';
    sub.textContent = `${groups.filter(g => g.totalRem > 0).length} моделей · ${remPairs} пар${invStr}${lowCount ? ` · ⚠️ ${lowCount} заканчивается` : ''}`;
  }
}

/* ═══════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════ */
function setDashPrd(p, btn) {
  ST.dashPrd = p;
  document.querySelectorAll('#dashPsel .psel-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderDash();
}

function renderDash() {
  if (ST.page !== 'dash') return;
  const sm = buildSoldMap();
  const sales = byPrd(ST.sales, ST.dashPrd);
  const today = fmtD(new Date());
  const totalRem = ST.products.reduce((a, p) => a + getRem(p, sm), 0);
  const rev = sales.reduce((a, s) => a + s.total, 0);
  // Profit uses raw values always for dashboard (role check done at data layer)
  const profitRaw = ST.role === 'owner' ? sales.reduce((a, s) => a + (s.profitRaw || 0), 0) : 0;
  const pairs = sales.reduce((a, s) => a + s.qty, 0);
  const margin = rev > 0 ? Math.round(profitRaw / rev * 100) : 0;

  const groups = buildGroups(sm);
  const lowG = groups.filter(g => g.totalRem > 0 && g.totalRem <= LOW());
  const la = document.getElementById('lowAlert'), lai = document.getElementById('lowAlertItems');
  if (la) {
    la.className = 'low-alert' + (lowG.length ? ' show' : '');
    if (lai) lai.innerHTML = lowG.slice(0, 8).map(g => `<div class="low-item">${esc(g.name)} ${esc(g.color)} — ${g.totalRem} пар</div>`).join('');
  }

  // Stock financial totals (owner only)
  const totalInvested  = ST.products.reduce((a, p) => a + (p.buyPriceRaw || 0) * getRem(p, sm), 0);
  const totalStockSell = ST.products.reduce((a, p) => a + (p.sellPrice || 0) * getRem(p, sm), 0);

  let kpiHtml = `
    <div class="kpi"><div class="kpi-stripe orange"></div><div class="kpi-label">Пар в наличии</div><div class="kpi-val orange">${totalRem}</div><div class="kpi-sub">${groups.length} моделей</div></div>
    ${ST.role === 'owner' ? `<div class="kpi"><div class="kpi-stripe green"></div><div class="kpi-label">Выручка</div><div class="kpi-val green">${fmt(rev)}</div><div class="kpi-sub">${sales.length} продаж · ${pairs} пар</div></div>` : ''}
    <div class="kpi"><div class="kpi-stripe blue"></div><div class="kpi-label">Продаж</div><div class="kpi-val blue">${sales.length}</div><div class="kpi-sub">${pairs} пар</div></div>`;
  if (ST.role === 'owner') {
    kpiHtml += `
      <div class="kpi"><div class="kpi-stripe gold"></div><div class="kpi-label">Прибыль 👑</div><div class="kpi-val gold">${fmt(profitRaw)}</div><div class="kpi-sub">Маржа ${margin}%</div></div>
      <div class="kpi"><div class="kpi-stripe teal"></div><div class="kpi-label">Средний чек</div><div class="kpi-val teal">${fmt(sales.length ? Math.round(rev / sales.length) : 0)}</div></div>
      <div class="kpi"><div class="kpi-stripe red"></div><div class="kpi-label">Вложено в склад 👑</div><div class="kpi-val red">${fmt(totalInvested)}</div><div class="kpi-sub">себестоимость остатка</div></div>
      <div class="kpi"><div class="kpi-stripe purple"></div><div class="kpi-label">Склад по ценам продажи</div><div class="kpi-val purple">${fmt(totalStockSell)}</div><div class="kpi-sub">если всё продать</div></div>`;
  }
  document.getElementById('dashKpi').innerHTML = kpiHtml;

  // Sparkline
  const days14 = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = fmtD(d);
    const daySales = ST.sales.filter(s => s.date === ds);
    days14.push({ label: d.toLocaleDateString(CFG.LOC, { day: '2-digit', month: '2-digit' }), rev: daySales.reduce((a, s) => a + s.total, 0), isToday: ds === today });
  }
  const maxRev = Math.max(...days14.map(d => d.rev), 1);
  const spark = document.getElementById('dashSparkline');
  if (spark) spark.innerHTML = days14.map(d => `<div class="spark-b${d.isToday ? ' today' : ''}" style="height:${Math.max(d.rev / maxRev * 100, 3)}%" title="${d.label}: ${fmt(d.rev)}"></div>`).join('');
  const sl = document.getElementById('dashSparkLbls');
  if (sl) sl.innerHTML = `<span>${days14[0].label}</span><span style="flex:1;text-align:center">${days14[6].label}</span><span>${days14[13].label}</span>`;
  const st2 = document.getElementById('dashSparkTotal');
  if (st2) st2.textContent = `Итого за 14 дней: ${fmt(days14.reduce((a, d) => a + d.rev, 0))}`;

  // Recent
  const recent = ST.sales.slice(0, 10);
  const re = document.getElementById('dashRecent');
  if (re) re.innerHTML = recent.length ? recent.map(s => `<tr>
    <td class="td-bold">${esc(s.name)}</td><td><strong>${s.size}</strong></td>
    <td>${s.qty}</td>${ST.role === 'owner' ? `<td class="td-green">${fmt(s.total)}</td>` : ''}
    <td class="td-muted">${s.time || s.date}</td>
  </tr>`).join('') : `<tr><td colspan="${ST.role === 'owner' ? 5 : 4}" class="tbl-empty"><div class="tbl-ei">🛒</div><p>Нет продаж</p></td></tr>`;

  // Low stock widget
  const lo = document.getElementById('dashLow');
  if (lo) lo.innerHTML = lowG.length ? lowG.slice(0, 6).map(g => `<div class="info-row">
    <div><div class="fw-7 t-sm">${esc(g.name)}</div><div class="t-xs t-muted">${esc(g.color)}</div></div>
    <span class="bdg ${g.totalRem <= 1 ? 'b-red' : 'b-gold'}">${g.totalRem} пар</span>
  </div>`).join('') : '<div style="color:var(--green);font-size:.82rem;font-weight:700;padding:8px 0">✅ Всё в порядке</div>';

  if (ST.role === 'owner') {
    const byName = {};
    sales.forEach(s => { if (!byName[s.name]) byName[s.name] = { rev: 0, qty: 0 }; byName[s.name].rev += s.total; byName[s.name].qty += s.qty; });
    const top5 = Object.entries(byName).sort((a, b) => b[1].rev - a[1].rev).slice(0, 5);
    const t5 = document.getElementById('dashTop5');
    if (t5) t5.innerHTML = top5.length ? top5.map(([n, d]) => `<div class="info-row"><span class="ir-lbl">${esc(n)}</span><span class="ir-val">${d.qty} пар · ${fmt(d.rev)}</span></div>`).join('') : '<div class="t-muted t-sm">Нет данных</div>';
    const ms = byPrd(ST.sales, 'month');
    const mrev = ms.reduce((a, s) => a + s.total, 0), mpr = ms.reduce((a, s) => a + (s.profitRaw || 0), 0);
    const mo = document.getElementById('dashMonth');
    if (mo) mo.innerHTML = `
      <div class="info-row"><span class="ir-lbl">Продаж</span><span class="ir-val">${ms.length}</span></div>
      <div class="info-row"><span class="ir-lbl">Пар продано</span><span class="ir-val">${ms.reduce((a, s) => a + s.qty, 0)}</span></div>
      <div class="info-row"><span class="ir-lbl">Выручка</span><span class="ir-val" style="color:var(--green)">${fmt(mrev)}</span></div>
      <div class="info-row"><span class="ir-lbl">Прибыль 👑</span><span class="ir-val" style="color:var(--gold)">${fmt(mpr)}</span></div>`;
    const pb = {}; sales.forEach(s => { pb[s.payment] = (pb[s.payment] || 0) + s.total; });
    const totPb = Object.values(pb).reduce((a, v) => a + v, 0);
    const dp = document.getElementById('dashPayBreak');
    if (dp) dp.innerHTML = Object.entries(pb).sort((a, b) => b[1] - a[1]).map(([p, v]) => `
      <div class="info-row"><span class="ir-lbl">${esc(p)}</span>
      <div class="fc gap-9"><span class="t-xs t-muted">${totPb > 0 ? Math.round(v / totPb * 100) : 0}%</span><span class="ir-val">${fmt(v)}</span></div></div>`).join('') || '<div class="t-muted t-sm">Нет данных</div>';
    const or = document.getElementById('dashOwnerRow'); if (or) or.style.display = 'grid';
  }
}

/* ═══════════════════════════════════════════════════════
   STOCK
═══════════════════════════════════════════════════════ */
function renderStock() {
  if (ST.page !== 'stock') return;
  const sm = buildSoldMap();
  let groups = buildGroups(sm);

  const types = ['Все', ...new Set(ST.products.map(p => p.type).filter(Boolean))];
  const tc = document.getElementById('stockTypeChips');
  if (tc) tc.innerHTML = types.map(t => {
    const k = t === 'Все' ? 'all' : t;
    const cnt = t === 'Все' ? groups.length : groups.filter(g => g.type === t).length;
    return `<button class="fchip ${ST.stockFilt === k ? 'active' : ''}" onclick="ST.stockFilt=${JSON.stringify(k)};renderStock()">${esc(t)} <span style="opacity:.5;font-size:.65rem">(${cnt})</span></button>`;
  }).join('');

  if (ST.stockFilt !== 'all') groups = groups.filter(g => g.type === ST.stockFilt);
  const q = (document.getElementById('stockSearch') || {}).value || '';
  if (q) { const ql = q.toLowerCase(); groups = groups.filter(g => g.name.toLowerCase().includes(ql) || (g.brand || '').toLowerCase().includes(ql) || (g.color || '').toLowerCase().includes(ql) || (g.code || '').toLowerCase().includes(ql)); }
  const sort = (document.getElementById('stockSort') || {}).value || 'name';
  if (sort === 'name') groups.sort((a, b) => a.name.localeCompare(b.name, CFG.LOC));
  else if (sort === 'stock') groups.sort((a, b) => b.totalRem - a.totalRem);
  else if (sort === 'price_d') groups.sort((a, b) => b.sellPrice - a.sellPrice);
  else if (sort === 'price_a') groups.sort((a, b) => a.sellPrice - b.sellPrice);
  else if (sort === 'date') groups.sort((a, b) => parseD(b.firstDate) - parseD(a.firstDate));
  else if (sort === 'brand') groups.sort((a, b) => (a.brand || '').localeCompare(b.brand || '', CFG.LOC));

  const listEl = document.getElementById('stockList'); if (!listEl) return;
  if (!groups.length) {
    listEl.innerHTML = `<div class="card card-p"><div class="empty-state"><div class="es-icon">📭</div><div class="es-title">Нет товаров</div></div></div>`;
    return;
  }

  listEl.innerHTML = groups.map((g, gi) => {
    const sNum = g.totalRem <= 0 ? 'out' : g.totalRem <= LOW() ? 'low' : 'ok';
    const sBdg = g.totalRem <= 0 ? `<span class="bdg b-red">🔴 Нет</span>` : g.totalRem <= LOW() ? `<span class="bdg b-gold">🟡 Мало</span>` : `<span class="bdg b-green">🟢 ${g.totalRem}</span>`;
    const szHtml = g.sizes.sort((a, b) => a.size - b.size).map(s => {
      const rc = s.rem <= 0 ? 'zero' : s.rem <= 1 ? 'low' : 'ok';
      const rb = s.rem <= 0 ? `<span class="bdg b-red">Нет</span>` : s.rem === 1 ? `<span class="bdg b-gold">1 пара</span>` : `<span class="bdg b-green">${s.rem} пар</span>`;
      return `
        <div class="sz-row ${s.rem <= 0 ? 'depleted' : ''}">
          <div class="sz-num">${s.size}</div>
          <div class="sz-info">
            <span class="sz-rem ${rc}">${s.rem}</span>
            <span class="sz-of"> из ${s.qty} пар</span>
            <div class="sz-sold">Продано: ${s.qty - s.rem}</div>
          </div>
          ${rb}
          <div class="sz-acts">
            <button class="btn btn-success btn-xs" ${s.rem <= 0 ? 'disabled' : ''} onclick="openQS('${escA(g.name)}','${escA(g.color)}',${s.size},'${s.rowId || ''}',${g.buyPrice},${ST.role === 'owner' ? (s.buyPriceRaw || 0) : 0},${g.sellPrice})">💰 Продать</button>
            ${ST.role === 'owner' ? `<button class="btn-icon t-sm" onclick="delProduct('${s.id || s.rowId}')">✕</button>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="sa-item" id="sag${gi}">
        <div class="sa-hdr" onclick="document.getElementById('sag${gi}').classList.toggle('open')">
          ${g.code ? `<span class="sa-code">${esc(g.code)}</span>` : ''}
          <div class="sa-info">
            <div class="sa-name">${esc(g.name)}${g.brand ? ` <span style="font-weight:400;color:var(--muted);font-size:.75rem">${esc(g.brand)}</span>` : ''}</div>
            <div class="sa-meta">
              ${g.color ? `<span class="sa-mi">🎨 ${esc(g.color)}</span>` : ''}
              ${g.type ? `<span class="sa-mi">👟 ${esc(g.type)}</span>` : ''}
              ${g.supplier ? `<span class="sa-mi">🏪 ${esc(g.supplier)}</span>` : ''}
              ${g.season ? `<span class="sa-mi">🌤 ${esc(g.season)}</span>` : ''}
              <span class="sa-mi">📅 ${g.firstDate || ''}</span>
            </div>
          </div>
          <div class="sa-prices">
            <div class="sa-sell">${fmt(g.sellPrice)}</div>
            ${ST.role === 'owner' ? `<div class="sa-buy">закупка ${fmt(g.buyPrice)}</div>` : ''}
          </div>
          <div class="sa-right">
            <div>
              <div class="sa-stock-num ${sNum}">${g.totalRem}</div>
              <div class="sa-stock-lbl">пар</div>
            </div>
            ${sBdg}
          </div>
          <div class="sa-arr">▾</div>
        </div>
        <div class="sa-body"><div class="sz-list">${szHtml}</div></div>
      </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   QUICK SELL MODAL
═══════════════════════════════════════════════════════ */
function openQS(name, color, size, rowId, buyPriceDisplay, buyPriceRaw, sellPrice) {
  ST.qsData = { name, color, size: +size, rowId, buyPrice: buyPriceDisplay, buyPriceRaw, sellPrice };
  const pc = document.getElementById('qsProdCard');
  if (pc) pc.innerHTML = `<div class="qs-prod-name">${esc(name)}</div><div class="qs-prod-meta">Размер ${size} · ${esc(color)}</div>`;
  const ph = document.getElementById('qsPriceHint');
  if (ph) ph.textContent = 'Рекомендуемая: ' + fmt(sellPrice);
  document.getElementById('qsPrice').value = sellPrice;
  document.getElementById('qsQty').value = 1;
  document.getElementById('qsDisc').value = '';
  document.getElementById('qsCust').value = '';
  document.getElementById('qsNote').value = '';
  document.querySelectorAll('#qsPaySel .pay-opt').forEach(o => o.classList.remove('sel-pay'));
  document.querySelector('#qsPaySel .pay-opt:first-child').classList.add('sel-pay');
  calcQS();
  openModal('qsModal');
}

function calcQS() {
  const price = gn('qsPrice'), qty = Math.max(1, gi('qsQty') || 1), disc = Math.max(0, gn('qsDisc'));
  if (!ST.qsData || !price) { document.getElementById('qsSummary').classList.remove('show'); return; }
  const total = Math.max(0, qty * price - disc);
  const profit = total - qty * (ST.qsData.buyPriceRaw || 0);
  const margin = price > 0 ? Math.round((price - (ST.qsData.buyPriceRaw || 0)) / price * 100) : 0;
  document.getElementById('qsSummary').classList.add('show');
  document.getElementById('qsTotal').textContent = fmt(total);
  const pp = document.getElementById('qsProfit'); if (pp) pp.textContent = fmt(profit);
  const pm = document.getElementById('qsMargin'); if (pm) pm.textContent = margin + '%';
}

async function submitQS() {
  if (_saleInProgress) return;
  if (!ST.qsData) { closeModal('qsModal'); return; }
  const price = gn('qsPrice'), qty = Math.max(1, gi('qsQty') || 1), disc = gn('qsDisc');
  const payment = getSelPay('qsPaySel'), cust = gv('qsCust'), note = gv('qsNote');
  if (!price) { toast('⚠️ Введи цену продажи!', 'err'); return; }
  if (qty < 1) { toast('⚠️ Кол-во должно быть минимум 1', 'err'); return; }
  if (disc < 0) { toast('⚠️ Скидка не может быть отрицательной', 'err'); return; }
  if (disc > qty * price) { toast('⚠️ Скидка не может превышать сумму продажи', 'err'); return; }

  // Find product - try multiple ways
  const sm = buildSoldMap();
  let prod = ST.products.find(p => p.rowId === ST.qsData.rowId);
  if (!prod) prod = ST.products.find(p => p.name === ST.qsData.name && Number(p.size) === Number(ST.qsData.size) && p.color === ST.qsData.color);
  if (!prod) prod = ST.products.find(p => p.name === ST.qsData.name && Number(p.size) === Number(ST.qsData.size));

  if (!prod) {
    toast('❌ Товар не найден в базе. Обнови страницу и попробуй снова.', 'err');
    return;
  }

  const rem = getRem(prod, sm);
  if (qty > rem) { toast(`⚠️ Осталось только ${rem} пар!`, 'err'); return; }

  const total = Math.max(0, qty * price - disc);
  const buyPriceRaw = prod.buyPriceRaw || ST.qsData.buyPriceRaw || 0;
  const profit = qty * (price - buyPriceRaw) - disc;

  _saleInProgress = true;
  const btn = document.getElementById('qsSubmitBtn');
  btn.disabled = true; btn.textContent = 'Сохраняем...';

  const saleData = {
    product_row_id: prod.rowId || prod.id || '',
    name: prod.name,
    size: Number(prod.size),
    color: prod.color || '',
    qty: Number(qty),
    price: Number(price),
    buy_price: Number(buyPriceRaw),
    discount: Number(disc) || 0,
    total: Number(total),
    profit: Number(profit),
    payment: payment,
    customer: cust || '',
    note: note || '',
    sale_date: new Date().toISOString().slice(0, 10),
    sale_time: fmtT(new Date()),
    seller_id: null,
    seller_name: ST.profile?.full_name || '',
  };

  // Only add product_id if it's a valid UUID
  if (prod.id && prod.id.includes('-')) {
    saleData.product_id = prod.id;
  }

  const { data, error } = await SB.from('sales').insert([saleData]).select();

  _saleInProgress = false;
  btn.disabled = false; btn.textContent = '✅ Продано!';

  if (error) {
    console.error('Sale error:', error);
    toast('❌ Ошибка: ' + error.message, 'err');
    return;
  }

  closeModal('qsModal');
  toast(`✅ Продано! ${prod.name} р.${prod.size} — ${fmt(total)}`, 'ok');
  ST.qsData = null;
  await loadSales();
  renderAll();
}

/* ═══════════════════════════════════════════════════════
   DELETE PRODUCT
═══════════════════════════════════════════════════════ */
async function delProduct(id) {
  const ok = await confDialog('🗑', 'Удалить позицию?', 'Строка будет удалена со склада.', 'Удалить', 'btn-danger');
  if (!ok) return;
  const { error } = await SB.from('products').delete().eq('id', id);
  if (error) { toast('❌ Ошибка: ' + error.message, 'err'); return; }
  toast('✅ Удалено', 'ok');
  await loadProducts();
  renderAll();
}

async function openDeleteModal() {
  const names = [...new Set(ST.products.map(p => p.name))];
  const sel = prompt('Введи точное название для удаления:\n' + names.join('\n'));
  if (!sel) return;
  const found = ST.products.filter(p => p.name.toLowerCase() === sel.toLowerCase());
  if (!found.length) { toast('Товар не найден', 'err'); return; }
  const ok = await confDialog('🗑', `Удалить "${sel}"?`, `Будет удалено ${found.length} строк.`, 'Удалить', 'btn-danger');
  if (!ok) return;
  const ids = found.map(p => p.id);
  const { error } = await SB.from('products').delete().in('id', ids);
  if (error) { toast('❌ Ошибка: ' + error.message, 'err'); return; }
  toast('✅ Товар удалён', 'ok');
  await loadProducts();
  renderAll();
}

/* ═══════════════════════════════════════════════════════
   ARRIVE — Add Stock
═══════════════════════════════════════════════════════ */
const SIZE_TEMPLATES = {
  kids: { from: 20, to: 35 }, women_s: { from: 35, to: 40 },
  women_l: { from: 38, to: 42 }, men: { from: 40, to: 46 }, uni: { from: 36, to: 44 }
};
function applyTpl(key) {
  const t = SIZE_TEMPLATES[key]; if (!t) return;
  document.getElementById('szFrom').value = t.from;
  document.getElementById('szTo').value = t.to;
  buildSeries();
}
function buildSeries() {
  const f = parseInt(gv('szFrom')), t = parseInt(gv('szTo'));
  const box = document.getElementById('szChips'); if (!box) return;
  if (!f || isNaN(f)) { box.innerHTML = ''; updatePrev(); return; }
  const end = (t && t >= f) ? t : f;
  box.innerHTML = '';
  for (let s = f; s <= end; s++) {
    const ch = document.createElement('div'); ch.className = 'sz-chip';
    ch.innerHTML = `<span class="sz-chip-num">${s}</span><input class="sz-chip-inp" type="number" id="sc${s}" value="1" min="0" max="999" oninput="updatePrev()"><span class="sz-chip-lbl">пар</span>`;
    box.appendChild(ch);
  }
  updatePrev();
}
function calcMargin() {
  const buy = gn('aBuy'), sell = gn('aSell');
  const el = document.getElementById('aMarginBox'); if (!el) return;
  if (buy > 0 && sell > 0) {
    const m = sell - buy, pct = Math.round(m / buy * 100);
    el.textContent = `${fmt(m)} (${pct}%)`;
    el.style.color = m >= 0 ? 'var(--green)' : 'var(--red)';
  } else { el.textContent = '—'; el.style.color = 'var(--muted)'; }
}
function updatePrev() {
  const name = gv('aName'), brand = gv('aBrand'), color = gv('aColor'), sell = gn('aSell'), buy = gn('aBuy');
  const from = parseInt(gv('szFrom')), to = parseInt(gv('szTo'));
  const pc = document.getElementById('prevCard'), pb = document.getElementById('prevBody');
  if (!pc || !pb) return;
  if (!name && !sell) { pc.style.display = 'none'; return; }
  pc.style.display = '';
  const end = (to && to >= from && from) ? to : from;
  let sizes = [], total = 0;
  if (from) for (let s = from; s <= end; s++) { const inp = document.getElementById('sc' + s); const q = inp ? parseInt(inp.value) || 0 : 1; if (q > 0) { sizes.push({ size: s, qty: q }); total += q; } }
  const margin = buy > 0 && sell > 0 ? sell - buy : 0;
  pb.innerHTML = `
    <div class="info-row"><span class="ir-lbl">Название</span><span class="ir-val">${esc(name || '—')}</span></div>
    ${brand ? `<div class="info-row"><span class="ir-lbl">Бренд</span><span class="ir-val">${esc(brand)}</span></div>` : ''}
    ${color ? `<div class="info-row"><span class="ir-lbl">Цвет</span><span class="ir-val">${esc(color)}</span></div>` : ''}
    <div class="info-row"><span class="ir-lbl">Цена продажи</span><span class="ir-val" style="color:var(--green)">${sell ? fmt(sell) : '—'}</span></div>
    ${ST.role === 'owner' && buy ? `<div class="info-row"><span class="ir-lbl">Закупка 👑</span><span class="ir-val">${fmt(buy)}</span></div>` : ''}
    ${margin && ST.role === 'owner' ? `<div class="info-row"><span class="ir-lbl">Маржа 👑</span><span class="ir-val" style="color:var(--gold)">${fmt(margin)}</span></div>` : ''}
    <div class="info-row"><span class="ir-lbl">Размеры</span><span class="ir-val">${sizes.map(s => `${s.size}(${s.qty})`).join(' ') || '—'}</span></div>
    <div class="info-row"><span class="ir-lbl">Всего пар</span><span class="ir-val" style="color:var(--accent);font-size:1.05rem;font-weight:900">${total}</span></div>`;
}

async function submitArrive() {
  if (_saleInProgress) return;
  const name = gv('aName'), brand = gv('aBrand'), color = gv('aColor'), type = gv('aType');
  const sell = gn('aSell'), code = gv('aCode'), mat = gv('aMat');
  const season = gv('aSeason'), aud = gv('aAud'), supp = gv('aSupp'), notes = gv('aNotes');
  const from = parseInt(gv('szFrom')), to = parseInt(gv('szTo'));
  // Buy price: owner enters it, seller leaves it 0
  const buy = ST.role === 'owner' ? gn('aBuy') : 0;

  const errs = [];
  if (!name) errs.push('Введи название');
  if (!brand) errs.push('Введи бренд');
  if (!color) errs.push('Введи цвет');
  if (!sell) errs.push('Введи цену продажи');
  if (!buy && ST.role === 'owner') errs.push('Введи цену закупки');
  if (!from) errs.push('Укажи размер');
  if (errs.length) { toast('⚠️ ' + errs[0], 'err'); return; }

  const end = (to && to >= from) ? to : from;
  const sizes = [];
  for (let s = from; s <= end; s++) {
    const inp = document.getElementById('sc' + s);
    const q = inp ? parseInt(inp.value) || 0 : 1;
    if (q > 0) sizes.push({ size: s, qty: q });
  }
  if (!sizes.length) { toast('⚠️ Нет размеров с кол-вом > 0', 'err'); return; }

  const series = from + (end > from ? '–' + end : '');
  const today = new Date().toISOString().slice(0, 10);
  const arriveDate = gv('aArriveDate') || today;
  const baseRowId = Date.now() + '_' + Math.random().toString(36).slice(2, 8);

  const rows = sizes.map((sz, i) => ({
    row_id: baseRowId + '_' + i,
    code, name, brand, type: type || null, color,
    material: mat || null, season: season || null, audience: aud || null,
    buy_price: buy,
    sell_price: sell,
    supplier: supp || null,
    notes: notes || null,
    size: sz.size,
    qty: sz.qty,
    series,
    arrive_date: arriveDate,
  }));

  _saleInProgress = true;
  const btn = document.getElementById('arriveSubmitBtn');
  btn.disabled = true; btn.textContent = 'Сохраняем...';

  const { error } = await SB.from('products').insert(rows);

  _saleInProgress = false;
  btn.disabled = false; btn.textContent = '➕ Добавить на склад';

  if (error) { toast('❌ Ошибка: ' + error.message, 'err'); return; }

  const totalPairs = sizes.reduce((a, s) => a + s.qty, 0);
  toast(`✅ ${name} (${sizes.length} разм., ${totalPairs} пар) добавлен!`, 'ok');
  clearArrive();
  await loadProducts();
  renderAll();
}

function clearArrive() {
  ['aCode', 'aName', 'aBrand', 'aColor', 'aBuy', 'aSell', 'aSupp', 'aNotes', 'szFrom', 'szTo'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  ['aType', 'aMat', 'aSeason', 'aAud'].forEach(id => { const e = document.getElementById(id); if (e) e.selectedIndex = 0; });
  const nd = document.getElementById('aArriveDate'); if (nd) nd.value = new Date().toISOString().slice(0, 10);
  const ta = document.getElementById('aNotes'); if (ta) ta.value = '';
  const box = document.getElementById('szChips'); if (box) box.innerHTML = '';
  const pc = document.getElementById('prevCard'); if (pc) pc.style.display = 'none';
  const mb = document.getElementById('aMarginBox'); if (mb) { mb.textContent = '—'; mb.style.color = 'var(--muted)'; }
}

function renderArriveRecent() {
  if (ST.page !== 'arrive') return;
  const el = document.getElementById('arriveRecent'); if (!el) return;
  const recent = [...ST.products].sort((a, b) => b.ts - a.ts).slice(0, 12);
  if (!recent.length) { el.innerHTML = '<div class="card-body"><div class="tbl-empty"><div class="tbl-ei">📦</div><p>Пока пусто</p></div></div>'; return; }
  el.innerHTML = recent.map(p => `
    <div class="info-row" style="padding:9px 18px">
      <div>
        <div class="fw-7 t-sm">${esc(p.name)} р.${p.size}</div>
        <div class="t-xs t-muted">${esc(p.color)} · ${p.qty} пар · ${p.date || ''}</div>
      </div>
      <div class="fc gap-9">
        <span class="fw-8 t-sm" style="color:var(--green)">${fmt(p.sellPrice)}</span>
        ${ST.role === 'owner' ? `<button class="btn-icon t-sm" onclick="delProduct('${p.id}')">✕</button>` : ''}
      </div>
    </div>`).join('');
}

function fillSuppList() {
  const dl = document.getElementById('suppList'); if (!dl) return;
  const supps = [...new Set(ST.products.map(p => p.supplier).filter(Boolean))];
  dl.innerHTML = supps.map(s => `<option value="${esc(s)}">`).join('');
}

/* ═══════════════════════════════════════════════════════
   SALES
═══════════════════════════════════════════════════════ */
function renderSalesForm() {
  if (ST.page !== 'sales') return;
  const sm = buildSoldMap();
  const prodSel = document.getElementById('saleProd'); if (!prodSel) return;
  const cur = prodSel.value;
  const avail = ST.products.filter(p => getRem(p, sm) > 0);
  // Use name||color as value so same shoe in different colours shows as separate options
  const combos = [...new Set(avail.map(p => `${p.name}||${p.color || ''}`))].sort();
  prodSel.innerHTML = '<option value="">— Выбери товар —</option>' + combos.map(c => {
    const [n, col] = c.split('||');
    const lbl = col ? `${esc(n)} — ${esc(col)}` : esc(n);
    return `<option value="${escA(c)}"${c === cur ? ' selected' : ''}>${lbl}</option>`;
  }).join('');
  // Re-generate size chips if a product was already selected, preserving selection
  if (cur && prodSel.value === cur) onSaleProd(false);

  const ts = byPrd(ST.sales, 'today');
  const ms = byPrd(ST.sales, 'month');
  const tse = document.getElementById('saleTodayStat');
  if (tse) tse.innerHTML = `
    <div class="info-row"><span class="ir-lbl">Продаж</span><span class="ir-val">${ts.length}</span></div>
    <div class="info-row"><span class="ir-lbl">Пар</span><span class="ir-val">${ts.reduce((a, s) => a + s.qty, 0)}</span></div>
    ${ST.role === 'owner' ? `<div class="info-row"><span class="ir-lbl">Выручка</span><span class="ir-val td-green">${fmt(ts.reduce((a, s) => a + s.total, 0))}</span></div>` : ''}
    ${ST.role === 'owner' ? `<div class="info-row"><span class="ir-lbl">Прибыль 👑</span><span class="ir-val" style="color:var(--gold)">${fmt(ts.reduce((a, s) => a + (s.profitRaw || 0), 0))}</span></div>` : ''}`;
  const mse = document.getElementById('saleMonthStat');
  if (mse) mse.innerHTML = `
    <div class="info-row"><span class="ir-lbl">Продаж</span><span class="ir-val">${ms.length}</span></div>
    ${ST.role === 'owner' ? `<div class="info-row"><span class="ir-lbl">Выручка</span><span class="ir-val td-green">${fmt(ms.reduce((a, s) => a + s.total, 0))}</span></div>` : ''}
    ${ST.role === 'owner' ? `<div class="info-row"><span class="ir-lbl">Прибыль 👑</span><span class="ir-val" style="color:var(--gold)">${fmt(ms.reduce((a, s) => a + (s.profitRaw || 0), 0))}</span></div>` : ''}`;
}

function onSaleProd(clearSelection = true) {
  const combo = gv('saleProd'), block = document.getElementById('saleBlock');
  if (!combo) { if (block) block.style.display = 'none'; return; }
  if (block) block.style.display = 'block';

  const [name, color] = combo.split('||');
  const sm = buildSoldMap();
  const prods = ST.products
    .filter(p => p.name === name && (p.color || '') === (color || '') && getRem(p, sm) >= 0)
    .sort((a, b) => a.size - b.size);

  // Remember current size selection (so poll re-renders don't wipe it)
  const prevSizeNum = clearSelection ? null : (gv('saleSize').split('|')[0] || null);
  const sizeInput = document.getElementById('saleSize');
  const priceEl = document.getElementById('salePrice');
  if (clearSelection) {
    if (sizeInput) sizeInput.value = '';
    if (priceEl) priceEl.value = '';
    document.getElementById('saleStockInd').style.display = 'none';
  }

  // Render size chips
  const picker = document.getElementById('saleSizePicker');
  if (picker) {
    const available = prods.filter(p => getRem(p, sm) > 0);
    if (!available.length) {
      picker.innerHTML = '<div class="sz-pick-empty">Нет в наличии</div>';
      if (sizeInput) sizeInput.value = '';
    } else {
      picker.innerHTML = available.map(p => {
        const rem = getRem(p, sm);
        const val = `${p.size}|${p.rowId || ''}|${p.buyPriceRaw || 0}|${p.sellPrice}`;
        const cls = rem <= 1 ? 'low' : 'ok';
        const isSel = !clearSelection && prevSizeNum && String(p.size) === prevSizeNum;
        if (isSel && sizeInput) sizeInput.value = val; // update val (price may have changed)
        return `<button class="sz-pick-btn ${cls}${isSel ? ' sel' : ''}" onclick="pickSaleSize('${escA(val)}',this)">${p.size}<span>${rem} пар</span></button>`;
      }).join('');
      const ph = document.getElementById('salePriceHint2');
      if (ph) ph.textContent = 'Рекомендуемая: ' + fmt(available[0].sellPrice);
    }
  }
  calcSaleSum();
}

function pickSaleSize(val, el) {
  document.querySelectorAll('#saleSizePicker .sz-pick-btn').forEach(b => b.classList.remove('sel'));
  el.classList.add('sel');
  const sizeInput = document.getElementById('saleSize');
  if (sizeInput) sizeInput.value = val;
  onSaleSize();
}

function onSaleSize() {
  const val = gv('saleSize'); if (!val) return;
  const [size, , , sellP] = val.split('|');
  const combo = gv('saleProd');
  const [name, color] = combo.split('||');
  const sm = buildSoldMap();
  const prod = ST.products.find(p => p.name === name && (p.color || '') === (color || '') && String(p.size) === size);
  const rem = prod ? getRem(prod, sm) : 0;
  const ind = document.getElementById('saleStockInd');
  const ico = document.getElementById('saleStockIco');
  const txt = document.getElementById('saleStockTxt');
  if (ind && ico && txt) {
    ind.style.display = 'flex';
    if (rem <= 0) { ico.textContent = '🔴'; txt.textContent = 'Нет в наличии'; txt.style.color = 'var(--red)'; }
    else if (rem === 1) { ico.textContent = '🟡'; txt.textContent = 'Последняя пара!'; txt.style.color = 'var(--gold)'; }
    else { ico.textContent = '🟢'; txt.textContent = `В наличии: ${rem} пар`; txt.style.color = 'var(--green)'; }
  }
  // Always fill price from product record
  const pp = document.getElementById('salePrice');
  if (pp) pp.value = sellP || '';
  const ph = document.getElementById('salePriceHint2');
  if (ph && sellP) ph.textContent = 'Рекомендуемая: ' + fmt(parseFloat(sellP));
  calcSaleSum();
}

function calcSaleSum() {
  const price = gn('salePrice'), qty = Math.max(1, gi('saleQty') || 1), disc = Math.max(0, gn('saleDisc'));
  const val = gv('saleSize');
  const sb = document.getElementById('saleSumBox');
  if (!price || !val) { if (sb) sb.classList.remove('show'); return; }
  const [, , buyPRaw] = val.split('|');
  const total = Math.max(0, qty * price - disc);
  const profit = total - qty * (parseFloat(buyPRaw) || 0);
  if (sb) sb.classList.add('show');
  const td = document.getElementById('saleTotDisp'); if (td) td.textContent = fmt(total);
  const pd = document.getElementById('saleProDisp'); if (pd) pd.textContent = fmt(profit);
}

async function submitSale() {
  if (_saleInProgress) return;
  const combo = gv('saleProd'), sizeVal = gv('saleSize');
  const price = gn('salePrice'), qty = Math.max(1, gi('saleQty') || 1), disc = gn('saleDisc');
  const payment = getSelPay('salePaySel'), cust = gv('saleCust'), note = gv('saleNote');

  if (!combo) { toast('⚠️ Выбери товар', 'err'); return; }
  if (!sizeVal) { toast('⚠️ Выбери размер', 'err'); return; }
  if (!price) { toast('⚠️ Введи цену продажи', 'err'); return; }
  if (disc < 0) { toast('⚠️ Скидка не может быть отрицательной', 'err'); return; }
  if (disc > qty * price) { toast('⚠️ Скидка не может превышать сумму продажи', 'err'); return; }

  const [name, color] = combo.split('||');
  const [size, rowId, buyPRaw] = sizeVal.split('|');
  const buyPriceRaw = parseFloat(buyPRaw) || 0;
  const sm = buildSoldMap();

  // Find product - try by rowId first, then by name+color+size
  let prod = ST.products.find(p => p.rowId === rowId);
  if (!prod) prod = ST.products.find(p => p.name === name && (p.color || '') === (color || '') && String(p.size) === String(size));
  if (!prod) { toast('❌ Товар не найден. Обнови страницу.', 'err'); return; }

  const rem = getRem(prod, sm);
  if (qty > rem) { toast(`⚠️ Осталось ${rem} пар!`, 'err'); return; }

  const total = Math.max(0, qty * price - disc);
  const profit = qty * (price - buyPriceRaw) - disc;

  _saleInProgress = true;
  const btn = document.getElementById('saleSubmitBtn');
  btn.disabled = true; btn.textContent = 'Сохраняем...';

  const saleData = {
    product_row_id: prod.rowId || prod.id || '',
    name: prod.name,
    size: Number(size),
    color: prod.color || '',
    qty: Number(qty),
    price: Number(price),
    buy_price: Number(buyPriceRaw),
    discount: Number(disc) || 0,
    total: Number(total),
    profit: Number(profit),
    payment: payment,
    customer: cust || '',
    note: note || '',
    sale_date: new Date().toISOString().slice(0, 10),
    sale_time: fmtT(new Date()),
    seller_id: null,
    seller_name: ST.profile?.full_name || '',
  };

  if (prod.id && prod.id.includes('-')) {
    saleData.product_id = prod.id;
  }

  const { data, error } = await SB.from('sales').insert([saleData]).select();

  _saleInProgress = false;
  btn.disabled = false; btn.textContent = '✅ Подтвердить продажу';

  if (error) {
    console.error('Sale error full:', error);
    toast('❌ Ошибка: ' + error.message, 'err');
    return;
  }

  // Reset form
  document.getElementById('saleProd').value = '';
  document.getElementById('saleBlock').style.display = 'none';
  const szPicker = document.getElementById('saleSizePicker');
  if (szPicker) szPicker.innerHTML = '';
  const szInput = document.getElementById('saleSize');
  if (szInput) szInput.value = '';
  ['salePrice', 'saleQty', 'saleDisc', 'saleCust', 'saleNote'].forEach(id => {
    const e = document.getElementById(id);
    if (e) e.value = id === 'saleQty' ? '1' : '';
  });
  document.querySelectorAll('#salePaySel .pay-opt').forEach(o => o.classList.remove('sel-pay'));
  const fp = document.querySelector('#salePaySel .pay-opt:first-child');
  if (fp) fp.classList.add('sel-pay');
  document.getElementById('saleSumBox').classList.remove('show');
  toast(`✅ Продано! ${prod.name} р.${size} — ${fmt(total)}`, 'ok');
  await loadSales();
  renderAll();
}

function renderSalesTbl() {
  if (ST.page !== 'sales') return;
  const filt = (document.getElementById('salesFilt') || {}).value || 'all';
  const q = ((document.getElementById('salesSearch') || {}).value || '').toLowerCase();
  let sales = byPrd(ST.sales, filt);
  if (q) sales = sales.filter(s => s.name.toLowerCase().includes(q) || (s.customer || '').toLowerCase().includes(q) || String(s.size).includes(q));
  const cnt = document.getElementById('salesCnt'); if (cnt) cnt.textContent = `${sales.length} записей`;
  const tbody = document.getElementById('salesTbody'); if (!tbody) return;
  if (!sales.length) { tbody.innerHTML = `<tr><td colspan="${ST.role === 'owner' ? 14 : 11}" class="tbl-empty"><div class="tbl-ei">💰</div><p>Нет продаж</p></td></tr>`; return; }
  tbody.innerHTML = sales.map((s, i) => `
    <tr>
      <td class="td-muted">${i + 1}</td>
      <td class="td-muted" style="white-space:nowrap">${s.date} ${s.time || ''}</td>
      <td class="td-bold">${esc(s.name)}</td>
      <td><strong>${s.size}</strong></td>
      <td>${esc(s.color || '')}</td>
      <td>${s.qty}</td>
      ${ST.role === 'owner' ? `<td class="td-green">${fmt(s.total)}</td>` : ''}
      <td class="owner-elem" style="${ST.role === 'owner' ? '' : 'display:none'}">${fmt((s.buyPriceRaw || 0) * s.qty)}</td>
      <td class="owner-elem" style="${ST.role === 'owner' ? 'color:var(--gold);font-weight:800' : 'display:none'}">${fmt(s.profitRaw || 0)}</td>
      <td><span class="bdg b-gray">${esc(s.payment)}</span></td>
      <td class="td-muted">${esc(s.customer || '—')}</td>
      <td class="td-muted">${esc(s.note || '—')}</td>
      <td class="td-muted">${esc(s.sellerName || '—')}</td>
      <td>${ST.role === 'owner' ? `<button class="btn-icon t-sm" onclick="delSale('${s.id}')" title="Удалить">🗑</button>` : ''}</td>
    </tr>`).join('');
}

async function delSale(id) {
  const ok = await confDialog('🗑', 'Удалить продажу?', 'Запись будет удалена из базы.', 'Удалить', 'btn-danger');
  if (!ok) return;
  const { error } = await SB.from('sales').delete().eq('id', id);
  if (error) { toast('❌ Ошибка: ' + error.message, 'err'); return; }
  toast('Продажа удалена', 'ok');
  await loadSales();
  renderAll();
}

/* ═══════════════════════════════════════════════════════
   CALENDAR
═══════════════════════════════════════════════════════ */
function calPrev() { ST.calMonth--; if (ST.calMonth < 0) { ST.calMonth = 11; ST.calYear--; } renderCalendar(); }
function calNext() { ST.calMonth++; if (ST.calMonth > 11) { ST.calMonth = 0; ST.calYear++; } renderCalendar(); }
function calGoToday() { ST.calYear = new Date().getFullYear(); ST.calMonth = new Date().getMonth(); ST.calSel = todayS(); renderCalendar(); }

function renderCalendar() {
  if (ST.page !== 'calendar') return;
  const lbl = document.getElementById('calLbl'), grid = document.getElementById('calGrid');
  if (!lbl || !grid) return;
  const monthName = new Date(ST.calYear, ST.calMonth, 1).toLocaleDateString(CFG.LOC, { month: 'long', year: 'numeric' });
  lbl.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  const first = new Date(ST.calYear, ST.calMonth, 1);
  const last = new Date(ST.calYear, ST.calMonth + 1, 0);
  const today = fmtD(new Date());
  const sIdx = {};
  ST.sales.forEach(s => {
    if (!sIdx[s.date]) sIdx[s.date] = { cnt: 0, rev: 0 };
    sIdx[s.date].cnt += s.qty; sIdx[s.date].rev += s.total;
  });
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  let html = dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('');
  let startDow = first.getDay(); if (startDow === 0) startDow = 6; else startDow--;
  for (let i = 0; i < startDow; i++) { const d = new Date(ST.calYear, ST.calMonth, 1 - (startDow - i)); html += `<div class="cal-day other-m"><div class="cal-dn">${d.getDate()}</div></div>`; }
  for (let d = 1; d <= last.getDate(); d++) {
    const date = new Date(ST.calYear, ST.calMonth, d);
    const ds = fmtD(date);
    const info = sIdx[ds];
    const isTod = ds === today, isSel = ds === ST.calSel;
    html += `<div class="cal-day ${isTod ? 'is-today' : ''} ${isSel ? 'is-sel' : ''}" onclick="calSelect('${ds}')">
      <div class="cal-dn">${d}</div>
      ${info ? `<div class="cal-dot"></div><div class="cal-sales">${info.cnt} пар</div>${ST.role === 'owner' ? `<div class="cal-rev">${fmt(info.rev)}</div>` : ''}` : ''}
    </div>`;
  }
  const rem = 42 - startDow - last.getDate();
  for (let i = 1; i <= rem && rem < 7; i++) html += `<div class="cal-day other-m"><div class="cal-dn">${i}</div></div>`;
  grid.innerHTML = html;
  const ms = ST.sales.filter(s => { const d = parseD(s.date); return d.getMonth() === ST.calMonth && d.getFullYear() === ST.calYear; });
  const mb = document.getElementById('calMonthBody');
  if (mb) mb.innerHTML = `
    <div class="info-row"><span class="ir-lbl">Продаж за месяц</span><span class="ir-val">${ms.length}</span></div>
    <div class="info-row"><span class="ir-lbl">Пар продано</span><span class="ir-val">${ms.reduce((a, s) => a + s.qty, 0)}</span></div>
    ${ST.role === 'owner' ? `<div class="info-row"><span class="ir-lbl">Выручка</span><span class="ir-val td-green">${fmt(ms.reduce((a, s) => a + s.total, 0))}</span></div>` : ''}
    ${ST.role === 'owner' ? `<div class="info-row"><span class="ir-lbl">Прибыль 👑</span><span class="ir-val" style="color:var(--gold)">${fmt(ms.reduce((a, s) => a + (s.profitRaw || 0), 0))}</span></div>` : ''}`;
  if (ST.calSel) renderDayDetail(ST.calSel);
}

function calSelect(ds) { ST.calSel = ds; renderCalendar(); }

function renderDayDetail(ds) {
  const dateEl = document.getElementById('dayDetail');
  const cont = document.getElementById('ddContent');
  if (!dateEl || !cont) return;
  const pd = parseD(ds);
  const dayLbl = pd.toLocaleDateString(CFG.LOC, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const h1 = dateEl.querySelector('.dd-date');
  if (h1) h1.innerHTML = `📅 ${dayLbl}`;
  const daySales = ST.sales.filter(s => s.date === ds);
  const dayArr = ST.products.filter(p => p.date === fmtD(parseD(ds)));
  const rev = daySales.reduce((a, s) => a + s.total, 0);
  const profitDay = daySales.reduce((a, s) => a + (s.profitRaw || 0), 0);
  const pairs = daySales.reduce((a, s) => a + s.qty, 0);
  if (!daySales.length && !dayArr.length) { cont.innerHTML = '<div style="color:var(--muted);font-size:.82rem;padding:20px 0;text-align:center">Нет активности</div>'; return; }
  let html = '';
  if (daySales.length) {
    html += `<div class="fc gap-16 fw mb-12">
      <div><div class="t-xs t-muted">Продаж</div><div class="fw-8" style="color:var(--accent)">${daySales.length}</div></div>
      <div><div class="t-xs t-muted">Пар</div><div class="fw-8">${pairs}</div></div>
      ${ST.role === 'owner' ? `<div><div class="t-xs t-muted">Выручка</div><div class="fw-8 td-green">${fmt(rev)}</div></div>` : ''}
      ${ST.role === 'owner' ? `<div><div class="t-xs t-muted">Прибыль 👑</div><div class="fw-8" style="color:var(--gold)">${fmt(profitDay)}</div></div>` : ''}
    </div>`;
    html += daySales.map(s => `
      <div class="info-row">
        <div><div class="fw-7 t-sm">${esc(s.name)} р.${s.size}</div>
        <div class="t-xs t-muted">${s.qty} пар · ${esc(s.payment)} · ${s.time || ''} · ${esc(s.sellerName)}</div></div>
        ${ST.role === 'owner' ? `<span class="fw-8 t-sm td-green">${fmt(s.total)}</span>` : `<span class="t-sm t-muted">${s.qty} пар</span>`}
      </div>`).join('');
  }
  if (dayArr.length) {
    html += `<div style="margin-top:12px;font-weight:800;font-size:.82rem;color:var(--blue)">📦 Поступления</div>`;
    const names = [...new Set(dayArr.map(p => p.name))];
    names.forEach(n => {
      const rows = dayArr.filter(p => p.name === n);
      const tot = rows.reduce((a, p) => a + p.qty, 0);
      html += `<div class="info-row"><div><div class="fw-7 t-sm">${esc(n)}</div><div class="t-xs t-muted">${rows.map(p => `р.${p.size}(${p.qty})`).join(' ')}</div></div><span>${tot} пар</span></div>`;
    });
  }
  cont.innerHTML = html;
}

/* ═══════════════════════════════════════════════════════
   REPORTS (owner only)
═══════════════════════════════════════════════════════ */
function setRepPrd(p, btn) {
  ST.repPrd = p;
  document.querySelectorAll('#repPsel .psel-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const rf = document.getElementById('repFrom'), rt = document.getElementById('repTo');
  if (rf) rf.value = ''; if (rt) rt.value = '';
  renderReports();
}
function setDateRange(days) {
  const to = new Date(), from = new Date(to - days * 864e5);
  const rf = document.getElementById('repFrom'), rt = document.getElementById('repTo');
  if (rf) rf.value = from.toISOString().slice(0, 10);
  if (rt) rt.value = to.toISOString().slice(0, 10);
  renderReports();
}
function clearRepDates() {
  const rf = document.getElementById('repFrom'), rt = document.getElementById('repTo');
  if (rf) rf.value = ''; if (rt) rt.value = '';
  renderReports();
}

function renderReports() {
  if (ST.page !== 'reports' || ST.role !== 'owner') return;
  const repFrom = gv('repFrom'), repTo = gv('repTo');
  let sales = repFrom || repTo ? byDateRange(ST.sales, repFrom, repTo) : byPrd(ST.sales, ST.repPrd);
  const sm = buildSoldMap();
  const rev = sales.reduce((a, s) => a + s.total, 0);
  const profit = sales.reduce((a, s) => a + (s.profitRaw || 0), 0);
  const pairs = sales.reduce((a, s) => a + s.qty, 0);
  const margin = rev > 0 ? Math.round(profit / rev * 100) : 0;
  const totalRem = ST.products.reduce((a, p) => a + getRem(p, sm), 0);
  document.getElementById('repKpi').innerHTML = `
    <div class="kpi"><div class="kpi-stripe green"></div><div class="kpi-label">Выручка</div><div class="kpi-val green">${fmt(rev)}</div><div class="kpi-sub">${sales.length} продаж</div></div>
    <div class="kpi"><div class="kpi-stripe gold"></div><div class="kpi-label">Прибыль 👑</div><div class="kpi-val gold">${fmt(profit)}</div><div class="kpi-sub">Маржа ${margin}%</div></div>
    <div class="kpi"><div class="kpi-stripe orange"></div><div class="kpi-label">Продано пар</div><div class="kpi-val orange">${pairs}</div></div>
    <div class="kpi"><div class="kpi-stripe blue"></div><div class="kpi-label">Остаток</div><div class="kpi-val blue">${totalRem}</div><div class="kpi-sub">${ST.products.length} позиций</div></div>`;
  const byName = {};
  sales.forEach(s => { if (!byName[s.name]) byName[s.name] = { rev: 0, qty: 0, profit: 0 }; byName[s.name].rev += s.total; byName[s.name].qty += s.qty; byName[s.name].profit += (s.profitRaw || 0); });
  const topRev = Object.entries(byName).sort((a, b) => b[1].rev - a[1].rev).slice(0, 8);
  const topQty = Object.entries(byName).sort((a, b) => b[1].qty - a[1].qty).slice(0, 8);
  const mR = topRev.length ? topRev[0][1].rev : 1, mQ = topQty.length ? topQty[0][1].qty : 1;
  const rr = document.getElementById('repTopRev');
  if (rr) rr.innerHTML = topRev.length ? topRev.map(([n, d]) => `<div class="bar-row"><div class="bar-lbl">${esc(n)}</div><div class="bar-track"><div class="bar-fill bf-acc" style="width:${d.rev / mR * 100}%"></div></div><div class="bar-val" style="color:var(--accent)">${fmt(d.rev)}</div></div>`).join('') : '<div class="t-muted t-sm">Нет данных</div>';
  const rq = document.getElementById('repTopQty');
  if (rq) rq.innerHTML = topQty.length ? topQty.map(([n, d]) => `<div class="bar-row"><div class="bar-lbl">${esc(n)}</div><div class="bar-track"><div class="bar-fill bf-grn" style="width:${d.qty / mQ * 100}%"></div></div><div class="bar-val" style="color:var(--green)">${d.qty} пар</div></div>`).join('') : '<div class="t-muted t-sm">Нет данных</div>';
  const bySz = {}; ST.products.forEach(p => { const r = getRem(p, sm); if (!bySz[p.size]) bySz[p.size] = 0; bySz[p.size] += r; });
  const szE = Object.entries(bySz).sort((a, b) => +a[0] - +b[0]); const mSz = szE.length ? Math.max(...szE.map(e => e[1])) : 1;
  const rsr = document.getElementById('repSzRem');
  if (rsr) rsr.innerHTML = szE.length ? szE.map(([sz, qty]) => `<div class="bar-row"><div class="bar-lbl">Размер ${sz}</div><div class="bar-track"><div class="bar-fill bf-blu" style="width:${qty / mSz * 100}%"></div></div><div class="bar-val" style="color:var(--blue)">${qty} пар</div></div>`).join('') : '<div class="t-muted t-sm">Нет данных</div>';
  const byPay = {}; sales.forEach(s => { byPay[s.payment] = (byPay[s.payment] || 0) + s.total; });
  const totPay = Object.values(byPay).reduce((a, v) => a + v, 0);
  const rp = document.getElementById('repPay');
  if (rp) rp.innerHTML = Object.entries(byPay).sort((a, b) => b[1] - a[1]).map(([p, v]) => `<div class="info-row"><span class="ir-lbl">${esc(p)}</span><div class="fc gap-9"><span class="t-xs t-muted">${totPay > 0 ? Math.round(v / totPay * 100) : 0}%</span><span class="ir-val">${fmt(v)}</span></div></div>`).join('') || '<div class="t-muted t-sm">Нет данных</div>';
  const groups = buildGroups(sm);
  const tbody = document.getElementById('repDetailTbody');
  if (tbody) tbody.innerHTML = groups.map(g => {
    const gS = sales.filter(s => s.name === g.name && (s.color || '') === (g.color || ''));
    const gRev = gS.reduce((a, s) => a + s.total, 0);
    const gProfit = gS.reduce((a, s) => a + (s.profitRaw || 0), 0);
    const gBuyCost = gS.reduce((a, s) => a + ((s.buyPriceRaw || 0) * s.qty), 0);
    const gSold = gS.reduce((a, s) => a + s.qty, 0);
    const gM = gRev > 0 ? Math.round(gProfit / gRev * 100) : 0;
    return `<tr>
      <td class="td-bold">${esc(g.name)} <span class="td-muted">${esc(g.color)}</span></td>
      <td class="td-muted">${esc(g.brand || '—')}</td>
      <td class="td-muted">${esc(g.code || '—')}</td>
      <td>${g.totalIn}</td>
      <td style="color:var(--accent);font-weight:700">${gSold}</td>
      <td style="color:${g.totalRem <= 1 ? 'var(--red)' : 'var(--green)'};font-weight:700">${g.totalRem}</td>
      <td class="td-green">${fmt(gRev)}</td>
      <td class="td-muted">${fmt(gBuyCost)}</td>
      <td class="td-gold">${fmt(gProfit)}</td>
      <td><span class="bdg ${gM >= 30 ? 'b-green' : gM >= 15 ? 'b-gold' : 'b-red'}">${gM}%</span></td>
    </tr>`;
  }).join('') || `<tr><td colspan="10" class="tbl-empty"><p>Нет данных</p></td></tr>`;
}

/* ═══════════════════════════════════════════════════════
   HISTORY
═══════════════════════════════════════════════════════ */
function setHistType(t, btn) {
  ST.histType = t;
  document.querySelectorAll('#histTypeChips .fchip').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderHistory();
}
function initHistYear() {
  const sel = document.getElementById('histYear'); if (!sel) return;
  const prev = sel.value;
  const years = new Set();
  ST.sales.forEach(s => { const d = parseD(s.date); years.add(d.getFullYear()); });
  ST.products.forEach(p => { const d = parseD(p.date); years.add(d.getFullYear()); });
  const now = new Date().getFullYear(); years.add(now);
  const sorted = [...years].sort((a, b) => b - a);
  sel.innerHTML = '<option value="all">— Все годы —</option>' + sorted.map(y => `<option value="${y}">${y}</option>`).join('');
  // Restore the user's previous selection; fall back to current year
  sel.value = (prev && [...sel.options].some(o => o.value === prev)) ? prev : String(now);
}
function renderHistory() {
  if (ST.page !== 'history' || !ST.role) return;
  initHistYear();
  const year = gv('histYear'), month = gv('histMonth'), q = gv('histSearch').toLowerCase();
  let sales = [...ST.sales], arrivals = [...ST.products];
  if (year !== 'all') { sales = sales.filter(s => parseD(s.date).getFullYear() === +year); arrivals = arrivals.filter(p => parseD(p.date).getFullYear() === +year); }
  if (month !== 'all') { sales = sales.filter(s => parseD(s.date).getMonth() + 1 === +month); arrivals = arrivals.filter(p => parseD(p.date).getMonth() + 1 === +month); }
  if (q) { sales = sales.filter(s => s.name.toLowerCase().includes(q) || (s.customer || '').toLowerCase().includes(q)); arrivals = arrivals.filter(p => p.name.toLowerCase().includes(q)); }
  const rev = sales.reduce((a, s) => a + s.total, 0), profit = sales.reduce((a, s) => a + (s.profitRaw || 0), 0);
  const pairs = sales.reduce((a, s) => a + s.qty, 0), totalIn = arrivals.reduce((a, p) => a + p.qty, 0);
  const hk = document.getElementById('histKpi');
  if (hk) hk.innerHTML = `
    ${ST.role === 'owner' ? `<div class="kpi"><div class="kpi-stripe green"></div><div class="kpi-label">Выручка</div><div class="kpi-val green">${fmt(rev)}</div><div class="kpi-sub">${sales.length} продаж</div></div>` : ''}
    <div class="kpi"><div class="kpi-stripe orange"></div><div class="kpi-label">Продано пар</div><div class="kpi-val orange">${pairs}</div></div>
    ${ST.role === 'owner' ? `<div class="kpi"><div class="kpi-stripe gold"></div><div class="kpi-label">Прибыль 👑</div><div class="kpi-val gold">${fmt(profit)}</div></div>` : ''}
    <div class="kpi"><div class="kpi-stripe blue"></div><div class="kpi-label">Принято пар</div><div class="kpi-val blue">${totalIn}</div><div class="kpi-sub">${arrivals.length} позиций</div></div>`;
  const byDay = {};
  if (ST.histType !== 'arrive') sales.forEach(s => { if (!byDay[s.date]) byDay[s.date] = { sales: [], arr: [] }; byDay[s.date].sales.push(s); });
  if (ST.histType !== 'sales') arrivals.forEach(p => { if (!byDay[p.date]) byDay[p.date] = { sales: [], arr: [] }; byDay[p.date].arr.push(p); });
  const days = Object.keys(byDay).sort((a, b) => parseD(b) - parseD(a));
  const tl = document.getElementById('histTL'); if (!tl) return;
  if (!days.length) { tl.innerHTML = '<div class="card card-p t-muted t-sm">Нет данных за выбранный период</div>'; return; }
  tl.innerHTML = days.map(ds => {
    const d = byDay[ds];
    const dayRev = d.sales.reduce((a, s) => a + s.total, 0);
    const dayProfit = d.sales.reduce((a, s) => a + (s.profitRaw || 0), 0);
    const dayPairs = d.sales.reduce((a, s) => a + s.qty, 0);
    const pd = parseD(ds);
    const dayLbl = pd.toLocaleDateString(CFG.LOC, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    let body = '';
    if (d.sales.length) {
      body += `<div class="fw-8 t-sm mb-8" style="color:var(--accent)">💰 Продажи (${d.sales.length})</div>
        <div class="tbl-wrap mb-12"><div class="tbl-overflow"><table>
          <thead><tr><th>Товар</th><th>Р-р</th><th>Кол</th>${ST.role === 'owner' ? '<th>Цена</th><th>Прибыль 👑</th>' : ''}<th>Оплата</th><th>Продавец</th></tr></thead>
          <tbody>${d.sales.map(s => `<tr>
            <td class="td-bold">${esc(s.name)}</td><td>${s.size}</td><td>${s.qty}</td>
            ${ST.role === 'owner' ? `<td class="td-green">${fmt(s.total)}</td>` : ''}
            ${ST.role === 'owner' ? `<td class="td-gold">${fmt(s.profitRaw || 0)}</td>` : ''}
            <td><span class="bdg b-gray">${esc(s.payment)}</span></td>
            <td class="td-muted">${esc(s.sellerName || '—')}</td>
          </tr>`).join('')}</tbody>
        </table></div></div>`;
    }
    if (d.arr.length) {
      const arrNames = [...new Set(d.arr.map(p => p.name))];
      body += `<div class="fw-8 t-sm mb-8" style="color:var(--blue)">📦 Поступления</div>`;
      arrNames.forEach(n => {
        const rows = d.arr.filter(p => p.name === n);
        const tot = rows.reduce((a, p) => a + p.qty, 0);
        body += `<div class="info-row"><div><div class="fw-7 t-sm">${esc(n)}</div><div class="t-xs t-muted">${rows.map(p => `р.${p.size}(${p.qty})`).join(' ')}</div></div><span>${tot} пар</span></div>`;
      });
    }
    return `<div class="tl-day">
      <div class="tl-day-hdr" onclick="this.parentElement.classList.toggle('is-open')">
        <div class="fc gap-9 fw">
          <span class="fw-8 t-sm">${dayLbl}</span>
          ${d.sales.length ? `<span class="bdg b-orange">${d.sales.length} прод. · ${dayPairs} пар</span>` : ''}
          ${d.arr.length ? `<span class="bdg b-blue">+${d.arr.reduce((a, p) => a + p.qty, 0)} пар</span>` : ''}
        </div>
        <div class="fc gap-12">
          ${ST.role === 'owner' && dayRev ? `<span class="fw-8 t-sm td-green">${fmt(dayRev)}</span>` : ''}
          ${ST.role === 'owner' && dayProfit ? `<span class="t-xs t-muted">${fmt(dayProfit)}</span>` : ''}
          <span class="t-muted" style="font-size:.75rem">▾</span>
        </div>
      </div>
      <div class="tl-day-body">${body}</div>
    </div>`;
  }).join('');
}

/* ═══════════════════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════════════════ */
function saveSett() {
  ST.sett.low = gi('setLow') || 2;
  localStorage.setItem('obuvnitsa_sett', JSON.stringify(ST.sett));
  toast('✅ Настройки сохранены', 'ok');
}

function renderDbStats() {
  if (ST.page !== 'settings') return;
  const el = document.getElementById('dbStats'); if (!el) return;
  el.innerHTML = `
    <div class="info-row"><span class="ir-lbl">Товаров (строк)</span><span class="ir-val">${ST.products.length}</span></div>
    <div class="info-row"><span class="ir-lbl">Продаж</span><span class="ir-val">${ST.sales.length}</span></div>
    <div class="info-row"><span class="ir-lbl">Роль</span><span class="ir-val">${ST.role === 'owner' ? '👑 Хозяйка' : '🧑‍💼 Продавщица'}</span></div>
    <div class="info-row"><span class="ir-lbl">Хранилище</span><span class="ir-val">☁️ Supabase</span></div>`;
}

/* ═══════════════════════════════════════════════════════
   EXPORT
═══════════════════════════════════════════════════════ */
function exportSalesCSV() {
  let sales = ST.sales;
  if (ST.page === 'reports') {
    const repFrom = gv('repFrom'), repTo = gv('repTo');
    sales = (repFrom || repTo) ? byDateRange(ST.sales, repFrom, repTo) : byPrd(ST.sales, ST.repPrd);
  }
  const rows = [['Дата', 'Время', 'Товар', 'Размер', 'Цвет', 'Кол-во', 'Цена', 'Закупка', 'Прибыль', 'Оплата', 'Покупатель', 'Заметки', 'Продавец']];
  sales.forEach(s => rows.push([s.date, s.time || '', s.name, s.size, s.color || '', s.qty, s.total, (s.buyPriceRaw || 0) * s.qty, s.profitRaw || 0, s.payment, s.customer || '', s.note || '', s.sellerName || '']));
  dlCSV(rows, 'sales_' + new Date().toISOString().slice(0, 10) + '.csv');
  toast(`⬇ Экспорт готов (${sales.length} записей)`, 'ok');
}
function exportStockCSV() {
  const sm = buildSoldMap();
  const rows = [['Арт.', 'Название', 'Бренд', 'Тип', 'Цвет', 'Размер', 'Пришло', 'Продано', 'Остаток', 'Цена закупки', 'Цена продажи', 'Поставщик', 'Дата']];
  ST.products.forEach(p => { const rem = getRem(p, sm); rows.push([p.code || '', p.name, p.brand || '', p.type || '', p.color, p.size, p.qty, p.qty - rem, rem, p.buyPriceRaw || 0, p.sellPrice, p.supplier || '', p.date || '']); });
  dlCSV(rows, 'stock_' + new Date().toISOString().slice(0, 10) + '.csv');
  toast('⬇ Склад экспортирован', 'ok');
}
function dlCSV(rows, fn) {
  const csv = rows.map(r => r.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = fn; a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════════════════
   DANGEROUS
═══════════════════════════════════════════════════════ */
async function clearSales() {
  const ok = await confDialog('🗑', 'Удалить все продажи?', 'Это нельзя отменить.', 'Удалить', 'btn-danger');
  if (!ok) return;
  const { error } = await SB.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) { toast('❌ Ошибка: ' + error.message, 'err'); return; }
  toast('Все продажи удалены', 'ok');
  await loadSales();
  renderAll();
}

/* ═══════════════════════════════════════════════════════
   BOOTSTRAP
═══════════════════════════════════════════════════════ */
(async () => {
  try {
    try { const s = localStorage.getItem('obuvnitsa_sett'); if (s) ST.sett = { ...ST.sett, ...JSON.parse(s) }; } catch {}

    // 1. Try instant boot from cached data
    const booted = tryInstantBoot();

    if (!booted) {
      if (_hasLocalSession()) {
        // Saved role exists but no cached data — restore role and load fresh
        const lu = JSON.parse(localStorage.getItem(_LAST_KEY) || 'null');
        if (lu?.role) {
          const name = lu.name || (lu.role === 'owner' ? 'Хозяйка' : 'Продавщица');
          ST.role    = lu.role;
          ST.user    = { id: lu.role, email: name };
          ST.profile = { role: lu.role, full_name: name };
          showLoading();
          await initApp();
        } else {
          showAuth();
        }
      } else {
        showAuth();
      }
    } else {
      // Booted from cache — refresh data in background
      await initApp();
    }

    // Safety: if still on loading screen after 9s, fall back to auth
    setTimeout(() => {
      if (document.getElementById('loadingPage').style.display !== 'none') {
        clearLastUser();
        showAuth();
        toast('Медленное соединение. Введи код повторно.', 'err');
      }
    }, 9000);

  } catch (e) {
    console.error('Boot error:', e);
    showAuth();
  }
})();
