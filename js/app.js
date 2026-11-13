'use strict';
/* ============================================================
   KAGUMI Transport — Frontend SPA (js/app.js)
   Frontend statis (GitHub Pages). Data diambil dari Apps Script REST API
   (URL di js/config.js) lewat fetch() POST text/plain.
   Prinsip: semua halaman ada di satu dokumen, data dimuat sekali
   (getBootstrap) lalu disimpan di memori + localStorage. Navigasi,
   pencarian, filter, dan ringkasan dihitung di browser (0 ms).
   Penulisan memakai optimistic UI bila aman, dan selalu dicek ulang server.
   ============================================================ */

// ── Konstanta ──────────────────────────────────────────────
const APP_VERSI = '3.7'; // diisi otomatis saat build; harus sama dengan API_VERSI di Kode.gs
const LS = { token: 'kgm_token', theme: 'kgm_theme', cache: 'kgm_cache_v1', cols: 'kgm_rekap_cols', draft: 'kgm_draft_', master: 'kgm_master_open', login: 'kgm_login_ctx' };
const STATUS = ['Dijadwalkan', 'Dikirim', 'Diterima', 'Dibatalkan'];
const STATUS_CLS = { Dijadwalkan: 'b-indigo', Dikirim: 'b-amber', Diterima: 'b-green', Dibatalkan: 'b-red', Draf: 'b-slate' };
const METODE = ['COD', 'DP', 'Invoice Surat Kembali', 'Lunas', 'Termin'];
const JENIS_KENDARAAN = ['Pickup Bak', 'Pickup Box', 'Engkel Bak', 'Engkel Box', 'CDD Bak', 'CDD Box', 'Fuso Engkel Bak', 'Fuso Engkel Box', 'Tronton Bak', 'Tronton Box'];
const JENIS_UNIT = JENIS_KENDARAAN.concat(['Towing / Car Carrier', 'Self Loader', 'Lainnya']);
const LAYANAN_KIRIM = ['Door to Door', 'Door to Port', 'Port to Port'];
const MERK = ['Toyota', 'Daihatsu', 'Honda', 'Mitsubishi', 'Suzuki', 'Nissan', 'Mazda', 'Hyundai', 'Kia', 'Wuling', 'Chery', 'BYD', 'DFSK',
  'Isuzu', 'Hino', 'UD Trucks', 'Mercedes-Benz', 'BMW', 'Lexus', 'Subaru', 'Ford', 'Chevrolet', 'Volkswagen', 'Audi', 'Peugeot', 'Renault',
  'MG', 'Haval', 'Geely', 'Neta', 'Volvo', 'Land Rover', 'Jeep', 'Porsche', 'Tesla', 'Datsun', 'Lainnya'];
const JENIS_SIM = ['A', 'A Umum', 'B1', 'B1 Umum', 'B2', 'B2 Umum'];
const KONDISI_PART = ['Baik', 'Penyok', 'Gores / Lecet', 'Retak / Pecah', 'Cat Terkelupas', 'Lainnya'];
const KONDISI_ICON = { 'Penyok': '✕', 'Gores / Lecet': '〰', 'Retak / Pecah': '◎', 'Cat Terkelupas': '△', 'Lainnya': '□' };
const PARTS = ['Bumper depan', 'Kap mesin', 'Fender depan kiri', 'Fender depan kanan', 'Pintu depan kiri', 'Pintu depan kanan',
  'Pintu belakang kiri', 'Pintu belakang kanan', 'Fender belakang kiri', 'Fender belakang kanan', 'Pintu bagasi / tailgate',
  'Bumper belakang', 'Atap', 'Spion kiri & kanan', 'Kaca depan', 'Kaca belakang', 'Kaca samping', 'Lampu depan', 'Lampu belakang'];
const PHOTO_SLOTS = ['Depan', 'Belakang', 'Sisi kiri', 'Sisi kanan', 'Atas', 'Detail kerusakan'];
const THEMES = [['Emerald Green', '#006C49'], ['Royal Blue', '#1D4ED8'], ['Modern Indigo', '#4F46E5'], ['Deep Teal', '#0F766E'], ['Crimson Amber', '#B45309'], ['Slate Dark', '#334155']];
const CDN = {
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  xlsx: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
};

// ── State aplikasi (memori) ────────────────────────────────
const S = {
  token: null, me: null, settings: {}, booted: false, lastSync: 0,
  d: { pelanggan: [], penerima: [], ekspedisi: [], kendaraan: [], pengemudi: [], rekening: [], orders: [], invoices: [], inspeksi: [], finance: [], users: [], pertanyaan: [], berita: [], crmCompany: [], crmLeads: [], crmActivity: [], crmUsers: [], keluhan: [], keluhanLog: [], orderRingkas: [], csUsers: [], surat: [], harga: [], kontakSurat: [], targetSales: [] },
  web: null,
  page: 'ringkasan',
  ui: {
    rekap: { q: '', from: '', to: '', svc: '', status: '', dok: '', driver: '', page: 1, sort: { k: 'tgl', dir: -1 } },
    inv: { f: 'belum', q: '', sel: null, page: 1 },
    master: {},
    fin: { period: 'bulan', from: '', to: '', tab: 'semua', q: '', rek: '', page: 1 },
    lap: { jenis: 'order', from: '', to: '', svc: '', status: '', page: 1 },
    set: { tab: 'akun' },
    web: { tab: 'beranda' },
    pty: { f: 'aktif', q: '' },
    insp: { orderId: '', rec: null, photos: [] }
  },
  thumbs: {},
  charts: {}
};
const SA_PAGES = ['finance', 'laporan', 'pengaturan', 'website'];
const isSales = () => !!(S.me && S.me.role === 'SALES');
const CRM_PAGES = ['crm', 'crm-kinerja', 'crm-perusahaan', 'crm-leads', 'crm-aktivitas'];
const isCS = () => !!(S.me && S.me.role === 'CS');
const CS_PAGES = ['keluhan', 'cs-kinerja', 'pertanyaan'];
/** Halaman yang boleh dibuka peran terbatas (Sales / CS); null = semua (Admin & Super Admin). */
const SURAT_PAGES = ['surat', 'harga'];
const pagesTerbatas = () => (isSales() ? CRM_PAGES.concat(SURAT_PAGES) : isCS() ? CS_PAGES.concat(SURAT_PAGES) : null);
// ── Sidebar: grup menu bisa dilipat (diingat per browser) ──
function sbSecState() { try { return JSON.parse(lsGet('kgmSbSec', '{}')) || {}; } catch (e) { return {}; } }
function sbSecSet(key, open, simpan) {
  const el = document.querySelector('.sb-sec[data-sec="' + key + '"]'); if (!el) return;
  el.classList.toggle('open', open);
  const b = el.querySelector('[data-sec-toggle]'); if (b) b.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (simpan) { const st = sbSecState(); st[key] = open; lsSet('kgmSbSec', JSON.stringify(st)); }
  sbSecDots();
}
function sbSecInit() {
  const st = sbSecState();
  $$('.sb-sec').forEach(el => { const k = el.dataset.sec; sbSecSet(k, st[k] !== undefined ? st[k] : k === 'ops' || (pagesTerbatas() || []).length > 0); });
  if (S.page) sbSecBuka(S.page);
}
function sbSecBuka(page) {
  const a = document.querySelector('.sb-link[data-page="' + page + '"]'), sec = a && a.closest('.sb-sec');
  if (sec && !sec.classList.contains('open')) sbSecSet(sec.dataset.sec, true);
}
/** Titik merah di judul grup yang dilipat bila ada lencana di dalamnya. */
function sbSecDots() {
  $$('.sb-sec').forEach(el => {
    const n = $$('.sb-badge', el).filter(b => !b.hidden).length;
    const d = el.querySelector('.sb-dot'); if (d) d.hidden = !n || el.classList.contains('open');
  });
}
const isSA = () => !!(S.me && S.me.role === 'SUPER_ADMIN');

// ── Utilitas ───────────────────────────────────────────────
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = v => String(v === undefined || v === null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = Number(String(v === undefined || v === null ? '' : v).replace(/[^\d\-]/g, '')); return isFinite(n) ? n : 0; };
const rp = n => (Number(n) < 0 ? '-Rp ' : 'Rp ') + Math.abs(Number(n) || 0).toLocaleString('id-ID');
const fnum = n => (Number(n) || 0).toLocaleString('id-ID');
const BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BLN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date()); }
function nowJkt() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  return today() + ' ' + p;
}
function tgl(s, long) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s ? esc(s) : '—';
  return Number(m[3]) + ' ' + (long ? BLN_PANJANG : BLN)[Number(m[2]) - 1] + ' ' + m[1];
}
function tglJam(s) { const t = String(s || '').slice(11, 16); return tgl(s) + (t ? ', ' + t : ''); }
function tglPendek(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[3] + '/' + m[2] + '/' + m[1].slice(2) : '—'; }
function dParse(s) { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN; }
function diffHari(a, b) { return Math.round((dParse(a) - dParse(b)) / 864e5); }
function addDays(s, n) { const d = new Date(dParse(s) + Number(n || 0) * 864e5); return d.toISOString().slice(0, 10); }
function monthKey(s) { return String(s || '').slice(0, 7); }
function monthLabel(k) { const [y, m] = k.split('-'); return BLN[Number(m) - 1] + ' ' + y.slice(2); }
function initials(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'; }
function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; }
function digits(v) { return String(v || '').replace(/\D/g, ''); }
function waNumber(v) { let d = digits(v); if (d.startsWith('0')) d = '62' + d.slice(1); else if (d.startsWith('8')) d = '62' + d; return d; }
function normPlate(v) { return String(v || '').toUpperCase().replace(/\s+/g, ' ').trim(); }
function byId(list, id) { return (S.d[list] || []).find(r => String(r.ID) === String(id)) || null; }
function upsert(list, rec, key) {
  key = key || 'ID';
  const arr = S.d[list];
  const i = arr.findIndex(r => String(r[key]) === String(rec[key]));
  if (i >= 0) arr[i] = Object.assign({}, arr[i], rec); else arr.push(rec);
}
function removeFrom(list, id) { S.d[list] = S.d[list].filter(r => String(r.ID) !== String(id)); }
function lsGet(k, def) { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* penyimpanan penuh / diblokir */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* abaikan */ } }
function loadScript(url) {
  loadScript.p = loadScript.p || {};
  if (!loadScript.p[url]) loadScript.p[url] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = () => { delete loadScript.p[url]; rej(new Error('Gagal memuat pustaka.')); };
    document.head.appendChild(s);
  });
  return loadScript.p[url];
}
// Persentase pajak: terima koma atau titik desimal, tampilkan dengan koma (gaya Indonesia).
function persenNum(v) { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0; }
function fmtPersen(v) { const n = Math.round(persenNum(v) * 100) / 100; return String(n).replace('.', ','); }
function labelPajak(o) { return 'Pajak' + (String(o.PajakPersen || '').trim() !== '' ? ' ' + fmtPersen(o.PajakPersen) + '%' : ''); }
function terbilang(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  const s = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const f = x => {
    if (x < 12) return s[x];
    if (x < 20) return f(x - 10) + ' belas';
    if (x < 100) return f(Math.floor(x / 10)) + ' puluh' + (x % 10 ? ' ' + f(x % 10) : '');
    if (x < 200) return 'seratus' + (x - 100 ? ' ' + f(x - 100) : '');
    if (x < 1000) return f(Math.floor(x / 100)) + ' ratus' + (x % 100 ? ' ' + f(x % 100) : '');
    if (x < 2000) return 'seribu' + (x - 1000 ? ' ' + f(x - 1000) : '');
    if (x < 1e6) return f(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + f(x % 1000) : '');
    if (x < 1e9) return f(Math.floor(x / 1e6)) + ' juta' + (x % 1e6 ? ' ' + f(x % 1e6) : '');
    if (x < 1e12) return f(Math.floor(x / 1e9)) + ' miliar' + (x % 1e9 ? ' ' + f(x % 1e9) : '');
    return f(Math.floor(x / 1e12)) + ' triliun' + (x % 1e12 ? ' ' + f(x % 1e12) : '');
  };
  const t = n === 0 ? 'nol' : f(n);
  return (t.charAt(0).toUpperCase() + t.slice(1) + ' rupiah').replace(/\s+/g, ' ');
}

// ── API ke server (fetch → Apps Script REST API) ──────────────────────
let pending = 0;
function setSync(state) {
  const dot = $('#syncDot'); if (!dot) return;
  dot.className = 'sync-dot' + (state === 'busy' ? ' busy' : state === 'off' ? ' off' : '');
  dot.title = state === 'busy' ? 'Menyinkronkan…' : state === 'off' ? 'Koneksi bermasalah' : 'Data tersinkron';
}
const API_TIMEOUT = { markPrinted: 120000, exportPdf: 120000, runBackupNow: 300000, uploadFotoInspeksi: 120000, sendInvoiceEmail: 90000, testEmail: 90000 };
// Semua panggilan memakai POST text/plain → tidak memicu preflight CORS di Apps Script.
function apiUrl() { return String((window.KAGUMI_CONFIG && window.KAGUMI_CONFIG.GAS_URL) || '').trim(); }
function apiUrlValid() { return /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(apiUrl()) || /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?)?\/[\w\/-]*exec$/.test(apiUrl()); }
// Aksi yang aman diulang otomatis bila koneksi putus sesaat (tidak menggandakan data)
const API_RETRY = ['getBootstrap', 'getLoginContext', 'getLogs', 'getFotoThumb', 'getSystemStatus', 'markInvoicePaid', 'updateOrderStatus', 'updateEkspedisi'];
function api(fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  if (!API_RETRY.includes(fn)) return apiSekali(fn, args);
  return apiSekali(fn, args).catch(err => {
    if (!err || !err.jaringan) throw err;
    return new Promise(res => setTimeout(res, 1500)).then(() => apiSekali(fn, args));
  });
}
function apiSekali(fn, args) {
  pending++; setSync('busy');
  const ms = API_TIMEOUT[fn] || 45000;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms);
  const selesai = ok => { clearTimeout(timer); pending = Math.max(0, pending - 1); if (!pending) setSync(ok ? 'ok' : 'off'); else if (!ok) setSync('off'); };
  return fetch(apiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: fn, args: args }),
    redirect: 'follow',
    signal: ctrl ? ctrl.signal : undefined
  }).then(res => res.text().then(txt => {
    let r;
    try { r = JSON.parse(txt); } catch (e) {
      throw new Error(res.ok ? 'Server tidak mengirim data yang benar. Pastikan penerapan Apps Script memakai akses "Siapa saja" (Anyone) dan URL di js/config.js berakhiran /exec.' : 'Server menjawab dengan galat ' + res.status + '.');
    }
    return r;
  }), err => {
    if (err && err.name === 'AbortError') { const e = new Error('Server tidak merespons dalam ' + Math.round(ms / 1000) + ' detik. Periksa koneksi lalu coba lagi.'); e.jaringan = true; throw e; }
    const e = new Error(navigator.onLine === false ? 'Anda sedang offline. Periksa koneksi internet.'
      : S.lastSync ? 'Koneksi ke server terputus sesaat. Silakan coba lagi.' : 'Tidak dapat terhubung ke server. Periksa internet, URL di js/config.js, dan akses penerapan "Siapa saja".');
    e.jaringan = true; throw e;
  }).then(r => {
    selesai(true);
    if (!r) throw new Error('Server tidak mengirim respons.');
    if (r.success) return r;
    if (r.auth) sessionExpired(r.message);
    throw new Error(r.message || 'Terjadi kesalahan.');
  }, err => { selesai(false); throw err; });
}

// ── Toast ──────────────────────────────────────────────────
function toast(type, title, text, ms) {
  const icons = { success: 'bi-check-circle-fill', error: 'bi-x-octagon-fill', info: 'bi-info-circle-fill', warning: 'bi-exclamation-triangle-fill' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<i class="t-ic bi ${icons[type] || icons.info}"></i><div><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ''}</div><button class="x" aria-label="Tutup"><i class="bi bi-x"></i></button>`;
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  el.querySelector('.x').onclick = close;
  $('#toasts').appendChild(el);
  setTimeout(close, ms || (type === 'error' ? 6500 : 3800));
  return el;
}
const ok = (t, s) => toast('success', t, s);
const fail = (e, title) => toast('error', title || 'Gagal', e && e.message ? e.message : String(e));

// ── Modal, konfirmasi, drawer ──────────────────────────────
let modalOnClose = null;
function openModal(o) {
  const m = $('#modal');
  $('#modalTitle').textContent = o.title || '';
  $('#modalSub').textContent = o.sub || '';
  $('#modalIcon').innerHTML = `<i class="bi ${o.icon || 'bi-pencil-square'}"></i>`;
  $('#modalBody').innerHTML = o.body || '';
  $('#modalFoot').innerHTML = o.foot || '';
  const box = m.querySelector('.modal-box');
  box.className = 'modal-box' + (o.size ? ' ' + o.size : '');
  m.hidden = false;
  modalOnClose = o.onClose || null;
  const first = m.querySelector('.modal-b .input:not([readonly]):not([disabled])');
  if (first && o.focus !== false && window.innerWidth > 640) setTimeout(() => first.focus(), 60);
  return m;
}
function closeModal() { const m = $('#modal'); if (m.hidden) return; m.hidden = true; if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); } }
function confirmDialog(o) {
  return new Promise(resolve => {
    const box = $('#confirmBox');
    $('#confirmTitle').textContent = o.title || 'Lanjutkan?';
    $('#confirmText').innerHTML = o.html || esc(o.text || '');
    const ic = $('#confirmIcon');
    ic.className = 'confirm-ic' + (o.variant === 'danger' ? ' danger' : o.variant === 'warn' ? ' warn' : '');
    ic.innerHTML = `<i class="bi ${o.icon || 'bi-question-lg'}"></i>`;
    const btnCls = o.variant === 'danger' ? 'btn-danger' : o.variant === 'warn' ? 'btn-primary' : 'btn-primary';
    $('#confirmFoot').innerHTML = `${o.extra || ''}<button class="btn btn-secondary" data-r="0">${esc(o.cancel || 'Batal')}</button><button class="btn ${btnCls}" data-r="1">${o.okIcon ? `<i class="bi ${o.okIcon}"></i>` : ''}${esc(o.ok || 'Ya, lanjutkan')}</button>`;
    box.hidden = false;
    const finish = v => { box.hidden = true; box.onclick = null; resolve(v); };
    box.onclick = e => {
      const b = e.target.closest('[data-r]');
      if (b) finish(b.dataset.r === '1' ? true : (b.dataset.r === '0' ? false : b.dataset.r));
      else if (e.target.closest('[data-close]')) finish(false);
    };
    setTimeout(() => { const b = box.querySelector('[data-r="1"]'); if (b) b.focus(); }, 30);
  });
}
function openDrawer(o) {
  $('#drawerTitle').textContent = o.title || '';
  $('#drawerSub').innerHTML = o.sub || '';
  $('#drawerBody').innerHTML = o.body || '';
  $('#drawerFoot').innerHTML = o.foot || '';
  $('#drawer').hidden = false;
}
function closeDrawer() { $('#drawer').hidden = true; }
function btnBusy(btn, busy, text) {
  if (!btn) return;
  if (busy) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${text ? '<span>' + esc(text) + '</span>' : ''}`; }
  else { btn.disabled = false; if (btn.dataset.html) btn.innerHTML = btn.dataset.html; }
}

// ── Tema (warna dari Pengaturan + mode gelap) ──────────────
function hexToRgb(h) { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || ''); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 108, 73]; }
function shade(h, f) { const c = hexToRgb(h).map(v => Math.max(0, Math.min(255, Math.round(v * f)))); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); }
function applyThemeColor(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex || '')) hex = '#006C49';
  const r = document.documentElement.style, [a, b, c] = hexToRgb(hex);
  r.setProperty('--primary', hex);
  r.setProperty('--primary-hover', shade(hex, .76));
  r.setProperty('--primary-press', shade(hex, .57));
  r.setProperty('--primary-soft', `rgba(${a},${b},${c},.10)`);
  r.setProperty('--primary-soft-2', `rgba(${a},${b},${c},.18)`);
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = hex;
}
function setDark(on) {
  document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
  lsSet(LS.theme, on ? 'dark' : 'light');
  const t = $('#themeMenuText'); if (t) t.textContent = on ? 'Mode terang' : 'Mode gelap';
  const b = $('#btnTheme'); if (b) b.innerHTML = `<i class="bi ${on ? 'bi-sun' : 'bi-moon-stars'}"></i>`;
  if (S.booted && (S.page === 'ringkasan' || S.page === 'finance' || S.page === 'laporan')) renderPage(S.page);
}
const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

// ── Logo ───────────────────────────────────────────────────
function logoHTML(st) { return st && st.logo ? `<img src="${esc(st.logo)}" alt="Logo">` : '<i class="bi bi-truck"></i>'; }
const LOGIN_TEXT_KEYS = ['tagline', 'loginSub', 'loginP1Judul', 'loginP1Teks', 'loginP2Judul', 'loginP2Teks', 'loginP3Judul', 'loginP3Teks', 'loginFoot'];
function applyLoginTexts(st) {
  const idOf = k => k === 'tagline' ? '#loginTagline' : '#' + k;
  LOGIN_TEXT_KEYS.forEach(k => { const el = $(idOf(k)); if (el && st[k] !== undefined) { el.textContent = st[k]; el.hidden = !String(st[k]).trim(); } });
  [1, 2, 3].forEach(n => { const li = $('#loginP' + n); if (li && (st['loginP' + n + 'Judul'] !== undefined || st['loginP' + n + 'Teks'] !== undefined)) li.hidden = !String(st['loginP' + n + 'Judul'] || '').trim() && !String(st['loginP' + n + 'Teks'] || '').trim(); });
}
function applyBranding(st) {
  st = st || S.settings;
  applyThemeColor(st.themeColor);
  ['#sbLogo', '#loginLogo', '#loginLogoSm'].forEach(s => { const el = $(s); if (el) el.innerHTML = logoHTML(st); });
  const name = st.appName || 'KAGUMI Transport';
  [['#sbAppName', name], ['#loginAppName', name], ['#loginAppNameSm', name], ['#sbTagline', st.companyName || 'Transport']].forEach(([s, v]) => { const el = $(s); if (el) el.textContent = v; });
  applyLoginTexts(st);
  document.title = name;
}

// ============================================================
// BOOT & LOGIN
// ============================================================
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeBoot); else safeBoot();
function safeBoot() {
  if (!apiUrlValid()) { configError(); return; }
  try { boot(); } catch (e) {
    console.error(e);
    lsDel(LS.cache); lsDel(LS.token);
    try { showLogin('Data tersimpan di browser tidak valid dan sudah dibersihkan. Silakan masuk kembali.'); } catch (e2) { throw e; }
  }
}
function boot() {
  setDark(lsGet(LS.theme, '') === 'dark');
  bindGlobal();
  const token = lsGet(LS.token, '');
  let cache = null;
  try { cache = JSON.parse(lsGet(LS.cache, 'null')); } catch (e) { cache = null; }
  if (token && cache && cache.me) {
    // Tampilkan aplikasi seketika dari cache, lalu segarkan di latar belakang
    S.token = token;
    hydrate(cache, true);
    showApp();
    refreshData(true).catch(() => {});
  } else {
    showLogin();
  }
}
function configError() {
  const s = $('#bootSplash'); if (!s) return;
  window.__KGM_BOOTED = true; s.setAttribute('data-err', '1');
  s.innerHTML = `<div class="boot-err"><div class="boot-mark"><i class="bi bi-plug"></i></div><h2>Alamat server belum diatur</h2>
    <p>Buka berkas <b>js/config.js</b>, isi <code>GAS_URL</code> dengan URL penerapan Apps Script yang berakhiran <b>/exec</b>, lalu unggah ulang ke GitHub.</p>
    <code>Nilai sekarang: ${esc(apiUrl() || '(kosong)')}</code></div>`;
}
function hideSplash() { window.__KGM_BOOTED = true; const s = $('#bootSplash'); if (s && !s.classList.contains('out')) { s.classList.add('out'); setTimeout(() => s.remove(), 300); } }

function showLogin(msg) {
  S.booted = false;
  $('#appView').hidden = true;
  $('#loginView').hidden = false;
  hideSplash();
  $('#loginCopy').textContent = '© ' + new Date().getFullYear() + ' ' + (S.settings.companyName || 'KAGUMI Transport');
  if (msg) showLoginError(msg);
  try { const lc = JSON.parse(lsGet(LS.login, 'null')); if (lc) { S.settings = Object.assign({}, S.settings, lc); applyBranding(lc); } } catch (e) { lsDel(LS.login); }
  api('getLoginContext').then(r => {
    const c = r.data || {};
    const simpan = Object.assign({}, c); delete simpan.googleEmail; delete simpan.siap; delete simpan.apiVersi; lsSet(LS.login, JSON.stringify(simpan));
    cekVersiServer(c.apiVersi || '2.0');
    S.settings = Object.assign({}, S.settings, c);
    applyBranding(c);
    $('#loginCopy').textContent = '© ' + new Date().getFullYear() + ' ' + (c.companyName || c.appName || 'KAGUMI Transport');
    $('#setupAlert').hidden = c.siap !== false;
    if (c.googleEmail) {
      $('#btnGoogle').hidden = false; $('#loginDivider').hidden = false;
      $('#btnGoogleText').innerHTML = 'Lanjutkan sebagai <b>' + esc(c.googleEmail) + '</b>';
    }
  }).catch(() => { /* tetap bisa login manual */ });
  setTimeout(() => { if (window.innerWidth > 640) $('#loginEmail').focus(); }, 80);
}
function showLoginError(m) { const a = $('#loginAlert'); a.innerHTML = `<i class="bi bi-exclamation-circle"></i><div>${esc(m)}</div>`; a.hidden = false; }

function onLoginSuccess(r) {
  const d = r.data;
  S.token = d.token;
  lsSet(LS.token, d.token);
  $('#loginAlert').hidden = true;
  S.me = { email: d.email, nama: d.nama, role: d.role };
  return refreshData(true).then(() => { showApp(); ok('Selamat datang', d.nama); });
}
function bindLogin() {
  $('#loginForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('#loginEmail').value.trim(), pass = $('#loginPass').value;
    $('#loginAlert').hidden = true;
    if (!email || !pass) { showLoginError('Isi email dan kata sandi.'); return; }
    const b = $('#btnLogin'); btnBusy(b, true, 'Memeriksa akun…');
    api('loginPassword', email, pass).then(onLoginSuccess).catch(err => showLoginError(err.message)).finally(() => btnBusy(b, false));
  });
  $('#btnGoogle').addEventListener('click', () => {
    const b = $('#btnGoogle'); btnBusy(b, true, 'Memeriksa akun…');
    api('loginGoogle').then(onLoginSuccess).catch(err => showLoginError(err.message)).finally(() => btnBusy(b, false));
  });
  $('#togglePass').addEventListener('click', () => {
    const i = $('#loginPass'); const show = i.type === 'password'; i.type = show ? 'text' : 'password';
    $('#togglePass').innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
  });
}

let expiredShown = false;
function sessionExpired(msg) {
  if (expiredShown) return; expiredShown = true;
  lsDel(LS.token); S.token = null;
  setTimeout(() => { expiredShown = false; showLogin(msg || 'Sesi berakhir. Silakan masuk kembali.'); }, 50);
}
function logout() {
  const t = S.token;
  lsDel(LS.token); lsDel(LS.cache);
  S.token = null; S.me = null; S.d.finance = []; S.d.users = [];
  if (t) api('logout', t).catch(() => {});
  $('#userMenu').hidden = true;
  showLogin();
  toast('info', 'Anda telah keluar');
}

// ── Sinkron data ───────────────────────────────────────────
function hydrate(d, fromCache) {
  S.me = d.me || S.me;
  S.settings = Object.assign({}, d.settings || {});
  ['pelanggan', 'penerima', 'ekspedisi', 'kendaraan', 'pengemudi', 'rekening', 'orders', 'invoices', 'inspeksi', 'pertanyaan', 'crmCompany', 'crmLeads', 'crmActivity', 'crmUsers', 'keluhan', 'keluhanLog', 'orderRingkas', 'csUsers', 'surat', 'harga', 'kontakSurat', 'targetSales'].forEach(k => { if (d[k]) S.d[k] = d[k]; else if (!fromCache) S.d[k] = []; });
  if (!fromCache) { S.d.finance = d.finance || []; S.d.users = d.users || []; S.d.berita = d.berita || []; S.web = d.webKonten || null; S.lastSync = Date.now(); }
  applyBranding(S.settings);
}
function saveCache() {
  // Data keuangan & pengguna tidak disimpan di perangkat
  const c = { me: S.me, settings: S.settings, t: Date.now() };
  ['pelanggan', 'penerima', 'ekspedisi', 'kendaraan', 'pengemudi', 'rekening', 'orders', 'invoices', 'inspeksi', 'pertanyaan', 'crmCompany', 'crmLeads', 'crmActivity', 'crmUsers', 'keluhan', 'keluhanLog', 'orderRingkas', 'csUsers', 'surat', 'harga', 'kontakSurat', 'targetSales'].forEach(k => { c[k] = S.d[k]; });
  lsSet(LS.cache, JSON.stringify(c));
}
let refreshing = null;
// Peringatan bila Kode.gs di Apps Script belum diperbarui (versi server ≠ versi tampilan)
function cekVersiServer(v) {
  if (!v || v === APP_VERSI || $('#verWarn')) return;
  const d = document.createElement('div'); d.id = 'verWarn'; d.className = 'ver-warn'; d.setAttribute('role', 'alert');
  d.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i><div><b>Server Apps Script masih versi ${esc(v)}</b>, tampilan versi ${esc(APP_VERSI)}. Data baru bisa tidak tersimpan. Tempel Kode.gs terbaru lalu <b>Kelola penerapan → Edit → Versi baru → Terapkan</b>.</div><button type="button" aria-label="Tutup">×</button>`;
  d.querySelector('button').onclick = () => d.remove();
  document.body.appendChild(d);
}
function refreshData(silent) {
  if (refreshing) return refreshing;
  refreshing = api('getBootstrap', S.token).then(r => {
    cekVersiServer(r.data.apiVersi || '2.0');
    const wasSA = isSA();
    hydrate(r.data, false);
    saveCache();
    if (S.booted) {
      applyRole();
      if (wasSA !== isSA() && !isSA() && SA_PAGES.includes(S.page)) navigateTo('ringkasan');
      if (pagesTerbatas() && !pagesTerbatas().includes(S.page)) navigateTo(pagesTerbatas()[0]);
      updateBadges();
      if (!isFormPage(S.page)) renderPage(S.page); else syncOpenForms();
    }
    if (!silent) ok('Data diperbarui');
    return r;
  }).finally(() => { refreshing = null; });
  return refreshing;
}
const ORDER_PAGES = ['sewa', 'kirim', 'paket'];
const isFormPage = p => ORDER_PAGES.includes(p) || p === 'inspeksi';
setInterval(() => {
  if (S.booted && S.token && document.visibilityState === 'visible' && Date.now() - S.lastSync > 90000) refreshData(true).catch(() => {});
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (S.booted && S.token && document.visibilityState === 'visible' && Date.now() - S.lastSync > 60000) refreshData(true).catch(() => {});
});

// ============================================================
// KERANGKA APLIKASI
// ============================================================
function showApp() {
  $('#loginView').hidden = true;
  $('#appView').hidden = false;
  S.booted = true;
  applyRole();
  initForms();
  updateBadges();
  const d = new Date(today() + 'T00:00:00');
  $('#todayChip span').textContent = HARI[d.getDay()] + ', ' + tgl(today());
  if (pagesTerbatas()) navigateTo(pagesTerbatas().includes(S.page) ? S.page : pagesTerbatas()[0], { force: true });
  else navigateTo(S.page && (isSA() || !SA_PAGES.includes(S.page)) ? S.page : 'ringkasan', { force: true });
  hideSplash();
}
function applyRole() {
  const me = S.me || {};
  $('#sbUserName').textContent = me.nama || me.email || '';
  $('#sbUserRole').textContent = isSA() ? 'Super Admin' : isSales() ? 'Sales' : isCS() ? 'Customer Service' : 'Admin';
  document.body.classList.toggle('is-sales', isSales());
  document.body.classList.toggle('is-cs', isCS());
  $('#sbAvatar').textContent = initials(me.nama);
  $$('.sa-only').forEach(el => { el.hidden = !isSA(); });
  const open = lsGet(LS.master, '1') === '1';
  $('#sbMasterToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  $('#sbMaster').hidden = !open;
  sbSecInit();
}

const RENDER = {
  ringkasan: renderRingkasan, rekap: renderRekap, invoice: renderInvoice,
  pelanggan: () => renderMaster('pelanggan'), kendaraan: () => renderMaster('kendaraan'),
  pengemudi: () => renderMaster('pengemudi'), penerima: () => renderMaster('penerima'), ekspedisi: () => renderMaster('ekspedisi'),
  finance: renderFinance, laporan: renderLaporan, pengaturan: renderPengaturan,
  website: renderWebsite, pertanyaan: renderPertanyaan,
  keluhan: renderKeluhan, 'cs-kinerja': renderCsKinerja, 'crm-kinerja': renderSalesKinerja, surat: renderSurat, harga: renderHarga,
  crm: renderCrm, 'crm-perusahaan': renderCrmPerusahaan, 'crm-leads': renderCrmLeads, 'crm-aktivitas': renderCrmAktivitas,
  inspeksi: renderInspeksiPage
};
function renderPage(p) { try { if (RENDER[p]) RENDER[p](); } catch (e) { console.error(e); fail(e, 'Gagal menampilkan halaman'); } }

/** Satu-satunya cara berpindah halaman (tanpa reload, tanpa ubah URL). */
function navigateTo(page, opt) {
  opt = opt || {};
  if (pagesTerbatas() && !pagesTerbatas().includes(page)) page = pagesTerbatas()[0];
  if (SA_PAGES.includes(page) && !isSA()) { toast('warning', 'Akses ditolak', 'Halaman ini khusus Super Admin.'); return; }
  const sec = $('#page-' + page); if (!sec) return;
  $$('.page').forEach(p => p.classList.toggle('active', p === sec));
  $$('.sb-link[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  sbSecBuka(page);
  $$('#bottomNav [data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  $('#crumbTitle').textContent = sec.dataset.title || '';
  S.page = page;
  closeSidebar();
  if (ORDER_PAGES.includes(page)) {
    if (opt.order) loadOrderToForm(page, opt.order);
    else if (opt.fresh) newOrder(page);
    else refreshFormLists(page);
  } else if (page === 'inspeksi') {
    if (opt.orderId) S.ui.insp.orderId = opt.orderId;
    renderInspeksiPage();
  } else renderPage(page);
  window.scrollTo({ top: 0, behavior: 'auto' });
  const c = $('#content'); if (c) c.scrollTop = 0;
}
function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarBackdrop').classList.add('open'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarBackdrop').classList.remove('open'); }

function bindGlobal() {
  bindLogin();
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-page]');
    if (nav && (nav.closest('#sbNav') || nav.closest('#bottomNav') || nav.hasAttribute('data-go'))) { e.preventDefault(); navigateTo(nav.dataset.page); return; }
    const go = e.target.closest('[data-go]');
    if (go) { e.preventDefault(); navigateTo(go.dataset.go, go.dataset.fresh ? { fresh: true } : {}); return; }
    if (e.target.closest('#modal [data-close]')) { closeModal(); return; }
    if (e.target.closest('#drawer [data-close]')) { closeDrawer(); return; }
    if (e.target.closest('#printModal [data-close]')) { $('#printModal').hidden = true; return; }
    if (!e.target.closest('#userMenu') && !e.target.closest('#userMenuBtn')) $('#userMenu').hidden = true;
    if (!e.target.closest('#notifMenu') && !e.target.closest('#btnBell')) $('#notifMenu').hidden = true;
    if (!e.target.closest('.top-search')) $('#searchPop').hidden = true;
    if (!e.target.closest('.dd-wrap')) $$('.dd-menu').forEach(m => { m.hidden = true; });
  });
  $('#btnMenu').onclick = openSidebar;
  $('#sbClose').onclick = closeSidebar;
  $('#sidebarBackdrop').onclick = closeSidebar;
  $$('[data-sec-toggle]').forEach(b => b.onclick = () => sbSecSet(b.dataset.secToggle, !b.closest('.sb-sec').classList.contains('open'), true));
  $('#sbMasterToggle').onclick = () => {
    const open = $('#sbMaster').hidden;
    $('#sbMaster').hidden = !open; $('#sbMasterToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
    lsSet(LS.master, open ? '1' : '0');
  };
  $('#btnTheme').onclick = () => setDark(!isDark());
  $('#userMenuBtn').onclick = () => { $('#userMenu').hidden = !$('#userMenu').hidden; };
  $('#userMenu').onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    $('#userMenu').hidden = true;
    if (b.dataset.act === 'logout') logout();
    if (b.dataset.act === 'theme') setDark(!isDark());
    if (b.dataset.act === 'refresh') refreshData(false).catch(fail);
    if (b.dataset.act === 'password') openPasswordModal();
  };
  $('#bottomNav').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'menu') openSidebar();
    if (b.dataset.act === 'new-order') chooseNewOrder();
  });
  $('#btnBell').onclick = () => { renderNotif(); $('#notifMenu').hidden = !$('#notifMenu').hidden; };
  bindSearch();
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#confirmBox').hidden) { $('#confirmBox [data-r="0"]').click(); return; }
      if (!$('#printModal').hidden) { $('#printModal').hidden = true; return; }
      if (!$('#modal').hidden) { closeModal(); return; }
      if (!$('#drawer').hidden) { closeDrawer(); return; }
      closeSidebar();
    }
    if (e.key === '/' && S.booted && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#globalSearch').focus(); }
  });
  window.addEventListener('beforeunload', e => { if (S.booted && ORDER_PAGES.some(formDirty)) { e.preventDefault(); e.returnValue = ''; } });
}
function chooseNewOrder() {
  confirmDialog({ title: 'Buat order baru', html: 'Pilih jenis layanan untuk order baru.', icon: 'bi-plus-lg',
    extra: '<button class="btn btn-secondary" data-r="paket"><i class="bi bi-box-seam"></i> Kirim paket</button><button class="btn btn-secondary" data-r="alt"><i class="bi bi-truck"></i> Kirim mobil</button>', cancel: 'Batal', ok: 'Sewa kendaraan', okIcon: 'bi-truck-front' })
    .then(v => { if (v === true) navigateTo('sewa', { fresh: true }); if (v === 'alt') navigateTo('kirim', { fresh: true }); if (v === 'paket') navigateTo('paket', { fresh: true }); });
}

// ── Badge & notifikasi ─────────────────────────────────────
function expInfo(d) {
  if (!d) return { lvl: 'none', text: 'Belum diisi', days: null };
  const n = diffHari(d, today()), warn = Number(S.settings.peringatanHari || 30);
  if (isNaN(n)) return { lvl: 'none', text: '—', days: null };
  if (n < 0) return { lvl: 'exp', days: n, text: 'Lewat ' + Math.abs(n) + ' hari' };
  if (n <= warn) return { lvl: 'warn', days: n, text: n === 0 ? 'Habis hari ini' : 'Sisa ' + n + ' hari' };
  return { lvl: 'ok', days: n, text: 'Berlaku s/d ' + tgl(d) };
}
function expBadge(d, prefix) {
  const x = expInfo(d);
  const cls = x.lvl === 'exp' ? 'b-red' : x.lvl === 'warn' ? 'b-amber' : x.lvl === 'ok' ? 'b-green' : 'b-slate';
  return `<span class="badge ${cls}">${prefix ? esc(prefix) + ' · ' : ''}${esc(x.lvl === 'ok' ? tgl(d) : x.text)}</span>`;
}
function vehicleAlerts(k) { return [['KIR', k.MasaKIR], ['Pajak', k.MasaPajak]].map(([l, d]) => Object.assign({ jenis: l, tgl: d }, expInfo(d))).filter(x => x.lvl === 'exp' || x.lvl === 'warn'); }
function driverAlert(d) { const x = expInfo(d.MasaSIM); return (x.lvl === 'exp' || x.lvl === 'warn') ? Object.assign({ jenis: 'SIM', tgl: d.MasaSIM }, x) : null; }
function dueInvoices() { const t = today(); return S.d.invoices.filter(i => i.Status === 'Belum Lunas' && i.JatuhTempo && i.JatuhTempo <= t); }
function legalAlerts() {
  const out = [];
  S.d.kendaraan.forEach(k => vehicleAlerts(k).forEach(a => out.push(Object.assign({ tipe: 'kendaraan', id: k.ID, nama: k.NoPol, sub: k.JenisKendaraan }, a))));
  S.d.pengemudi.forEach(d => { const a = driverAlert(d); if (a) out.push(Object.assign({ tipe: 'pengemudi', id: d.ID, nama: d.Nama, sub: 'SIM ' + (d.JenisSIM || '') }, a)); });
  return out.sort((a, b) => a.days - b.days);
}
function updateBadges() {
  const due = dueInvoices().length;
  const drafts = S.d.orders.filter(o => o.StatusDok === 'Draf').length;
  const armada = S.d.kendaraan.filter(k => vehicleAlerts(k).length).length;
  const driver = S.d.pengemudi.filter(d => driverAlert(d)).length;
  // Lencana di sidebar cukup angka (keterangan lengkap muncul saat kursor diarahkan) agar nama menu tidak terpotong
  const set = (id, n, txt) => { const el = $(id); if (!el) return; el.hidden = !n; const sb = !!el.closest('.sb-sec-b'); el.textContent = sb ? n : (txt || n); el.title = txt || ''; };
  set('#badgeInvoice', due, due + ' jatuh tempo');
  set('#bnBadge', due);
  set('#badgeDraf', drafts, drafts + ' draf');
  set('#badgeArmada', armada);
  set('#badgeDriver', driver);
  const pty = S.d.pertanyaan.filter(q => q.Status === 'Baru').length;
  set('#badgePty', pty, pty + ' baru');
  const crmDue = (S.d.crmLeads || []).filter(l => ['Lead Baru', 'Dihubungi', 'Berminat', 'Penawaran Dikirim', 'Negosiasi'].includes(l.Tahap) && l.NextFollowup && l.NextFollowup <= today() && (!isSales() || l.PICEmail === (S.me || {}).email)).length;
  set('#badgeCrm', crmDue, crmDue + ' follow-up');
  const klhBuka = (S.d.keluhan || []).filter(k => ['Baru', 'Diproses', 'Menunggu Pelanggan'].includes(k.Status));
  const klhLewat = klhBuka.filter(k => k.BatasWaktu && String(k.BatasWaktu) < new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')).length;
  set('#badgeKlh', klhBuka.length, klhLewat ? klhLewat + ' lewat SLA' : klhBuka.length + ' terbuka');
  const srt = (S.d.surat || []).filter(x => isSA() ? x.Status === 'Menunggu Persetujuan' : x.Status === 'Ditolak' && x.DibuatOleh === (S.me || {}).email).length;
  set('#badgeSurat', srt, isSA() ? srt + ' menunggu persetujuan' : srt + ' ditolak');
  const tgt = typeof targetTertinggal === 'function' ? targetTertinggal() : 0;
  set('#badgeTarget', tgt, isSales() ? 'Target tertinggal' : tgt + ' sales tertinggal target');
  sbSecDots();
  $('#bellDot').hidden = !(due || armada || driver);
}
function renderNotif() {
  const inv = dueInvoices().sort((a, b) => a.JatuhTempo.localeCompare(b.JatuhTempo));
  const legal = legalAlerts();
  const items = inv.map(i => {
    const n = diffHari(today(), i.JatuhTempo);
    return `<div class="notif-item" data-go="invoice"><span class="notif-ic ic-red"><i class="bi bi-receipt"></i></span><div><b>${esc(i.NoInvoice)} · ${esc(i.NamaPelanggan)}</b><small>${n > 0 ? 'Lewat ' + n + ' hari' : 'Jatuh tempo hari ini'} · ${rp(i.Tagihan)}</small></div></div>`;
  }).concat(legal.map(a => `<div class="notif-item" data-go="${a.tipe}"><span class="notif-ic ${a.lvl === 'exp' ? 'ic-red' : 'ic-amber'}"><i class="bi ${a.tipe === 'kendaraan' ? 'bi-car-front' : 'bi-person-badge'}"></i></span><div><b>${esc(a.jenis)} ${esc(a.nama)}</b><small>${esc(a.text)} · ${tgl(a.tgl)}</small></div></div>`));
  $('#notifMenu').innerHTML = `<div class="notif-h"><b>Notifikasi</b><span class="badge b-slate plain">${items.length}</span></div>` +
    (items.length ? items.join('') : '<div class="empty"><div class="em-ic"><i class="bi bi-bell-slash"></i></div><b>Semua aman</b>Tidak ada tagihan jatuh tempo atau dokumen yang hampir habis.</div>');
}

// ── Pencarian global (lokal, instan) ───────────────────────
function bindSearch() {
  const input = $('#globalSearch'), pop = $('#searchPop');
  let items = [], active = 0;
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) { pop.hidden = true; return; }
    const hit = (...v) => v.join(' ').toLowerCase().includes(q);
    const ord = S.d.orders.filter(o => hit(o.NoSJ, o.NoUnik, o.NamaPelanggan, o.NoPol, o.NoPolMobil, o.PenerimaNama, o.PengemudiNama, o.UnitNoPol, o.PengirimNama)).slice(0, 6)
      .map(o => ({ g: 'Order', ic: o.Layanan === 'sewa' ? 'bi-truck-front' : 'bi-truck', t: orderLabel(o), s: `${o.NamaPelanggan || '—'} · ${o.Layanan === 'sewa' ? (o.NoPol || '') : (o.NoPolMobil || '')}`, fn: () => openOrderDrawer(o.ID) }));
    const pel = S.d.pelanggan.filter(p => hit(p.Nama, p.IDSewa, p.IDKirim, p.NoHP)).slice(0, 3).map(p => ({ g: 'Pelanggan', ic: 'bi-buildings', t: p.Nama, s: p.IDSewa + ' · ' + p.IDKirim, fn: () => { S.ui.master.pelanggan = { q: p.Nama, page: 1 }; navigateTo('pelanggan'); } }));
    const kend = S.d.kendaraan.filter(k => hit(k.NoPol, k.Merk, k.Tipe, k.NoKa)).slice(0, 3).map(k => ({ g: 'Kendaraan', ic: 'bi-car-front', t: k.NoPol, s: k.JenisKendaraan + ' · ' + (k.Merk || ''), fn: () => { S.ui.master.kendaraan = { q: k.NoPol, page: 1 }; navigateTo('kendaraan'); } }));
    const drv = S.d.pengemudi.filter(d => hit(d.Nama, d.Kode, d.NoHP)).slice(0, 3).map(d => ({ g: 'Pengemudi', ic: 'bi-person-badge', t: d.Nama, s: d.Kode, fn: () => { S.ui.master.pengemudi = { q: d.Nama, page: 1 }; navigateTo('pengemudi'); } }));
    const inv = S.d.invoices.filter(i => hit(i.NoInvoice, i.NamaPelanggan)).slice(0, 3).map(i => ({ g: 'Invoice', ic: 'bi-receipt', t: i.NoInvoice, s: i.NamaPelanggan + ' · ' + rp(i.Tagihan), fn: () => { S.ui.inv = Object.assign(S.ui.inv, { q: i.NoInvoice, f: 'semua', sel: i.ID }); navigateTo('invoice'); } }));
    items = ord.concat(pel, kend, drv, inv); active = 0;
    if (!items.length) { pop.innerHTML = '<div class="combo-empty">Tidak ada hasil untuk "' + esc(q) + '"</div>'; pop.hidden = false; return; }
    let g = '';
    pop.innerHTML = items.map((it, i) => {
      const head = it.g !== g ? `<div class="sp-head">${esc(it.g)}</div>` : ''; g = it.g;
      return head + `<div class="sp-item${i === 0 ? ' active' : ''}" data-i="${i}"><span class="kpi-ic ic-primary" style="width:32px;height:32px;font-size:14px"><i class="bi ${it.ic}"></i></span><div class="sp-t"><b>${esc(it.t)}</b><small>${esc(it.s)}</small></div></div>`;
    }).join('');
    pop.hidden = false;
  };
  input.addEventListener('input', debounce(run, 90));
  input.addEventListener('focus', run);
  input.addEventListener('keydown', e => {
    if (pop.hidden || !items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      $$('.sp-item', pop).forEach(el => el.classList.toggle('active', Number(el.dataset.i) === active));
    }
    if (e.key === 'Enter') { e.preventDefault(); pick(active); }
  });
  pop.addEventListener('mousedown', e => { const it = e.target.closest('.sp-item'); if (it) { e.preventDefault(); pick(Number(it.dataset.i)); } });
  function pick(i) { const it = items[i]; if (!it) return; pop.hidden = true; input.value = ''; input.blur(); it.fn(); }
}

// ============================================================
// HELPER ORDER
// ============================================================
function orderLabel(o) { return o.NoSJ || 'Draf ' + (o.NoUnik || ''); }
function orderDate(o) { return o.Tanggal || o.DibuatPada || ''; }
function statusBadge(s) { return `<span class="badge ${STATUS_CLS[s] || 'b-slate'}">${esc(s || '—')}</span>`; }
const LAY_LABEL = { sewa: 'Sewa', kirim: 'Kirim', paket: 'Paket' };
function docLabel(o) { return o && o.Layanan === 'paket' ? 'No. resi' : 'No. surat jalan'; }
function svcChip(o) {
  if (o.Layanan === 'paket') return `<span class="svc svc-paket">Paket ${esc(o.Jalur || 'Darat')} · ${fnumDec(o.TotalKoli || 0)} koli</span>`;
  return o.Layanan === 'sewa' ? `<span class="svc svc-sewa">Sewa ${esc(o.JenisKendaraan || '')}</span>` : `<span class="svc svc-kirim">Kirim (${esc(o.JenisLayanan || '—')})</span>`;
}
// Paket: daftar barang (JSON) & format desimal Indonesia
// Pihak yang ditagih invoice: pelanggan, atau penerima (paket yang ongkosnya ditanggung penerima)
function pihakTagihan(id) { return byId('pelanggan', id) || byId('penerima', id); }
function barangOf(o) { try { const a = JSON.parse(o.Barang || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function fnumDec(v, d) { const n = Number(v) || 0; return n.toLocaleString('id-ID', { maximumFractionDigits: d === undefined ? 2 : d }); }
function paketRingkas(o) { return `${fnumDec(o.TotalKoli || 0)} koli · ${fnumDec(o.TotalBerat || 0)} kg · ${fnumDec(o.TotalVolume || 0, 4)} m³`; }
function firstPart(s) { return String(s || '').split(/[,\n]/)[0].trim(); }
function orderRoute(o) {
  if (o.Layanan === 'sewa') return [firstPart(o.MuatAlamat), firstPart(o.BongkarAlamat)];
  if (o.Layanan === 'paket') return [firstPart(o.PengirimAlamat), o.KotaTujuan || firstPart(o.PenerimaAlamat)];
  const pel = byId('pelanggan', o.PelangganID);
  return [firstPart(o.AsalAlamat || (pel && pel.Alamat)), firstPart(o.PenerimaAlamat)];
}
function routeText(o) { const [a, b] = orderRoute(o); return a || b ? esc(a || '—') + ' → ' + esc(b || '—') : '—'; }
function routeHTML(o) { const [a, b] = orderRoute(o); return a || b ? `<span class="route"><b>${esc(a || '—')}</b><i class="bi bi-arrow-right"></i><b>${esc(b || '—')}</b></span>` : '<span class="muted">—</span>'; }
function armadaHTML(o) {
  if (o.Layanan === 'paket') { const b = barangOf(o); return `<span class="t-strong">${esc(b.map(x => x.d).filter(Boolean).slice(0, 2).join(', ') || '—')}${b.length > 2 ? ' +' + (b.length - 2) : ''}</span><span class="t-sub">${esc(paketRingkas(o))}${o.EkspedisiNama ? ' · via ' + esc(o.EkspedisiNama) : ''}</span>`; }
  if (o.Layanan === 'sewa') return `<span class="t-strong mono">${esc(o.NoPol || '—')}</span><span class="t-sub">${esc(o.JenisMuatan || '')}</span>`;
  return `<span class="t-strong">${esc([o.Merk, o.Tipe].filter(Boolean).join(' ') || '—')}</span><span class="t-sub mono">${esc(o.NoPolMobil || '')}${o.Warna ? ' · ' + esc(o.Warna) : ''}</span>`;
}
function driverHTML(o) {
  const unit = o.Layanan === 'sewa' ? '' : (o.UnitNoPol || '');
  return `<span class="t-strong">${esc(o.PengemudiNama || '—')}</span>${unit ? `<span class="t-sub mono">${esc(unit)}</span>` : ''}`;
}
function docBadge(o) {
  if (o.StatusDok !== 'Terkonfirmasi') return '<span class="badge b-slate">Draf</span>';
  return String(o.Dicetak) === 'true' ? '<span class="badge b-green plain"><i class="bi bi-printer"></i> Dicetak</span>' : '<span class="badge b-indigo plain"><i class="bi bi-check2"></i> Terkonfirmasi</span>';
}
function invoiceOf(o) { return S.d.invoices.find(i => i.OrderID === o.ID) || null; }
function sortOrders(list) { return list.slice().sort((a, b) => String(orderDate(b)).localeCompare(String(orderDate(a)))); }
function emptyHTML(icon, title, text, btn) {
  return `<div class="empty"><div class="em-ic"><i class="bi ${icon}"></i></div><b>${esc(title)}</b>${esc(text || '')}${btn || ''}</div>`;
}
function pagerHTML(total, page, size, act) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return '';
  const btn = (p, label, dis, active) => `<button data-${act}="${p}" ${dis ? 'disabled' : ''} class="${active ? 'active' : ''}">${label}</button>`;
  const out = [btn(page - 1, '<i class="bi bi-chevron-left"></i>', page <= 1)];
  const show = new Set([1, pages, page - 1, page, page + 1].filter(p => p >= 1 && p <= pages));
  let last = 0;
  Array.from(show).sort((a, b) => a - b).forEach(p => { if (p - last > 1) out.push('<span class="muted">…</span>'); out.push(btn(p, p, false, p === page)); last = p; });
  out.push(btn(page + 1, '<i class="bi bi-chevron-right"></i>', page >= pages));
  return `<div class="pager">${out.join('')}</div>`;
}

// ============================================================
// RINGKASAN
// ============================================================
function renderRingkasan() {
  const el = $('#page-ringkasan');
  const t = today(), mk = monthKey(t);
  const prevMk = monthKey(addDays(mk + '-01', -1));
  const conf = S.d.orders.filter(o => o.StatusDok === 'Terkonfirmasi');
  const bulanIni = conf.filter(o => monthKey(o.Tanggal) === mk);
  const bulanLalu = conf.filter(o => monthKey(o.Tanggal) === prevMk);
  const growth = bulanLalu.length ? Math.round((bulanIni.length - bulanLalu.length) / bulanLalu.length * 100) : null;
  const jalan = conf.filter(o => o.Status === 'Dijadwalkan' || o.Status === 'Dikirim');
  const due = dueInvoices();
  const telat = due.filter(i => i.JatuhTempo < t);
  const legal = legalAlerts();
  const hour = Number(nowJkt().slice(11, 13));
  const salam = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';

  let finKpi = '', chartCard = '', insight = '';
  if (isSA()) {
    const fin = S.d.finance.filter(f => f.Status !== 'Batal');
    const sum = (jenis, m) => fin.filter(f => f.Jenis === jenis && monthKey(f.Tanggal) === m).reduce((a, f) => a + num(f.Nominal), 0);
    const masuk = sum('Pemasukan', mk), keluar = sum('Pengeluaran', mk), masukLalu = sum('Pemasukan', prevMk);
    const piutang = S.d.invoices.filter(i => i.Status === 'Belum Lunas').reduce((a, i) => a + num(i.Tagihan), 0) +
      fin.filter(f => f.Jenis === 'Piutang' && f.Status === 'Belum Lunas').reduce((a, f) => a + num(f.Nominal), 0);
    const laba = masuk - keluar, margin = masuk ? Math.round(laba / masuk * 100) : 0;
    finKpi = `<div class="kpis">
      ${kpi('Pendapatan bulan ini', rp(masuk), 'bi-graph-up-arrow', 'ic-green', masukLalu ? `${masuk >= masukLalu ? '▲' : '▼'} ${Math.abs(Math.round((masuk - masukLalu) / masukLalu * 100))}% dari bulan lalu` : 'Belum ada pembanding', 'money')}
      ${kpi('Pengeluaran bulan ini', rp(keluar), 'bi-fuel-pump', 'ic-red', masuk ? Math.round(keluar / masuk * 100) + '% dari pendapatan' : '—', 'money')}
      ${kpi('Laba kasar', rp(laba), 'bi-wallet2', 'ic-primary', 'Margin ' + margin + '% · sebelum pajak & depresiasi', 'money', laba >= 0 ? 'ok' : 'danger')}
      ${kpi('Piutang berjalan', rp(piutang), 'bi-hourglass-split', 'ic-amber', S.d.invoices.filter(i => i.Status === 'Belum Lunas').length + ' invoice belum lunas', 'money')}
    </div>`;
    chartCard = `<div class="card mt"><div class="card-title-row"><div><h3>Pendapatan vs pengeluaran</h3><p class="muted">6 bulan terakhir</p></div><button class="btn btn-secondary btn-sm" data-go="finance"><i class="bi bi-wallet2"></i> Buka Finance</button></div><div class="chart-box"><canvas id="chDash"></canvas></div></div>`;
    const sewaIn = fin.filter(f => f.Jenis === 'Pemasukan' && f.Layanan === 'Sewa' && monthKey(f.Tanggal) === mk).reduce((a, f) => a + num(f.Nominal), 0);
    const tips = [];
    if (masuk) tips.push(`Layanan sewa menyumbang ${Math.round(sewaIn / masuk * 100)}% pendapatan bulan ini, pengiriman ${100 - Math.round(sewaIn / masuk * 100)}%.`);
    if (telat.length) tips.push(`${telat.length} invoice lewat jatuh tempo senilai ${rp(telat.reduce((a, i) => a + num(i.Tagihan), 0))}. Prioritaskan penagihan.`);
    const topPel = Object.entries(bulanIni.reduce((m, o) => { m[o.NamaPelanggan] = (m[o.NamaPelanggan] || 0) + num(o.Total); return m; }, {})).sort((a, b) => b[1] - a[1])[0];
    if (topPel) tips.push(`Pelanggan terbesar bulan ini: ${topPel[0]} (${rp(topPel[1])}).`);
    if (legal.length) tips.push(`${legal.length} dokumen (SIM/KIR/pajak) perlu diperpanjang dalam ${S.settings.peringatanHari || 30} hari.`);
    if (!tips.length) tips.push('Belum ada cukup data bulan ini untuk dianalisis.');
    insight = `<div class="card insight mt"><h3><i class="bi bi-stars"></i> Insight otomatis</h3><ul>${tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  }

  const recent = sortOrders(conf).slice(0, 6);
  const dueList = due.concat(S.d.invoices.filter(i => i.Status === 'Belum Lunas' && i.JatuhTempo > t && diffHari(i.JatuhTempo, t) <= 3))
    .sort((a, b) => a.JatuhTempo.localeCompare(b.JatuhTempo)).slice(0, 4);

  el.innerHTML = `
  <div class="hero">
    <div class="grow">
      <h1>${salam}, ${esc((S.me.nama || '').split(' ')[0])} <span class="chip chip-soft role-chip">${isSA() ? 'SUPER ADMIN' : 'ADMIN'}</span></h1>
      <p>Pantau surat jalan berjalan, tagihan jatuh tempo, dan kesiapan armada hari ini.</p>
    </div>
    <div class="hero-actions">
      <button class="btn btn-secondary" data-go="paket" data-fresh="1"><i class="bi bi-box-seam"></i> Kirim paket</button>
      <button class="btn btn-secondary" data-go="kirim" data-fresh="1"><i class="bi bi-truck"></i> Kirim mobil</button>
      <button class="btn btn-primary" data-go="sewa" data-fresh="1"><i class="bi bi-plus-lg"></i> Surat jalan sewa</button>
    </div>
  </div>
  <div class="kpis">
    ${kpi('Order bulan ini', bulanIni.length + '<small>order</small>', 'bi-journal-text', 'ic-indigo', growth === null ? BLN_PANJANG[Number(mk.slice(5)) - 1] + ' ' + mk.slice(0, 4) : `<span class="badge ${growth >= 0 ? 'b-green' : 'b-red'} plain">${growth >= 0 ? '▲' : '▼'} ${Math.abs(growth)}%</span> dari bulan lalu`)}
    ${kpi('Order berjalan', jalan.length + '<small>surat jalan</small>', 'bi-truck', 'ic-primary', `<span>${jalan.filter(o => o.Layanan === 'sewa').length} sewa</span>·<span>${jalan.filter(o => o.Layanan === 'kirim').length} kirim</span>·<span>${jalan.filter(o => o.Layanan === 'paket').length} paket</span>`)}
    ${kpi('Invoice jatuh tempo', due.length + '<small>tagihan</small>', 'bi-receipt', 'ic-red', telat.length ? `<span class="badge b-red">${telat.length} lewat jatuh tempo</span>` : 'Tidak ada yang terlambat', '', due.length ? 'danger' : '')}
    ${kpi('Legalitas perlu tindakan', legal.length + '<small>dokumen</small>', 'bi-shield-exclamation', 'ic-amber', `SIM, KIR & pajak ≤ ${esc(S.settings.peringatanHari || 30)} hari`)}
  </div>
  ${finKpi}
  <div class="dash-grid">
    <div>
      <div class="table-card">
        <div class="card-title-row" style="padding:18px 20px 0"><div><h3>Rekap order terkini</h3><p class="muted">Surat jalan terkonfirmasi terbaru</p></div><button class="btn btn-secondary btn-sm" data-go="rekap">Lihat semua <i class="bi bi-arrow-right"></i></button></div>
        ${recent.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>No. surat jalan</th><th>Layanan</th><th>Pelanggan &amp; rute</th><th>Status</th></tr></thead><tbody>
          ${recent.map(o => `<tr class="clickable" data-order="${esc(o.ID)}"><td class="card-title" data-label="No. SJ"><span class="t-link">${esc(o.NoSJ)}</span><span class="t-sub">${tglPendek(o.Tanggal)}</span></td><td data-label="Layanan">${svcChip(o)}</td><td data-label="Pelanggan"><b class="t-clip">${esc(o.NamaPelanggan)}</b><span class="t-sub t-clip">${routeText(o)}</span></td><td data-label="Status">${statusBadge(o.Status)}</td></tr>`).join('')}
        </tbody></table></div>` : emptyHTML('bi-journal-plus', 'Belum ada order aktif', 'Mulai buat surat jalan sewa atau pengiriman pertama hari ini.', '<button class="btn btn-primary" data-go="sewa" data-fresh="1"><i class="bi bi-plus-lg"></i> Buat surat jalan</button>')}
      </div>
      ${chartCard}${insight}
    </div>
    <div class="stack">
      <div class="card list-card">
        <div class="card-title-row"><div><h3><i class="bi bi-bell" style="color:var(--red)"></i> Peringatan jatuh tempo</h3><p class="muted">Ingatkan pelanggan lewat WhatsApp atau email.</p></div>${due.length ? `<span class="badge b-red plain">${due.length}</span>` : ''}</div>
        ${dueList.length ? dueList.map(i => invoiceMini(i)).join('') : emptyHTML('bi-check2-circle', 'Tidak ada tagihan mendesak', 'Semua invoice termin masih dalam tenggat.')}
        <button class="btn btn-soft btn-block mt" data-go="invoice">Lihat semua tagihan <i class="bi bi-arrow-right"></i></button>
      </div>
      <div class="card list-card">
        <div class="card-title-row"><div><h3><i class="bi bi-shield-check" style="color:var(--amber)"></i> Masa berlaku legalitas</h3><p class="muted">SIM, uji KIR, dan pajak kendaraan.</p></div>${legal.length ? `<span class="badge b-amber plain">${legal.length}</span>` : ''}</div>
        ${legal.length ? legal.slice(0, 5).map(a => `<div class="li"><span class="kpi-ic ${a.lvl === 'exp' ? 'ic-red' : 'ic-amber'}" style="width:36px;height:36px;font-size:16px"><i class="bi ${a.tipe === 'kendaraan' ? 'bi-car-front' : 'bi-person-badge'}"></i></span><div class="grow"><b>${esc(a.nama)}</b><small>${esc(a.jenis)} · ${esc(a.sub || '')}</small></div><span class="badge ${a.lvl === 'exp' ? 'b-red' : 'b-amber'} plain">${esc(a.text)}</span></div>`).join('') : emptyHTML('bi-patch-check', 'Semua dokumen berlaku', 'Tidak ada SIM, KIR, atau pajak yang hampir habis.')}
        <p class="muted mt" style="font-size:12px"><i class="bi bi-info-circle"></i> Peringatan bersifat informatif dan tidak memblokir pembuatan surat jalan.</p>
      </div>
    </div>
  </div>`;
  el.querySelectorAll('[data-order]').forEach(tr => tr.onclick = () => openOrderDrawer(tr.dataset.order));
  bindInvoiceMini(el);
  if (isSA()) drawDashChart();
}
function kpi(label, val, icon, icCls, foot, valCls, cardCls) {
  return `<div class="kpi ${cardCls || ''}"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-ic ${icCls}"><i class="bi ${icon}"></i></span></div><div class="kpi-val ${valCls || ''}">${val}</div><div class="kpi-foot">${foot || ''}</div></div>`;
}
function invoiceMini(i) {
  const n = diffHari(today(), i.JatuhTempo);
  const tag = n > 0 ? `<span class="badge b-red plain">Lewat ${n} hari</span>` : n === 0 ? '<span class="badge b-amber plain">Jatuh tempo hari ini</span>' : `<span class="badge b-indigo plain">${-n} hari lagi</span>`;
  return `<div class="li" style="display:block"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b>${esc(i.NamaPelanggan)}</b>${tag}</div>
    <div style="display:flex;justify-content:space-between;gap:8px"><small class="mono">${esc(i.NoInvoice)}</small><b class="mono" style="font-size:13px">${rp(i.Tagihan)}</b></div>
    <div class="li-actions"><button class="btn btn-wa btn-sm" data-wa="${esc(i.ID)}"><i class="bi bi-whatsapp"></i> Kirim WA</button><button class="btn btn-secondary btn-sm" data-mail="${esc(i.ID)}"><i class="bi bi-envelope"></i> Email</button></div></div>`;
}
function bindInvoiceMini(root) {
  root.querySelectorAll('[data-wa]').forEach(b => b.onclick = e => { e.stopPropagation(); openWhatsApp(b.dataset.wa); });
  root.querySelectorAll('[data-mail]').forEach(b => b.onclick = e => { e.stopPropagation(); sendEmailReminder(b.dataset.mail, b); });
}
function chartColors() {
  const cs = getComputedStyle(document.documentElement);
  return { primary: cs.getPropertyValue('--primary').trim() || '#006C49', red: '#DC2626', indigo: '#4F46E5', amber: '#F59E0B', grid: isDark() ? 'rgba(148,163,184,.15)' : 'rgba(15,23,42,.06)', text: isDark() ? '#94A3B8' : '#64748B' };
}
function drawChart(id, cfg) {
  return loadScript(CDN.chart).then(() => {
    const cv = document.getElementById(id); if (!cv || !window.Chart) return;
    if (S.charts[id]) S.charts[id].destroy();
    const c = chartColors();
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif'; Chart.defaults.color = c.text;
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: { callbacks: { label: ctx => ' ' + ctx.dataset.label + ': ' + (cfg.money === false ? fnum(ctx.parsed.y) : rp(ctx.parsed.y)) } } },
      scales: { x: { grid: { display: false } }, y: { grid: { color: c.grid }, ticks: { callback: v => cfg.money === false ? fnum(v) : (Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString('id-ID') + ' jt' : fnum(v)) } } } }, cfg.options || {});
    S.charts[id] = new Chart(cv, cfg);
  }).catch(() => { const cv = document.getElementById(id); if (cv) cv.parentNode.innerHTML = '<p class="muted">Grafik tidak dapat dimuat (periksa koneksi internet).</p>'; });
}
function lastMonths(n) { const out = []; let k = monthKey(today()); for (let i = 0; i < n; i++) { out.unshift(k); k = monthKey(addDays(k + '-01', -1)); } return out; }
function drawDashChart() {
  const months = lastMonths(6), fin = S.d.finance.filter(f => f.Status !== 'Batal'), c = chartColors();
  const s = j => months.map(m => fin.filter(f => f.Jenis === j && monthKey(f.Tanggal) === m).reduce((a, f) => a + num(f.Nominal), 0));
  drawChart('chDash', { type: 'bar', data: { labels: months.map(monthLabel), datasets: [
    { label: 'Pendapatan', data: s('Pemasukan'), backgroundColor: c.primary, borderRadius: 6, maxBarThickness: 28 },
    { label: 'Pengeluaran', data: s('Pengeluaran'), backgroundColor: c.red, borderRadius: 6, maxBarThickness: 28 }] } });
}

// ============================================================
// REKAP ORDER
// ============================================================
const REKAP_COLS = [
  { k: 'nosj', l: 'No. SJ / resi', fixed: true }, { k: 'tgl', l: 'Tanggal' }, { k: 'layanan', l: 'Layanan' }, { k: 'pelanggan', l: 'Pelanggan' },
  { k: 'armada', l: 'Armada / muatan' }, { k: 'rute', l: 'Rute' }, { k: 'driver', l: 'Pengemudi / unit' }, { k: 'total', l: 'Total' },
  { k: 'status', l: 'Status', fixed: true }, { k: 'dok', l: 'Dokumen' }
];
function rekapCols() {
  let hidden = ['tgl', 'total', 'dok', 'armada'];
  try { const v = lsGet(LS.cols, ''); if (v) hidden = JSON.parse(v); } catch (e) { /* default */ }
  return REKAP_COLS.filter(c => c.fixed || hidden.indexOf(c.k) === -1);
}
function filterOrders() {
  const f = S.ui.rekap, q = f.q.trim().toLowerCase();
  return S.d.orders.filter(o => {
    const d = String(orderDate(o)).slice(0, 10);
    if (f.from && d < f.from) return false;
    if (f.to && d > f.to) return false;
    if (f.svc && o.Layanan !== f.svc) return false;
    if (f.status && o.Status !== f.status) return false;
    if (f.dok === 'draf' && o.StatusDok !== 'Draf') return false;
    if (f.dok === 'konfirm' && o.StatusDok !== 'Terkonfirmasi') return false;
    if (f.dok === 'cetak' && String(o.Dicetak) !== 'true') return false;
    if (f.dok === 'belumcetak' && (o.StatusDok !== 'Terkonfirmasi' || String(o.Dicetak) === 'true')) return false;
    if (f.driver && o.PengemudiID !== f.driver && o.KendaraanID !== f.driver && o.UnitID !== f.driver) return false;
    if (q && ![o.NoSJ, o.NoUnik, o.NamaPelanggan, o.NoPol, o.NoPolMobil, o.PenerimaNama, o.PengemudiNama, o.MuatPIC, o.BongkarPIC, o.MuatAlamat, o.BongkarAlamat, o.Merk, o.Tipe, o.PengirimNama, o.PenerimaAlamat, o.PengirimAlamat, o.Barang]
      .join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}
function renderRekap() {
  const el = $('#page-rekap'), f = S.ui.rekap;
  const all = S.d.orders, conf = all.filter(o => o.StatusDok === 'Terkonfirmasi');
  const aktif = conf.filter(o => o.Status === 'Dijadwalkan' || o.Status === 'Dikirim').length;
  const drafts = all.filter(o => o.StatusDok === 'Draf').length;
  const drvOpts = S.d.pengemudi.map(d => `<option value="${esc(d.ID)}" ${f.driver === d.ID ? 'selected' : ''}>${esc(d.Nama)}</option>`).join('') +
    S.d.kendaraan.map(k => `<option value="${esc(k.ID)}" ${f.driver === k.ID ? 'selected' : ''}>${esc(k.NoPol)} (unit)</option>`).join('');
  el.innerHTML = `
  <div class="page-head">
    <div class="ph-icon"><i class="bi bi-journal-text"></i></div>
    <div><h1>Rekap Order &amp; Dokumen Perjalanan</h1><p class="muted">Semua transaksi sewa dan pengiriman. Klik baris untuk detail, cetak ulang, atau ubah status.</p></div>
    <div class="mini-stats"><div><span>Terkonfirmasi</span><b>${conf.length}</b></div><div><span>Sewa</span><b>${conf.filter(o => o.Layanan === 'sewa').length}</b></div><div><span>Kirim</span><b>${conf.filter(o => o.Layanan === 'kirim').length}</b></div><div><span>Paket</span><b>${conf.filter(o => o.Layanan === 'paket').length}</b></div><div class="warn"><span>Belum selesai</span><b>${aktif}</b></div></div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="toolbar" style="margin-bottom:0">
      <div class="search grow"><i class="bi bi-search"></i><input class="input" id="rkQ" placeholder="Cari no. surat jalan / resi, nopol, pelanggan, PIC…" value="${esc(f.q)}"></div>
      <div class="dd-wrap pos-rel"><button class="btn btn-secondary" id="rkCols"><i class="bi bi-layout-three-columns"></i> Atur kolom</button><div class="menu dd-menu col-menu" id="rkColMenu" hidden></div></div>
      ${drafts ? `<button class="btn btn-secondary" id="rkDrafts"><i class="bi bi-pencil"></i> Draf (${drafts})</button>` : ''}
      <button class="btn btn-primary" id="rkNew"><i class="bi bi-plus-lg"></i> Order baru</button>
    </div>
    <div class="filters">
      <label class="field"><span class="label">Dari tanggal</span><input class="input" type="date" id="rkFrom" value="${esc(f.from)}"></label>
      <label class="field"><span class="label">Sampai tanggal</span><input class="input" type="date" id="rkTo" value="${esc(f.to)}"></label>
      <label class="field"><span class="label">Jenis layanan</span><select class="input" id="rkSvc"><option value="">Semua layanan</option><option value="sewa" ${f.svc === 'sewa' ? 'selected' : ''}>Sewa kendaraan</option><option value="kirim" ${f.svc === 'kirim' ? 'selected' : ''}>Kirim mobil</option><option value="paket" ${f.svc === 'paket' ? 'selected' : ''}>Kirim paket</option></select></label>
      <label class="field"><span class="label">Status pengiriman</span><select class="input" id="rkStatus"><option value="">Semua status</option>${STATUS.map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Dokumen</span><select class="input" id="rkDok"><option value="">Semua</option><option value="draf" ${f.dok === 'draf' ? 'selected' : ''}>Draf</option><option value="konfirm" ${f.dok === 'konfirm' ? 'selected' : ''}>Terkonfirmasi</option><option value="belumcetak" ${f.dok === 'belumcetak' ? 'selected' : ''}>Belum dicetak</option><option value="cetak" ${f.dok === 'cetak' ? 'selected' : ''}>Sudah dicetak</option></select></label>
      <label class="field"><span class="label">Pengemudi / unit</span><select class="input" id="rkDrv"><option value="">Semua pengemudi &amp; unit</option>${drvOpts}</select></label>
      <div class="field" style="justify-content:flex-end"><button class="btn btn-ghost" id="rkReset"><i class="bi bi-x-circle"></i> Reset filter</button></div>
    </div>
  </div>
  <div class="table-card" id="rkTable"></div>`;
  const rerender = () => { f.page = 1; renderRekapTable(); };
  $('#rkQ').addEventListener('input', debounce(e => { f.q = e.target.value; rerender(); }, 150));
  [['#rkFrom', 'from'], ['#rkTo', 'to'], ['#rkSvc', 'svc'], ['#rkStatus', 'status'], ['#rkDok', 'dok'], ['#rkDrv', 'driver']].forEach(([s, k]) => $(s).onchange = e => { f[k] = e.target.value; rerender(); });
  $('#rkReset').onclick = () => { Object.assign(f, { q: '', from: '', to: '', svc: '', status: '', dok: '', driver: '', page: 1 }); renderRekap(); };
  $('#rkNew').onclick = chooseNewOrder;
  if ($('#rkDrafts')) $('#rkDrafts').onclick = () => { f.dok = 'draf'; renderRekap(); };
  $('#rkCols').onclick = e => {
    e.stopPropagation();
    const menu = $('#rkColMenu'), vis = rekapCols().map(c => c.k);
    menu.innerHTML = '<b style="font-size:12px;color:var(--muted)">Tampilkan kolom</b>' + REKAP_COLS.map(c => `<label class="check"><input type="checkbox" value="${c.k}" ${vis.includes(c.k) ? 'checked' : ''} ${c.fixed ? 'disabled' : ''}> ${esc(c.l)}</label>`).join('');
    menu.hidden = !menu.hidden;
    menu.onchange = () => { const hidden = $$('input', menu).filter(i => !i.checked).map(i => i.value); lsSet(LS.cols, JSON.stringify(hidden)); renderRekapTable(); };
  };
  renderRekapTable();
}
function renderRekapTable() {
  const f = S.ui.rekap, cols = rekapCols(), size = 25;
  const sorters = { tgl: o => String(orderDate(o)), nosj: o => o.NoSJ || '~' + o.NoUnik, pelanggan: o => (o.NamaPelanggan || '').toLowerCase(), total: o => num(o.Total), status: o => o.Status };
  let list = filterOrders();
  const sk = sorters[f.sort.k] || sorters.tgl;
  list.sort((a, b) => { const x = sk(a), y = sk(b); return (x > y ? 1 : x < y ? -1 : 0) * f.sort.dir; });
  const pages = Math.max(1, Math.ceil(list.length / size)); if (f.page > pages) f.page = pages;
  const rows = list.slice((f.page - 1) * size, f.page * size);
  const th = c => {
    const sortable = sorters[c.k];
    return `<th class="${sortable ? 'sortable' : ''} ${f.sort.k === c.k ? 'sorted' : ''} ${c.k === 'nosj' ? 'sticky-col' : ''} ${c.k === 'total' ? 't-num' : ''}" ${sortable ? `data-sort="${c.k}"` : ''}>${esc(c.l)}${sortable ? `<i class="bi ${f.sort.k === c.k ? (f.sort.dir > 0 ? 'bi-sort-up' : 'bi-sort-down') : 'bi-arrow-down-up'} si"></i>` : ''}</th>`;
  };
  const cell = (c, o) => {
    switch (c.k) {
      case 'nosj': return `<td class="sticky-col card-title" data-label="No. SJ"><span class="t-link">${esc(orderLabel(o))}</span>${String(o.Dicetak) === 'true' ? ' <i class="bi bi-printer" title="Sudah dicetak" style="color:var(--primary)"></i>' : ''}<span class="t-sub">${tglPendek(orderDate(o))}</span></td>`;
      case 'tgl': return `<td data-label="Tanggal" class="mono">${tglPendek(orderDate(o))}</td>`;
      case 'layanan': return `<td data-label="Layanan">${svcChip(o)}</td>`;
      case 'pelanggan': return `<td data-label="Pelanggan" style="min-width:150px"><span class="t-strong">${esc(o.NamaPelanggan || '—')}</span>${o.Layanan !== 'sewa' && o.PenerimaNama ? `<span class="t-sub">ke ${esc(o.PenerimaNama)}</span>` : ''}</td>`;
      case 'armada': return `<td data-label="Armada">${armadaHTML(o)}</td>`;
      case 'rute': { const [a, b] = orderRoute(o); return `<td data-label="Rute" class="t-route"><span class="t-clip"><i class="bi bi-geo-alt" style="color:var(--primary)"></i> ${esc(a || '—')}</span><span class="t-clip t-sub"><i class="bi bi-flag" style="color:var(--red)"></i> ${esc(b || '—')}</span></td>`; }
      case 'driver': return `<td data-label="Pengemudi">${driverHTML(o)}</td>`;
      case 'total': return `<td data-label="Total" class="t-num">${o.Total ? rp(o.Total) : '—'}</td>`;
      case 'status': return `<td data-label="Status">${o.StatusDok === 'Terkonfirmasi' ? `<select class="status-select ${STATUS_CLS[o.Status]}" data-status="${esc(o.ID)}" aria-label="Ubah status">${STATUS.map(s => `<option ${o.Status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>` : statusBadge('Draf')}</td>`;
      case 'dok': return `<td data-label="Dokumen">${docBadge(o)}</td>`;
    }
    return '<td></td>';
  };
  const wrap = $('#rkTable');
  wrap.innerHTML = rows.length ? `<div class="table-wrap"><table class="table cards"><thead><tr>${cols.map(th).join('')}<th class="t-actions">Aksi</th></tr></thead><tbody>
    ${rows.map(o => `<tr class="clickable ${o.Status === 'Dibatalkan' ? 'row-muted' : ''}" data-id="${esc(o.ID)}">${cols.map(c => cell(c, o)).join('')}
      <td class="t-actions"><button class="icon-btn" data-view="${esc(o.ID)}" title="Lihat detail"><i class="bi bi-eye"></i></button>${o.StatusDok === 'Terkonfirmasi' ? `<button class="icon-btn" data-print="${esc(o.ID)}" title="Cetak surat jalan"><i class="bi bi-printer"></i></button>` : `<button class="icon-btn" data-edit="${esc(o.ID)}" title="Lanjutkan draf"><i class="bi bi-pencil"></i></button>`}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="table-foot"><span>Menampilkan ${(f.page - 1) * size + 1}–${(f.page - 1) * size + rows.length} dari ${list.length} order</span>${pagerHTML(list.length, f.page, size, 'pg')}</div>`
    : emptyHTML(S.d.orders.length ? 'bi-search' : 'bi-journal-plus', S.d.orders.length ? 'Pencarian tidak ditemukan' : 'Belum ada order', S.d.orders.length ? 'Tidak ada order yang cocok dengan filter. Periksa kembali kata kunci atau rentang tanggal.' : 'Mulai buat surat jalan sewa atau pengiriman pertama.',
      S.d.orders.length ? '<br><button class="btn btn-secondary" id="rkReset2"><i class="bi bi-x-circle"></i> Reset semua filter</button>' : '<br><button class="btn btn-primary" data-go="sewa" data-fresh="1"><i class="bi bi-plus-lg"></i> Buat surat jalan</button>');
  if ($('#rkReset2')) $('#rkReset2').onclick = () => $('#rkReset').click();
  wrap.onclick = e => {
    const s = e.target.closest('[data-sort]');
    if (s) { const k = s.dataset.sort; f.sort = { k, dir: f.sort.k === k ? -f.sort.dir : (k === 'tgl' || k === 'total' ? -1 : 1) }; renderRekapTable(); return; }
    const pg = e.target.closest('[data-pg]'); if (pg) { f.page = Number(pg.dataset.pg); renderRekapTable(); return; }
    if (e.target.closest('select')) return;
    const pr = e.target.closest('[data-print]'); if (pr) { e.stopPropagation(); printOrder(pr.dataset.print, 'tanpa'); return; }
    const ed = e.target.closest('[data-edit]'); if (ed) { e.stopPropagation(); const o = byId('orders', ed.dataset.edit); navigateTo(o.Layanan, { order: o }); return; }
    const tr = e.target.closest('tr[data-id]'); if (tr) openOrderDrawer(tr.dataset.id);
  };
  wrap.onchange = e => { const sel = e.target.closest('[data-status]'); if (sel) changeStatus(sel.dataset.status, sel.value, sel); };
}

/** Ubah status: optimistic (UI langsung berubah), dibatalkan bila server menolak. */
function changeStatus(id, status, selEl) {
  const o = byId('orders', id); if (!o || o.Status === status) return;
  const old = o.Status;
  const go = () => {
    o.Status = status;
    if (selEl) selEl.className = 'status-select ' + STATUS_CLS[status];
    updateBadges(); saveCache();
    api('updateOrderStatus', S.token, o.Layanan, id, status).then(r => {
      upsert('orders', r.data.order);
      if (r.data.invoice) upsert('invoices', r.data.invoice);
      (r.data.finance || []).forEach(f => upsert('finance', f));
      saveCache(); updateBadges();
      toast('success', 'Status diperbarui', orderLabel(o) + ' → ' + status);
      if (S.page === 'rekap') renderRekapTable(); else if (S.page !== 'sewa' && S.page !== 'kirim') renderPage(S.page);
    }).catch(err => {
      o.Status = old; if (selEl) { selEl.value = old; selEl.className = 'status-select ' + STATUS_CLS[old]; }
      fail(err, 'Status gagal diubah'); saveCache();
      if (S.page === 'rekap') renderRekapTable();
    });
  };
  if (status === 'Dibatalkan') {
    confirmDialog({ title: 'Batalkan order ' + orderLabel(o) + '?', text: 'Invoice yang belum lunas untuk order ini akan ikut dibatalkan.', variant: 'danger', icon: 'bi-x-octagon', ok: 'Ya, batalkan order' })
      .then(v => { if (v === true) go(); else if (selEl) selEl.value = old; });
  } else go();
}

function openOrderDrawer(id) {
  const o = byId('orders', id); if (!o) return;
  const inv = invoiceOf(o);
  const insp = o.InspeksiID ? byId('inspeksi', o.InspeksiID) : null;
  const rek = o.RekeningID ? byId('rekening', o.RekeningID) : null;
  const dl = rows => '<dl class="dl">' + rows.filter(r => r[1] !== undefined && r[1] !== null && r[1] !== '').map(r => `<dt>${esc(r[0])}</dt><dd>${r[2] ? r[1] : esc(r[1])}</dd>`).join('') + '</dl>';
  const conf = o.StatusDok === 'Terkonfirmasi';
  let body = `<div class="chips-row" style="margin-bottom:16px">${svcChip(o)} ${conf ? statusBadge(o.Status) : statusBadge('Draf')} ${docBadge(o)}</div>`;
  body += '<div class="sec-title">Dokumen</div>' + dl([[docLabel(o), o.NoSJ || 'Terbit saat konfirmasi'], ['No. unik (internal)', o.NoUnik], ['Tanggal', tglJam(orderDate(o))],
    ['Dibuat oleh', o.DibuatOleh], ['Dikonfirmasi', o.DikonfirmasiOleh ? o.DikonfirmasiOleh + ' · ' + tglJam(o.DikonfirmasiPada) : ''], ['Dicetak', String(o.Dicetak) === 'true' ? tglJam(o.WaktuCetak) + ' · ' + (o.ModeCetak || '') : 'Belum']]);
  body += '<div class="sec-title">Pelanggan</div>' + dl([['Nama', o.NamaPelanggan], ['ID pelanggan', o.KodePelanggan]]);
  if (o.Layanan === 'paket') {
    const b = barangOf(o);
    body += '<div class="sec-title">Pengirim & penerima</div>' + dl([['Pengirim', `${esc(o.PengirimNama)} · ${esc(o.PengirimHP)}<br><span class="muted">${esc(o.PengirimAlamat)}</span>`, 1],
      ['Penerima', `${esc(o.PenerimaNama)} · ${esc(o.PenerimaHP)}<br><span class="muted">${esc(o.PenerimaAlamat)}</span>`, 1], ['Kota tujuan', o.KotaTujuan],
      ['Jalur', o.Jalur || 'Darat'], ['Ongkos ditanggung', o.Pembayar === 'penerima' ? 'Penerima' : 'Pengirim'],
      ['Dasar tarif', o.DasarTarif === 'volume' ? 'Volume' : 'Berat'], ['Perhitungan', basisText(o)]]);
    if (o.EkspedisiID || o.ResiEkspedisi) { const e = byId('ekspedisi', o.EkspedisiID);
      body += '<div class="sec-title">Ekspedisi rekanan (internal)</div>' + dl([['Ekspedisi', esc(o.EkspedisiNama || '—') + (e && e.NoWA ? ` · <a href="https://wa.me/${waNumber(e.NoWA)}" target="_blank" rel="noopener">WA ${esc(e.NoWA)}</a>` : ''), 1], ['No. resi rekanan', o.ResiEkspedisi]]); }
    body += '<div class="sec-title">Isi kiriman</div>' + (b.length ? `<div class="table-wrap" style="margin-bottom:8px"><table class="table compact"><thead><tr><th>Detail</th><th class="t-num">Qty</th><th class="t-num">Kg</th><th class="t-num">m³</th></tr></thead><tbody>${b.map(x => `<tr><td>${esc(x.d)}</td><td class="t-num">${fnumDec(x.q)}</td><td class="t-num">${fnumDec(x.q * x.kg)}</td><td class="t-num">${fnumDec(x.q * x.p * x.l * x.t / 1e6, 4)}</td></tr>`).join('')}</tbody></table></div>` : '') + dl([['Total', paketRingkas(o)]]);
  } else if (o.Layanan === 'sewa') {
    body += '<div class="sec-title">Rute & muatan</div>' + dl([['Muat', `${esc(o.MuatPIC)} · ${esc(o.MuatHP)}<br><span class="muted">${esc(o.MuatAlamat)}</span>`, 1],
      ['Bongkar', `${esc(o.BongkarPIC)} · ${esc(o.BongkarHP)}<br><span class="muted">${esc(o.BongkarAlamat)}</span>`, 1], ['Kendaraan', (o.NoPol || '') + ' · ' + (o.JenisKendaraan || '')],
      ['Pengemudi', o.PengemudiNama], ['Muatan', o.JenisMuatan], ['Jumlah / berat', [o.Kuantitas ? o.Kuantitas + ' ' + (o.Satuan || '') : '', o.Berat].filter(Boolean).join(' · ')], ['No. segel', o.NoSegel]]);
  } else {
    body += '<div class="sec-title">Pengiriman</div>' + dl([['Jenis layanan', o.JenisLayanan], ['Penerima', `${esc(o.PenerimaNama)} · ${esc(o.PenerimaHP)}<br><span class="muted">${esc(o.PenerimaAlamat)}</span>`, 1],
      ['Mobil', [o.Merk, o.Tipe, o.JenisMobil, o.Model].filter(Boolean).join(' ')], ['No. polisi', o.NoPolMobil], ['Warna / tahun', [o.Warna, o.Tahun].filter(Boolean).join(' · ')], ['No. rangka', o.NoRangka],
      ['Cara pengiriman', o.ModaAngkut || 'Towing'], ...((o.ModaAngkut || 'Towing') === 'Towing rekanan' ? [['Towing rekanan (internal)', o.EkspedisiNama]] : [['Unit pengangkut', (o.ModaAngkut || 'Towing') === 'Towing' ? o.UnitNoPol : '—'], ['Pengemudi', [o.PengemudiNama, o.PengemudiHP].filter(Boolean).join(' · ')]]), ['Inspeksi', insp ? `${insp.Status === 'Disahkan' ? 'Disahkan · ' + insp.KondisiRingkas : 'Draf'}` : 'Belum diisi']]);
  }
  body += '<div class="sec-title">Pembayaran</div>' + dl([['Metode', o.Pembayaran], ['Harga', o.Harga !== '' ? rp(o.Harga) : ''], [labelPajak(o), o.Pajak ? rp(o.Pajak) : ''], ['Penyesuaian tarif', o.Penyesuaian ? rp(o.Penyesuaian) : ''],
    ['Total', `<b>${rp(o.Total)}</b>`, 1], ['DP', o.Pembayaran === 'DP' ? rp(o.DP) : ''], ['Sisa', o.Pembayaran === 'DP' ? rp(o.Sisa) : ''], ['Jatuh tempo', o.JatuhTempo ? tgl(o.JatuhTempo) : ''],
    ['Rekening', rek ? rek.Bank + ' ' + rek.NoRekening : ''], ['Invoice', inv ? `${esc(inv.NoInvoice)} · <span class="badge ${inv.Status === 'Lunas' ? 'b-green' : inv.Status === 'Batal' ? 'b-slate' : 'b-amber'}">${esc(inv.Status)}</span>` : '', 1], ['Catatan', o.Catatan]]);
  if (o.PdfUrl) body += `<a class="btn btn-secondary btn-sm" href="${esc(o.PdfUrl)}" target="_blank" rel="noopener"><i class="bi bi-file-earmark-pdf"></i> Buka arsip PDF di Drive</a>`;

  let foot = '';
  if (!conf) {
    foot = `<button class="btn btn-ghost" data-d="del" style="margin-right:auto;color:var(--red)"><i class="bi bi-trash"></i> Hapus draf</button><button class="btn btn-primary" data-d="edit"><i class="bi bi-pencil"></i> Lanjutkan draf</button>`;
  } else {
    foot = `<button class="btn btn-secondary" data-d="edit"><i class="bi ${isSA() ? 'bi-pencil' : 'bi-eye'}"></i> ${isSA() ? 'Buka &amp; edit' : 'Buka form'}</button>` +
      (o.Layanan === 'kirim' ? `<button class="btn btn-secondary" data-d="insp"><i class="bi bi-clipboard2-check"></i> Inspeksi</button><button class="btn btn-secondary" data-d="tt"><i class="bi bi-receipt-cutoff"></i> Tanda terima</button>` : '') +
      `<button class="btn btn-primary" data-d="print"><i class="bi bi-printer"></i> ${o.Layanan === 'paket' ? 'Cetak resi' : 'Cetak surat jalan'}</button>`;
  }
  openDrawer({ title: orderLabel(o), sub: esc(o.NamaPelanggan || ''), body, foot });
  $('#drawerFoot').onclick = e => {
    const b = e.target.closest('[data-d]'); if (!b) return;
    const a = b.dataset.d;
    if (a === 'edit') { closeDrawer(); navigateTo(o.Layanan, { order: o }); }
    if (a === 'print') printOrder(o.ID, 'tanpa');
    if (a === 'tt') printTandaTerima(o.ID);
    if (a === 'insp') { closeDrawer(); navigateTo('inspeksi', { orderId: o.ID }); }
    if (a === 'del') confirmDialog({ title: 'Hapus draf ini?', text: 'Draf ' + o.NoUnik + ' akan dihapus permanen.', variant: 'danger', icon: 'bi-trash', ok: 'Hapus draf' }).then(v => {
      if (v !== true) return;
      btnBusy(b, true);
      api('deleteDraft', S.token, o.Layanan, o.ID).then(() => { removeFrom('orders', o.ID); saveCache(); updateBadges(); closeDrawer(); ok('Draf dihapus'); renderPage(S.page); }).catch(fail).finally(() => btnBusy(b, false));
    });
  };
}

// ============================================================
// INVOICE & TAGIHAN
// ============================================================
function renderInvoice() {
  const el = $('#page-invoice'), f = S.ui.inv, t = today(), mk = monthKey(t);
  const inv = S.d.invoices;
  const belum = inv.filter(i => i.Status === 'Belum Lunas');
  const telat = belum.filter(i => i.JatuhTempo < t);
  const tujuh = belum.filter(i => i.JatuhTempo >= t && diffHari(i.JatuhTempo, t) <= 7);
  const lunasBln = inv.filter(i => i.Status === 'Lunas' && monthKey(i.TglBayar) === mk);
  const sum = a => a.reduce((s, i) => s + num(i.Tagihan), 0);
  const counts = { semua: inv.length, belum: belum.length, telat: telat.length, tujuh: tujuh.length, lunas: inv.filter(i => i.Status === 'Lunas').length, batal: inv.filter(i => i.Status === 'Batal').length };
  el.innerHTML = `
  <div class="page-head">
    <div class="ph-icon"><i class="bi bi-receipt"></i></div>
    <div><h1>Monitoring Invoice &amp; Jatuh Tempo</h1><p class="muted">Tagihan dari order Termin, DP, COD, dan Invoice Surat Kembali. Pelunasan dicatat manual lewat Tandai Lunas.</p></div>
  </div>
  <div class="kpis">
    ${kpi('Total piutang berjalan', rp(sum(belum)), 'bi-wallet2', 'ic-primary', belum.length + ' invoice aktif', 'money')}
    ${kpi('Lewat jatuh tempo', rp(sum(telat)), 'bi-exclamation-diamond', 'ic-red', telat.length + ' invoice perlu tindakan cepat', 'money', telat.length ? 'danger' : '')}
    ${kpi('Jatuh tempo 7 hari', rp(sum(tujuh)), 'bi-bell', 'ic-amber', tujuh.length + ' invoice terjadwal', 'money')}
    ${kpi('Lunas bulan ini', rp(sum(lunasBln)), 'bi-patch-check', 'ic-green', lunasBln.length + ' transaksi · tercatat di Finance', 'money', 'ok')}
  </div>
  <div class="dash-grid">
    <div>
      <div class="card" style="margin-bottom:16px">
        <div class="toolbar">
          <div class="search grow"><i class="bi bi-search"></i><input class="input" id="invQ" placeholder="Cari no. invoice, surat jalan, pelanggan…" value="${esc(f.q)}"></div>
        </div>
        <div class="chips-row">
          ${[['belum', 'Belum lunas'], ['telat', 'Lewat jatuh tempo', 'danger'], ['tujuh', '≤ 7 hari'], ['lunas', 'Lunas'], ['batal', 'Batal'], ['semua', 'Semua']]
            .map(([k, l, c]) => `<button class="fchip ${c || ''} ${f.f === k ? 'active' : ''}" data-f="${k}">${esc(l)}<span class="cnt">${counts[k]}</span></button>`).join('')}
        </div>
      </div>
      <div class="table-card" id="invTable"></div>
    </div>
    <div class="stack" id="invSide"></div>
  </div>`;
  $('#invQ').addEventListener('input', debounce(e => { f.q = e.target.value; f.page = 1; renderInvoiceTable(); }, 150));
  el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { f.f = b.dataset.f; f.page = 1; renderInvoice(); });
  renderInvoiceTable();
}
function filterInvoices() {
  const f = S.ui.inv, t = today(), q = f.q.trim().toLowerCase();
  return S.d.invoices.filter(i => {
    if (f.f === 'belum' && i.Status !== 'Belum Lunas') return false;
    if (f.f === 'telat' && !(i.Status === 'Belum Lunas' && i.JatuhTempo < t)) return false;
    if (f.f === 'tujuh' && !(i.Status === 'Belum Lunas' && i.JatuhTempo >= t && diffHari(i.JatuhTempo, t) <= 7)) return false;
    if (f.f === 'lunas' && i.Status !== 'Lunas') return false;
    if (f.f === 'batal' && i.Status !== 'Batal') return false;
    if (q && ![i.NoInvoice, i.NoSJ, i.NamaPelanggan].join(' ').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (a.Status === 'Belum Lunas' ? 0 : 1) - (b.Status === 'Belum Lunas' ? 0 : 1) || String(a.JatuhTempo).localeCompare(String(b.JatuhTempo)));
}
function dueTag(i) {
  if (i.Status === 'Lunas') return `<span class="badge b-green">Lunas ${tglPendek(i.TglBayar)}</span>`;
  if (i.Status === 'Batal') return '<span class="badge b-slate">Batal</span>';
  const n = diffHari(today(), i.JatuhTempo);
  if (n > 0) return `<span class="badge b-red">Lewat ${n} hari</span>`;
  if (n === 0) return '<span class="badge b-amber">Hari ini</span>';
  return `<span class="badge ${-n <= 7 ? 'b-amber' : 'b-indigo'}">${-n} hari lagi</span>`;
}
function renderInvoiceTable() {
  const f = S.ui.inv, size = 20, list = filterInvoices(), t = today();
  const pages = Math.max(1, Math.ceil(list.length / size)); if (f.page > pages) f.page = pages;
  const rows = list.slice((f.page - 1) * size, f.page * size);
  if (!f.sel || !list.find(i => i.ID === f.sel)) f.sel = (list.find(i => i.Status === 'Belum Lunas') || list[0] || {}).ID || null;
  const wrap = $('#invTable');
  wrap.innerHTML = rows.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>No. invoice &amp; order</th><th>Pelanggan</th><th>Layanan</th><th>Jatuh tempo</th><th class="t-num">Tagihan</th><th class="t-actions">Aksi</th></tr></thead><tbody>
    ${rows.map(i => `<tr class="clickable ${i.Status === 'Belum Lunas' && i.JatuhTempo < t ? 'row-danger' : ''} ${i.Status === 'Batal' ? 'row-muted' : ''}" data-id="${esc(i.ID)}" ${f.sel === i.ID ? 'style="box-shadow:inset 3px 0 0 var(--primary)"' : ''}>
      <td class="card-title" data-label="Invoice"><span class="t-link">${esc(i.NoInvoice)}</span><span class="t-sub">${i.Layanan === 'paket' ? 'Resi' : 'SJ'} ${esc(i.NoSJ)} · ${esc(i.Pembayaran)}${i.Pembayaran === 'Termin' ? ' ' + esc(i.TerminHari) + ' hari' : ''}</span></td>
      <td data-label="Pelanggan" class="t-strong">${esc(i.NamaPelanggan)}</td>
      <td data-label="Layanan"><span class="svc svc-${esc(i.Layanan || 'kirim')}">${LAY_LABEL[i.Layanan] || 'Kirim'}</span></td>
      <td data-label="Jatuh tempo"><span class="mono">${tglPendek(i.JatuhTempo)}</span><br>${dueTag(i)}</td>
      <td data-label="Tagihan" class="t-num t-strong">${rp(i.Tagihan)}</td>
      <td class="t-actions">${i.Status === 'Belum Lunas' ? `<button class="icon-btn" data-wa="${esc(i.ID)}" title="Kirim WhatsApp" style="color:#16A34A"><i class="bi bi-whatsapp"></i></button><button class="icon-btn" data-mail="${esc(i.ID)}" title="Kirim email"><i class="bi bi-envelope"></i></button><button class="icon-btn" data-paid="${esc(i.ID)}" title="Tandai lunas" aria-label="Tandai lunas" style="color:var(--primary)"><i class="bi bi-check2-circle"></i></button>` : ''}<button class="icon-btn" data-pinv="${esc(i.ID)}" title="Cetak invoice"><i class="bi bi-printer"></i></button></td>
    </tr>`).join('')}</tbody></table></div>
    <div class="table-foot"><span>Total tertera: <b class="mono">${rp(list.reduce((s, i) => s + num(i.Tagihan), 0))}</b> · ${list.length} invoice</span>${pagerHTML(list.length, f.page, size, 'pg')}</div>`
    : emptyHTML(f.f === 'telat' ? 'bi-check2-circle' : 'bi-receipt', f.f === 'telat' ? 'Tidak ada tagihan terlambat' : 'Tidak ada invoice', f.f === 'telat' ? 'Semua invoice termin masih dalam tenggat waktu.' : 'Invoice terbentuk otomatis saat order non-lunas dikonfirmasi.');
  bindInvoiceMini(wrap);
  wrap.onclick = e => {
    const pg = e.target.closest('[data-pg]'); if (pg) { f.page = Number(pg.dataset.pg); renderInvoiceTable(); return; }
    const p = e.target.closest('[data-paid]'); if (p) { e.stopPropagation(); openPaidModal(p.dataset.paid); return; }
    const pi = e.target.closest('[data-pinv]'); if (pi) { e.stopPropagation(); printInvoice(pi.dataset.pinv); return; }
    if (e.target.closest('[data-wa],[data-mail]')) return;
    const tr = e.target.closest('tr[data-id]'); if (tr) { f.sel = tr.dataset.id; renderInvoiceTable(); }
  };
  renderInvoiceSide();
}
function waText(i) {
  const st = S.settings;
  return String(st.waTemplate || '').replace(/\{pelanggan\}/g, i.NamaPelanggan || '').replace(/\{perusahaan\}/g, st.companyName || st.appName || '')
    .replace(/\{invoice\}/g, i.NoInvoice || '').replace(/\{nominal\}/g, rp(i.Tagihan)).replace(/\{jatuhTempo\}/g, tgl(i.JatuhTempo, true)).replace(/\{suratJalan\}/g, i.NoSJ || '');
}
function payAccounts() { return S.d.rekening.filter(r => String(r.Aktif) === 'true' && r.Kategori === 'Penerima Pembayaran'); }
function renderInvoiceSide() {
  const side = $('#invSide'); if (!side) return;
  const i = byId('invoices', S.ui.inv.sel);
  const reks = payAccounts();
  const pel = i ? pihakTagihan(i.PelangganID) : null;
  side.innerHTML = `
  <div class="card">
    <div class="card-title-row"><div><h3><i class="bi bi-whatsapp" style="color:#16A34A"></i> Pratinjau pesan WA</h3><p class="muted">${i ? esc(i.NoInvoice) + ' · ' + esc(i.NamaPelanggan) : 'Pilih invoice di tabel'}</p></div></div>
    ${i ? `<div style="background:#E7F6EC;border-radius:12px;padding:14px;color:#0F172A;font-size:13px;white-space:pre-wrap;line-height:1.55">${esc(waText(i))}</div>
      <p class="muted" style="font-size:12px;margin:10px 0">${pel && pel.NoHP ? 'Dikirim ke ' + esc(pel.NoHP) : '<span style="color:var(--red)">No. HP pelanggan belum diisi.</span>'}${i.PengingatTerakhir ? ' · Terakhir diingatkan ' + esc(i.PengingatTerakhir) : ''}</p>
      ${i.Status === 'Belum Lunas' ? `<div class="row-2" style="gap:8px"><button class="btn btn-wa" data-wa="${esc(i.ID)}"><i class="bi bi-whatsapp"></i> Buka WhatsApp</button><button class="btn btn-secondary" data-copy="1"><i class="bi bi-clipboard"></i> Salin pesan</button></div>` : ''}` : emptyHTML('bi-chat-dots', 'Belum ada invoice dipilih', '')}
    <p class="muted" style="font-size:11.5px;margin-top:10px"><i class="bi bi-info-circle"></i> Pesan disiapkan otomatis, Anda tinggal menekan kirim di WhatsApp.</p>
  </div>
  <div class="card">
    <div class="card-title-row"><div><h3><i class="bi bi-bank"></i> Rekening pembayaran resmi</h3><p class="muted">Dari master rekening di Pengaturan.</p></div></div>
    <div class="rek-list">${reks.length ? reks.map(r => `<div class="rek"><span class="bank">${esc(r.Bank)}</span><div style="flex:1;min-width:0"><b>${esc(r.NoRekening)}</b><div class="muted" style="font-size:12px">a.n. ${esc(r.AtasNama)}</div></div><button class="icon-btn sm" data-copyrek="${esc(r.NoRekening)}" title="Salin"><i class="bi bi-copy"></i></button></div>`).join('')
      : `<p class="muted" style="font-size:13px">Belum ada rekening penerima pembayaran.${isSA() ? ' Tambahkan di Pengaturan → Master Rekening Bank.' : ''}</p>`}</div>
  </div>
  <div class="card">
    <h3 style="display:flex;gap:8px;align-items:center"><i class="bi bi-arrow-repeat"></i> Alur pelunasan</h3>
    <ol class="temuan" style="margin-top:10px;font-size:12.5px"><li>Pelanggan mentransfer ke rekening resmi.</li><li>Admin menekan <b>Tandai lunas</b> dan memilih rekening tujuan.</li><li>Pemasukan otomatis tercatat di Finance.</li></ol>
  </div>`;
  bindInvoiceMini(side);
  const cp = side.querySelector('[data-copy]');
  if (cp) cp.onclick = () => copyText(waText(i), 'Pesan disalin');
  side.querySelectorAll('[data-copyrek]').forEach(b => b.onclick = () => copyText(b.dataset.copyrek, 'Nomor rekening disalin'));
}
function copyText(t, msg) {
  const done = () => ok(msg || 'Disalin');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done).catch(() => fallback());
  else fallback();
  function fallback() { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { fail(new Error('Tidak dapat menyalin.')); } ta.remove(); }
}
function openWhatsApp(id) {
  const i = byId('invoices', id); if (!i) return;
  const pel = pihakTagihan(i.PelangganID);
  if (!pel || !pel.NoHP) { toast('warning', 'No. HP belum ada', 'Lengkapi no. HP pelanggan di Data Pelanggan.'); return; }
  const a = document.createElement('a');
  a.href = 'https://wa.me/' + waNumber(pel.NoHP) + '?text=' + encodeURIComponent(waText(i));
  a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  i.PengingatTerakhir = nowJkt() + ' (WhatsApp)';
  api('logReminder', S.token, id, 'wa').then(r => { upsert('invoices', r.data); saveCache(); }).catch(() => {});
}
function sendEmailReminder(id, btn) {
  const i = byId('invoices', id); if (!i) return;
  const pel = pihakTagihan(i.PelangganID);
  if (!pel || !pel.Email) { toast('warning', 'Email belum ada', 'Lengkapi email pelanggan di Data Pelanggan.'); return; }
  confirmDialog({ title: 'Kirim email pengingat?', html: `Email pengingat ${esc(i.NoInvoice)} (${rp(i.Tagihan)}) akan dikirim ke <b>${esc(pel.Email)}</b>.`, icon: 'bi-envelope', ok: 'Kirim email', okIcon: 'bi-send' }).then(v => {
    if (v !== true) return;
    btnBusy(btn, true);
    api('sendInvoiceEmail', S.token, id).then(r => { upsert('invoices', r.data); saveCache(); ok('Email terkirim', r.message); if (S.page === 'invoice') renderInvoiceSide(); }).catch(fail).finally(() => btnBusy(btn, false));
  });
}
function openPaidModal(id) {
  const i = byId('invoices', id); if (!i) return;
  const reks = payAccounts().concat(S.d.rekening.filter(r => String(r.Aktif) === 'true' && r.Kategori !== 'Penerima Pembayaran'));
  if (!reks.length) { toast('warning', 'Belum ada rekening', isSA() ? 'Tambahkan rekening di Pengaturan → Master Rekening Bank.' : 'Minta Super Admin menambahkan rekening.'); return; }
  const o = byId('orders', i.OrderID);
  openModal({
    title: 'Catat pembayaran ' + i.NoInvoice, sub: i.NamaPelanggan + ' · jatuh tempo ' + tgl(i.JatuhTempo), icon: 'bi-cash-coin',
    body: `<div class="pay-total"><div><span class="label">Tagihan dilunasi</span><br><span>${esc(i.Pembayaran)}${o ? ' · SJ ' + esc(o.NoSJ) : ''}</span></div><b>${rp(i.Tagihan)}</b></div>
      <div class="row-2"><label class="field"><span class="label req">Tanggal bayar</span><input class="input" type="date" id="pdTgl" value="${today()}" max="${today()}"></label>
      <label class="field"><span class="label req">Rekening tujuan</span><select class="input" id="pdRek">${reks.map(r => `<option value="${esc(r.ID)}">${esc(r.Bank)} ${esc(r.NoRekening)} · ${esc(r.Alias)}</option>`).join('')}</select></label></div>
      <div class="alert alert-info"><i class="bi bi-info-circle"></i><div>Setelah ditandai lunas, pemasukan otomatis tercatat di Finance dengan rekening yang dipilih.</div></div>`,
    foot: '<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="pdOk"><i class="bi bi-check2-circle"></i> Konfirmasi &amp; tandai lunas</button>'
  });
  $('#pdOk').onclick = () => {
    const tglBayar = $('#pdTgl').value, rek = $('#pdRek').value;
    const old = Object.assign({}, i);
    // Optimistic: langsung lunas di UI
    Object.assign(i, { Status: 'Lunas', TglBayar: tglBayar, RekeningID: rek });
    closeModal(); updateBadges(); renderPage(S.page);
    toast('info', 'Menyimpan pelunasan…', i.NoInvoice);
    api('markInvoicePaid', S.token, id, tglBayar, rek).then(r => {
      upsert('invoices', r.data.invoice); (r.data.finance || []).forEach(f => upsert('finance', f));
      saveCache(); updateBadges(); renderPage(S.page); ok('Invoice lunas', r.message);
    }).catch(err => {
      // Koneksi putus / sudah lunas: cek ulang ke server dulu, karena pelunasan mungkin sudah tercatat.
      if (err && (err.jaringan || /sudah lunas/i.test(err.message))) {
        return refreshData(true).then(() => {
          const now = byId('invoices', id);
          if (now && now.Status === 'Lunas') { updateBadges(); renderPage(S.page); ok('Invoice lunas', 'Pelunasan sudah tercatat di server.'); }
          else { updateBadges(); renderPage(S.page); fail(err, 'Pelunasan gagal disimpan'); }
        }).catch(() => { upsert('invoices', old); updateBadges(); renderPage(S.page); fail(err, 'Pelunasan gagal disimpan'); });
      }
      upsert('invoices', old); updateBadges(); renderPage(S.page); fail(err, 'Pelunasan gagal disimpan');
    });
  };
}

/* ── QR Code encoder (tanpa CDN) ──────────────────────────────
   QRCode for JavaScript — Copyright (c) 2009 Kazuhiko Arase, MIT license
   (http://www.d-project.com/). Dibundel dari qrcode-terminal/vendor/QRCode.
   "QR Code" adalah merek dagang terdaftar DENSO WAVE INCORPORATED.
   ──────────────────────────────────────────────────────────── */
const KgmQR = (function () {
  const defs = {}, cache = {};
  function req(name) {
    const key = name.replace('./', '').replace(/\/$/, '') || 'index';
    if (cache[key]) return cache[key].exports;
    const module = { exports: {} }; cache[key] = module;
    defs[key](module, req);
    return module.exports;
  }
  defs['QRMode'] = function (module, require) {
module.exports = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

  };
  defs['QRErrorCorrectLevel'] = function (module, require) {
module.exports = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};


  };
  defs['QRMaskPattern'] = function (module, require) {
module.exports = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

  };
  defs['QRMath'] = function (module, require) {
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

module.exports = QRMath;

  };
  defs['QRPolynomial'] = function (module, require) {
var QRMath = require('./QRMath');

function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};

module.exports = QRPolynomial;

  };
  defs['QR8bitByte'] = function (module, require) {
var QRMode = require('./QRMode');

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

module.exports = QR8bitByte;

  };
  defs['QRBitBuffer'] = function (module, require) {
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

module.exports = QRBitBuffer;

  };
  defs['QRRSBlock'] = function (module, require) {
var QRErrorCorrectLevel = require('./QRErrorCorrectLevel');

function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [

	// L
	// M
	// Q
	// H

	// 1
	[1, 26, 19],
	[1, 26, 16],
	[1, 26, 13],
	[1, 26, 9],
	
	// 2
	[1, 44, 34],
	[1, 44, 28],
	[1, 44, 22],
	[1, 44, 16],

	// 3
	[1, 70, 55],
	[1, 70, 44],
	[2, 35, 17],
	[2, 35, 13],

	// 4		
	[1, 100, 80],
	[2, 50, 32],
	[2, 50, 24],
	[4, 25, 9],
	
	// 5
	[1, 134, 108],
	[2, 67, 43],
	[2, 33, 15, 2, 34, 16],
	[2, 33, 11, 2, 34, 12],
	
	// 6
	[2, 86, 68],
	[4, 43, 27],
	[4, 43, 19],
	[4, 43, 15],
	
	// 7		
	[2, 98, 78],
	[4, 49, 31],
	[2, 32, 14, 4, 33, 15],
	[4, 39, 13, 1, 40, 14],
	
	// 8
	[2, 121, 97],
	[2, 60, 38, 2, 61, 39],
	[4, 40, 18, 2, 41, 19],
	[4, 40, 14, 2, 41, 15],
	
	// 9
	[2, 146, 116],
	[3, 58, 36, 2, 59, 37],
	[4, 36, 16, 4, 37, 17],
	[4, 36, 12, 4, 37, 13],
	
	// 10		
	[2, 86, 68, 2, 87, 69],
	[4, 69, 43, 1, 70, 44],
	[6, 43, 19, 2, 44, 20],
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};

module.exports = QRRSBlock;

  };
  defs['QRUtil'] = function (module, require) {
var QRMode = require('./QRMode');
var QRPolynomial = require('./QRPolynomial');
var QRMath = require('./QRMath');
var QRMaskPattern = require('./QRMaskPattern');

var QRUtil = {

    PATTERN_POSITION_TABLE : [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],        
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};

module.exports = QRUtil;

  };
  defs['index'] = function (module, require) {
//---------------------------------------------------------------------
// QRCode for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//   http://www.opensource.org/licenses/mit-license.php
//
// The word "QR Code" is registered trademark of 
// DENSO WAVE INCORPORATED
//   http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------
// Modified to work in node for this project (and some refactoring)
//---------------------------------------------------------------------

var QR8bitByte = require('./QR8bitByte');
var QRUtil = require('./QRUtil');
var QRPolynomial = require('./QRPolynomial');
var QRRSBlock = require('./QRRSBlock');
var QRBitBuffer = require('./QRBitBuffer');

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
								
				row += inc;
	
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
		
	}

};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};

module.exports = QRCode;

  };
  const QRCode = req('index'), ECL = req('QRErrorCorrectLevel');
  /** Matriks QR (array boolean) untuk teks UTF-8. */
  function matrix(text, level) {
    const bytes = unescape(encodeURIComponent(String(text)));
    const qr = new QRCode(-1, ECL[level || 'M']);
    qr.addData(bytes); qr.make();
    const n = qr.getModuleCount(), m = [];
    for (let r = 0; r < n; r++) { const row = []; for (let c = 0; c < n; c++) row.push(qr.isDark(r, c)); m.push(row); }
    return m;
  }
  /** Gambar PNG (data URL) — dipakai di cetak & PDF. */
  function dataUrl(text, px, level) {
    const m = matrix(text, level), n = m.length, quiet = 2, cell = Math.max(2, Math.floor((px || 240) / (n + quiet * 2)));
    const size = (n + quiet * 2) * cell, cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#000';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) g.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    return cv.toDataURL('image/png');
  }
  return { matrix: matrix, dataUrl: dataUrl };
})();

// ============================================================
// DATA MASTER (Pelanggan, Kendaraan, Pengemudi, Penerima, Rekening)
// ============================================================
function driverBusy(d) {
  return S.d.orders.find(o => o.PengemudiID === d.ID && o.StatusDok === 'Terkonfirmasi' && (o.Status === 'Dijadwalkan' || o.Status === 'Dikirim')) || null;
}
function vehicleBusy(k) {
  return S.d.orders.find(o => (o.KendaraanID === k.ID || o.UnitID === k.ID) && o.StatusDok === 'Terkonfirmasi' && (o.Status === 'Dijadwalkan' || o.Status === 'Dikirim')) || null;
}
const MASTERS = {
  pelanggan: {
    title: 'Data Master Pelanggan', sub: 'Satu pelanggan memiliki dua ID: untuk layanan sewa dan pengiriman.', icon: 'bi-buildings', add: 'Tambah pelanggan', list: 'pelanggan',
    canEdit: () => isSA(), canDel: () => isSA(), label: r => r.Nama,
    search: r => [r.Nama, r.IDSewa, r.IDKirim, r.NoHP, r.NPWP, r.Email, r.Alamat, r.Tipe, r.Marketing, tarifList(r).map(t => t.kota).join(' ')].join(' '),
    chips: [['', 'Semua'], ['corp', 'Corporate', r => r.Tipe === 'Corporate'], ['reguler', 'Reguler', r => r.Tipe !== 'Corporate'], ['termin', 'Pembayaran termin', r => r.PembayaranBawaan === 'Termin'], ['npwp', 'Ber-NPWP', r => !!r.NPWP], ['aktif', 'Ada order aktif', r => S.d.orders.some(o => o.PelangganID === r.ID && o.StatusDok === 'Terkonfirmasi' && (o.Status === 'Dijadwalkan' || o.Status === 'Dikirim'))]],
    cols: [
      ['ID & akun', r => `<span class="chip chip-soft mono">${esc(r.IDSewa)}</span>${r.IDKirim !== r.IDSewa ? `<span class="t-sub mono">Kirim: ${esc(r.IDKirim)}</span>` : ''}`, 'card-title'],
      ['Nama pelanggan', r => `<div class="who"><span class="avatar soft">${esc(initials(r.Nama))}</span><div><span class="t-strong">${esc(r.Nama)}</span> ${tipePelBadge(r)}<span class="t-sub">${r.Marketing ? '<i class="bi bi-person-badge"></i> Marketing ' + esc(r.Marketing) + ' · ' : ''}${esc(firstPart(r.Alamat))}</span></div></div>`],
      ['Kontak', r => `${r.NoHP ? `<span class="mono">${esc(r.NoHP)}</span>` : '—'}${r.Email ? `<span class="t-sub">${esc(r.Email)}</span>` : ''}`],
      ['NPWP', r => r.NPWP ? `<span class="mono">${esc(r.NPWP)}</span><span class="t-sub"><i class="bi bi-check2-circle"></i> Format valid</span>` : '<span class="muted">—</span>'],
      ['Pembayaran bawaan', r => r.PembayaranBawaan ? `<span class="badge ${r.PembayaranBawaan === 'Termin' ? 'b-indigo' : r.PembayaranBawaan === 'DP' ? 'b-amber' : 'b-slate'} plain">${esc(r.PembayaranBawaan)}${r.PembayaranBawaan === 'Termin' ? ' ' + esc(r.TerminHari) + ' hari' : ''}</span>` : '<span class="muted">—</span>'],
      ['Tarif paket', r => { const t = tarifList(r); return t.length ? `<b>${t.length}</b> kota<span class="t-sub">${esc(t.slice(0, 2).map(x => x.kota || 'Semua kota').join(', '))}${t.length > 2 ? '…' : ''}</span>` : '<span class="muted">—</span>'; }],
      ['Order', r => { const n = S.d.orders.filter(o => o.PelangganID === r.ID && o.StatusDok === 'Terkonfirmasi').length; return `<b class="mono">${n}</b><span class="t-sub">surat jalan</span>`; }]
    ],
    sections: [
      { t: 'Identitas pelanggan', f: [
        { k: 'Nama', l: 'Nama pelanggan', req: true, full: true, ph: 'Contoh: PT Mandiri Logistik Sentosa' },
        { k: '_ids', t: 'ids' },
        { k: 'Tipe', l: 'Tipe pelanggan', t: 'select', opts: ['Reguler', 'Corporate'], help: 'Corporate = pelanggan kontrak/hasil CRM, punya harga khusus di Daftar Harga.' },
        { k: 'Marketing', l: 'Marketing / sales PIC', ph: 'Contoh: Budi', help: 'Terisi otomatis bila pelanggan berasal dari CRM.' },
        { k: 'NPWP', l: 'NPWP', t: 'npwp', full: true, ph: '01.234.567.8-901.000', help: 'Opsional. Format dicek otomatis, tidak diverifikasi ke DJP.' }] },
      { t: 'Kontak & alamat', f: [
        { k: 'NoHP', l: 'No. HP / WhatsApp', t: 'tel', req: true, ph: '0812-3456-7890' },
        { k: 'Email', l: 'Email (untuk pengingat)', t: 'email', ph: 'finance@perusahaan.co.id' },
        { k: 'Alamat', l: 'Alamat', t: 'textarea', req: true, full: true }] },
      { t: 'Pembayaran bawaan', f: [
        { k: 'PembayaranBawaan', l: 'Metode bawaan', t: 'select', opts: [''].concat(METODE), optLabel: v => v || 'Tidak ada', help: 'Terisi otomatis di form order, tetap bisa diubah.' },
        { k: 'TerminHari', l: 'Jumlah hari termin', t: 'number', ph: '30', show: d => d.PembayaranBawaan === 'Termin' },
        { k: 'Catatan', l: 'Catatan', t: 'textarea', full: true }] },
      { t: 'Tarif pengiriman paket per kota tujuan', f: [{ k: 'TarifPaket', t: 'tarif', full: true }] }
    ]
  },
  kendaraan: {
    title: 'Data Master Kendaraan', sub: 'Armada sewa dan unit towing / car carrier.', icon: 'bi-car-front', add: 'Tambah armada', list: 'kendaraan',
    canEdit: () => true, canDel: () => isSA(), label: r => r.NoPol,
    search: r => [r.NoPol, r.Kode, r.JenisKendaraan, r.Merk, r.Tipe, r.NoKa, r.NoSin, r.Pool].join(' '),
    chips: [['', 'Semua'], ['tindak', 'KIR / pajak perlu tindakan', r => vehicleAlerts(r).length > 0, 'danger'], ['jalan', 'Sedang jalan', r => !!vehicleBusy(r)], ['siap', 'Siap operasi', r => !vehicleBusy(r) && !vehicleAlerts(r).some(a => a.lvl === 'exp')]],
    cols: [
      ['No. polisi', r => { const a = vehicleAlerts(r); return `<span class="plate ${a.some(x => x.lvl === 'exp') ? 'red' : ''}">${esc(r.NoPol)}</span><span class="t-sub mono">${esc(r.Kode)}${r.Pool ? ' · ' + esc(r.Pool) : ''}</span>`; }, 'card-title'],
      ['Jenis & kategori', r => `<span class="t-strong">${esc(r.JenisKendaraan)}</span><span class="t-sub">${esc([r.Merk, r.Tipe].filter(Boolean).join(' '))}${r.Tahun ? ' · ' + esc(r.Tahun) : ''}</span>`],
      ['Rangka & mesin', r => `<span class="mono" style="white-space:nowrap">NoKa ${esc(r.NoKa)}</span><span class="t-sub mono" style="white-space:nowrap">NoSin ${esc(r.NoSin)}</span>`],
      ['Uji KIR', r => expBadge(r.MasaKIR)],
      ['Pajak / STNK', r => expBadge(r.MasaPajak)],
      ['Status', r => { const o = vehicleBusy(r); return o ? `<span class="badge b-indigo">Sedang jalan</span><span class="t-sub mono">${esc(o.NoSJ)}</span>` : '<span class="badge b-green">Siap operasi</span>'; }]
    ],
    sections: [
      { t: 'Identitas armada', f: [
        { k: 'NoPol', l: 'No. polisi', req: true, upper: true, mono: true, ph: 'B 9128 UXT' },
        { k: 'JenisKendaraan', l: 'Jenis kendaraan', t: 'select', req: true, opts: JENIS_UNIT },
        { k: 'NoKa', l: 'No. rangka (NoKa)', req: true, upper: true, mono: true },
        { k: 'NoSin', l: 'No. mesin (NoSin)', req: true, upper: true, mono: true },
        { k: 'Merk', l: 'Merk', t: 'list', opts: MERK },
        { k: 'Tipe', l: 'Tipe / model', ph: 'Canter HD 125 PS' },
        { k: 'Tahun', l: 'Tahun pembuatan', t: 'year' },
        { k: 'Warna', l: 'Warna' }] },
      { t: 'Masa berlaku dokumen', note: 'Peringatan muncul sebelum habis dan tidak memblokir pembuatan surat jalan.', f: [
        { k: 'MasaKIR', l: 'Masa berlaku uji KIR', t: 'date', exp: true },
        { k: 'MasaPajak', l: 'Masa berlaku pajak / STNK', t: 'date', exp: true }] },
      { t: 'Penempatan', f: [
        { k: 'Pool', l: 'Pool / domisili', t: 'pool' },
        { k: 'Catatan', l: 'Catatan', t: 'textarea', full: true }] }
    ]
  },
  pengemudi: {
    title: 'Data Master Pengemudi', sub: 'No. KTP disamarkan di daftar; tampil lengkap hanya untuk Super Admin.', icon: 'bi-person-badge', add: 'Tambah pengemudi', list: 'pengemudi',
    canEdit: () => true, canDel: () => isSA(), label: r => r.Nama,
    search: r => [r.Nama, r.Kode, r.NoHP, r.NoSIM, r.Pool].join(' '),
    chips: [['', 'Semua'], ['standby', 'Standby', r => !driverBusy(r)], ['tugas', 'Sedang bertugas', r => !!driverBusy(r)], ['sim', 'SIM perlu tindakan', r => !!driverAlert(r), 'danger']],
    cols: [
      ['Pengemudi', r => `<div class="who"><span class="avatar soft">${esc(initials(r.Nama))}</span><div><span class="t-strong">${esc(r.Nama)}</span><span class="t-sub mono">${esc(r.Kode)}${r.Pool ? ' · ' + esc(r.Pool) : ''}</span></div></div>`, 'card-title'],
      ['No. KTP', r => `<span class="mono" data-ktp="${esc(r.ID)}">${esc(maskKTP(r.NoKTP))}</span>${isSA() ? ` <button class="icon-btn sm" data-reveal="${esc(r.ID)}" title="Tampilkan"><i class="bi bi-eye"></i></button>` : ''}`],
      ['SIM & masa berlaku', r => `<span class="badge b-slate plain">SIM ${esc(r.JenisSIM || '—')}</span> <span class="mono">${esc(r.NoSIM)}</span><span class="t-sub">${expBadge(r.MasaSIM)}</span>`],
      ['Kontak', r => r.NoHP ? `<a class="mono" href="https://wa.me/${waNumber(r.NoHP)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> ${esc(r.NoHP)}</a>` : '—'],
      ['Status operasional', r => { const o = driverBusy(r); const a = driverAlert(r); return o ? `<span class="badge b-indigo">Bertugas</span><span class="t-sub mono">${esc(o.NoSJ)}</span>` : a && a.lvl === 'exp' ? '<span class="badge b-red">SIM perlu diperpanjang</span>' : '<span class="badge b-green">Standby</span>'; }]
    ],
    sections: [
      { t: 'Identitas', f: [
        { k: 'Nama', l: 'Nama lengkap', req: true, full: true },
        { k: 'NoKTP', l: 'No. KTP (NIK)', t: 'ktp', req: true, mono: true, help: 'Disamarkan di daftar; hanya Super Admin yang melihat lengkap.' },
        { k: 'NoHP', l: 'No. HP / WhatsApp', t: 'tel', ph: '0813-8899-7711' }] },
      { t: 'Lisensi mengemudi', f: [
        { k: 'JenisSIM', l: 'Jenis SIM', t: 'select', opts: JENIS_SIM, req: true },
        { k: 'NoSIM', l: 'No. SIM', req: true, mono: true },
        { k: 'MasaSIM', l: 'Masa berlaku SIM', t: 'date', exp: true, full: true, help: 'Tetap dapat ditugaskan; pengingat muncul di Ringkasan.' }] },
      { t: 'Penempatan', f: [{ k: 'Pool', l: 'Pool / domisili operasional', t: 'pool', full: true }] }
    ]
  },
  penerima: {
    title: 'Data Master Penerima', sub: 'Tujuan drop-off pengiriman kendaraan & penerima paket.', icon: 'bi-geo-alt', add: 'Tambah penerima', list: 'penerima',
    canEdit: () => true, canDel: () => isSA(), label: r => r.Nama,
    search: r => [r.Nama, r.Kode, r.Kota, r.Alamat, r.NoHP, r.NamaPIC].join(' '),
    chips: [['', 'Semua'], ['b2b', 'Perusahaan', r => r.TipeEntitas !== 'Perorangan'], ['pribadi', 'Perorangan', r => r.TipeEntitas === 'Perorangan']],
    cols: [
      ['ID', r => `<span class="chip chip-soft mono">${esc(r.Kode)}</span>`, 'card-title'],
      ['Penerima', r => `<span class="t-strong">${esc(r.Nama)}</span><span class="t-sub">${esc(r.TipeEntitas || 'Perusahaan')}${r.NPWP ? ' · NPWP ' + esc(r.NPWP) : ''}</span>`],
      ['PIC & kontak', r => `${esc(r.NamaPIC || '—')}<span class="t-sub mono">${esc(r.NoHP)}</span>`],
      ['Alamat drop-off', r => `<span>${esc(r.Kota || '')}</span><span class="t-sub">${esc(firstPart(r.Alamat))}</span>`],
      ['Jam operasional', r => esc(r.JamOperasional || '—')],
      ['Tarif paket', r => { const t = tarifList(r); return t.length ? `<b>${t.length}</b> kota<span class="t-sub">${esc(t.slice(0, 2).map(x => x.kota || 'Semua kota').join(', '))}${t.length > 2 ? '…' : ''}</span>` : '<span class="muted">—</span>'; }],
      ['Pengiriman', r => `<b class="mono">${S.d.orders.filter(o => o.PenerimaID === r.ID && o.StatusDok === 'Terkonfirmasi').length}</b><span class="t-sub">surat jalan / resi</span>`]
    ],
    sections: [
      { t: 'Identitas penerima', f: [
        { k: 'Nama', l: 'Nama penerima / perusahaan', req: true, full: true, ph: 'Contoh: PT Toyota Astra Motor (Gudang Priok)' },
        { k: 'TipeEntitas', l: 'Tipe entitas', t: 'select', opts: ['Perusahaan', 'Perorangan'] },
        { k: 'NPWP', l: 'NPWP', t: 'npwp', ph: 'Opsional' }] },
      { t: 'Kontak PIC', f: [
        { k: 'NamaPIC', l: 'Nama PIC bongkar' },
        { k: 'NoHP', l: 'No. HP / WhatsApp PIC', t: 'tel', req: true },
        { k: 'JamOperasional', l: 'Jam operasional', ph: '08:00 – 17:00 WIB', full: true }] },
      { t: 'Alamat drop-off', f: [
        { k: 'Kota', l: 'Kota / wilayah', ph: 'Surabaya, Jawa Timur' },
        { k: 'Alamat', l: 'Alamat lengkap', t: 'textarea', req: true, full: true },
        { k: 'Catatan', l: 'Catatan khusus bongkar', t: 'textarea', full: true }] },
      { t: 'Tarif paket (bila ongkos ditanggung penerima)', f: [{ k: 'TarifPaket', t: 'tarif', full: true }] }
    ]
  },
  ekspedisi: {
    title: 'Ekspedisi Rekanan', sub: 'Mitra ekspedisi untuk meneruskan paket. Hanya untuk tim internal, tidak tercetak di dokumen pelanggan.', icon: 'bi-buildings', add: 'Tambah ekspedisi', list: 'ekspedisi',
    canEdit: () => isSA(), canDel: () => isSA(), label: r => r.Nama,
    search: r => [r.Nama, r.Kode, r.PIC, r.NoWA, r.Alamat, r.Catatan, tarifParse(r.Tarif).map(t => t.kota).join(' ')].join(' '),
    chips: [['', 'Semua'], ['towing', 'Towing', r => ekspPunya(r, 'Towing')], ['paket', 'Paket', r => ekspPunya(r, 'Paket')], ['aktif', 'Pernah dipakai', r => S.d.orders.some(o => o.EkspedisiID === r.ID)]],
    cols: [
      ['ID', r => `<span class="chip chip-soft mono">${esc(r.Kode)}</span>`, 'card-title'],
      ['Ekspedisi', r => `<span class="t-strong">${esc(r.Nama)}</span><span class="t-sub">${ekspLayananBadge(r)}</span><span class="t-sub">${r.PIC ? '<i class="bi bi-person"></i> PIC ' + esc(r.PIC) + ' · ' : ''}${esc(firstPart(r.Alamat) || '—')}</span>`],
      ['WhatsApp', r => r.NoWA ? `<a class="mono" href="https://wa.me/${waNumber(r.NoWA)}" target="_blank" rel="noopener">${esc(r.NoWA)}</a>` : '—'],
      [isSA() ? 'Tarif' : 'Kota tujuan', r => { const t = tarifParse(r.Tarif).filter(x => x.kota); return t.length ? `<b class="mono">${t.length}</b><span class="t-sub">${esc(t.slice(0, 3).map(x => x.kota + (x.hari ? ' (' + x.hari + ' hr)' : '')).join(', '))}${t.length > 3 ? ', …' : ''}</span>` : '<span class="muted">—</span>'; }],
      ['Order', r => `<b class="mono">${S.d.orders.filter(o => o.EkspedisiID === r.ID && o.StatusDok === 'Terkonfirmasi').length}</b><span class="t-sub">order diteruskan</span>`]
    ],
    sections: [
      { t: 'Data ekspedisi', f: [
        { k: 'Nama', l: 'Nama ekspedisi', req: true, full: true, ph: 'Contoh: JNE Cargo Cabang Cikarang' },
        { k: 'Layanan', l: 'Layanan rekanan', t: 'layanan', req: true, full: true },
        { k: 'PIC', l: 'Nama PIC', ph: 'Contoh: Pak Hendra' },
        { k: 'NoWA', l: 'No. WhatsApp', t: 'tel', req: true, ph: '08xxxxxxxxxx' },
        { k: 'Alamat', l: 'Alamat (opsional)', t: 'textarea', full: true },
        { k: 'Catatan', l: 'Catatan internal', t: 'textarea', full: true }] },
      { t: 'Tarif & estimasi per kota tujuan', f: [{ k: 'Tarif', t: 'tarif', min: true, full: true }] }
    ]
  },
  rekening: {
    title: 'Master Rekening Bank', icon: 'bi-bank', add: 'Tambah rekening', list: 'rekening', canEdit: () => isSA(), canDel: () => false, label: r => r.Alias,
    sections: [
      { t: 'Rekening', f: [
        { k: 'Bank', l: 'Nama bank / unit kas', t: 'list', req: true, opts: ['BCA', 'Mandiri', 'BRI', 'BNI', 'BSI', 'CIMB Niaga', 'Permata', 'Danamon', 'BTN', 'OCBC', 'Kas Tunai'] },
        { k: 'NoRekening', l: 'Nomor rekening / no. kas', req: true, mono: true },
        { k: 'AtasNama', l: 'Atas nama (sesuai buku tabungan)', req: true, full: true },
        { k: 'Cabang', l: 'Kantor cabang', ph: 'Opsional' },
        { k: 'Alias', l: 'Nama alias (label internal)', req: true, ph: 'Rekening penerima utama' }] },
      { t: 'Kategori penggunaan', f: [
        { k: 'Kategori', l: 'Kategori', t: 'radio', req: true, full: true, opts: [['Penerima Pembayaran', 'Tampil pada invoice dan instruksi transfer pelanggan.'], ['Operasional', 'Pengeluaran operasional: BBM, tol, bengkel, vendor.'], ['Kas Tunai', 'Uang tunai / kas kecil di pool atau kantor.']] },
        { k: 'Aktif', l: 'Rekening aktif', t: 'switch', full: true }] }
    ]
  }
};
function maskKTP(v) { const t = digits(v); if (!t) return String(v || '—'); return t.length >= 8 ? t.slice(0, 4) + ' **** **** ' + t.slice(-4) : '****'; }

function renderMaster(type) {
  const cfg = MASTERS[type], el = $('#page-' + type);
  const st = S.ui.master[type] = Object.assign({ q: '', chip: '', page: 1 }, S.ui.master[type] || {});
  const rows = S.d[cfg.list];
  let extra = '';
  if (type === 'kendaraan') {
    const tindak = rows.filter(r => vehicleAlerts(r).length).length, jalan = rows.filter(r => vehicleBusy(r)).length;
    extra = `<div class="mini-stats"><div><span>Total armada</span><b>${rows.length}</b></div><div><span>Sedang jalan</span><b>${jalan}</b></div><div class="${tindak ? 'warn' : ''}"><span>Perlu tindakan</span><b>${tindak}</b></div></div>`;
  }
  if (type === 'pengemudi') {
    const tugas = rows.filter(r => driverBusy(r)).length, sim = rows.filter(r => driverAlert(r)).length;
    extra = `<div class="mini-stats"><div><span>Terdaftar</span><b>${rows.length}</b></div><div><span>Standby</span><b>${rows.length - tugas}</b></div><div><span>Bertugas</span><b>${tugas}</b></div><div class="${sim ? 'warn' : ''}"><span>SIM perlu tindakan</span><b>${sim}</b></div></div>`;
  }
  if (type === 'pelanggan') extra = `<div class="mini-stats"><div><span>Pelanggan</span><b>${rows.length}</b></div><div><span>Termin</span><b>${rows.filter(r => r.PembayaranBawaan === 'Termin').length}</b></div></div>`;
  if (type === 'penerima') extra = `<div class="mini-stats"><div><span>Penerima</span><b>${rows.length}</b></div><div><span>Perusahaan</span><b>${rows.filter(r => r.TipeEntitas !== 'Perorangan').length}</b></div></div>`;
  el.innerHTML = `
  <div class="page-head">
    <div class="ph-icon"><i class="bi ${cfg.icon}"></i></div>
    <div><h1>${esc(cfg.title)}</h1><p class="muted">${esc(cfg.sub || '')}</p></div>
    ${extra}
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="toolbar">
      <div class="search grow"><i class="bi bi-search"></i><input class="input" data-mq placeholder="Cari ${esc(cfg.title.replace('Data Master ', '').toLowerCase())}…" value="${esc(st.q)}"></div>
      <button class="btn btn-primary" data-madd><i class="bi bi-plus-lg"></i> ${esc(cfg.add)}</button>
    </div>
    <div class="chips-row">${cfg.chips.map(c => `<button class="fchip ${c[3] || ''} ${st.chip === c[0] ? 'active' : ''}" data-chip="${c[0]}">${esc(c[1])}<span class="cnt">${c[2] ? rows.filter(c[2]).length : rows.length}</span></button>`).join('')}</div>
  </div>
  <div class="table-card" data-mtable></div>`;
  el.querySelector('[data-mq]').addEventListener('input', debounce(e => { st.q = e.target.value; st.page = 1; renderMasterTable(type); }, 120));
  el.querySelector('[data-madd]').onclick = () => openMasterModal(type, null);
  el.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { st.chip = b.dataset.chip; st.page = 1; renderMaster(type); });
  renderMasterTable(type);
}
function renderMasterTable(type) {
  const cfg = MASTERS[type], st = S.ui.master[type], el = $('#page-' + type), size = 20;
  const q = st.q.trim().toLowerCase();
  const chip = cfg.chips.find(c => c[0] === st.chip);
  let list = S.d[cfg.list].filter(r => (!q || cfg.search(r).toLowerCase().includes(q)) && (!chip || !chip[2] || chip[2](r)));
  list = list.slice().sort((a, b) => String(cfg.label(a)).localeCompare(String(cfg.label(b))));
  const pages = Math.max(1, Math.ceil(list.length / size)); if (st.page > pages) st.page = pages;
  const rows = list.slice((st.page - 1) * size, st.page * size);
  const wrap = el.querySelector('[data-mtable]');
  wrap.innerHTML = rows.length ? `<div class="table-wrap"><table class="table cards"><thead><tr>${cfg.cols.map(c => `<th>${esc(c[0])}</th>`).join('')}<th class="t-actions">Aksi</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${r._pending ? 'pending' : ''} ${(type === 'kendaraan' && vehicleAlerts(r).some(a => a.lvl === 'exp')) || (type === 'pengemudi' && driverAlert(r) && driverAlert(r).lvl === 'exp') ? 'row-danger' : ''}" data-id="${esc(r.ID)}">${cfg.cols.map(c => `<td class="${c[2] || ''}" data-label="${esc(c[0])}">${c[1](r)}</td>`).join('')}
      <td class="t-actions">${r._pending ? '<span class="spin" style="display:inline-block;width:16px;height:16px;border:2px solid var(--primary);border-right-color:transparent;border-radius:50%;animation:rot .7s linear infinite"></span>' :
        `<button class="icon-btn" data-medit="${esc(r.ID)}" title="${cfg.canEdit(r) ? 'Ubah' : 'Lihat'}"><i class="bi ${cfg.canEdit(r) ? 'bi-pencil' : 'bi-eye'}"></i></button>${cfg.canDel(r) ? `<button class="icon-btn" data-mdel="${esc(r.ID)}" title="Hapus"><i class="bi bi-trash"></i></button>` : ''}`}</td></tr>`).join('')}
  </tbody></table></div><div class="table-foot"><span>Menampilkan ${(st.page - 1) * size + 1}–${(st.page - 1) * size + rows.length} dari ${list.length} data</span>${pagerHTML(list.length, st.page, size, 'pg')}</div>`
    : emptyHTML(S.d[cfg.list].length ? 'bi-search' : cfg.icon, S.d[cfg.list].length ? 'Pencarian tidak ditemukan' : 'Belum ada data', S.d[cfg.list].length ? 'Tidak ada data yang cocok. Coba kata kunci lain.' : 'Tambahkan data pertama agar bisa dipilih di form order.',
      `<br><button class="btn btn-primary" data-madd2><i class="bi bi-plus-lg"></i> ${esc(cfg.add)}</button>`);
  wrap.onclick = e => {
    const pg = e.target.closest('[data-pg]'); if (pg) { st.page = Number(pg.dataset.pg); renderMasterTable(type); return; }
    if (e.target.closest('[data-madd2]')) { openMasterModal(type, null); return; }
    const ed = e.target.closest('[data-medit]'); if (ed) { openMasterModal(type, byId(cfg.list, ed.dataset.medit)); return; }
    const dl = e.target.closest('[data-mdel]'); if (dl) { deleteMaster(type, dl.dataset.mdel); return; }
    const rv = e.target.closest('[data-reveal]'); if (rv) { revealKTP(rv.dataset.reveal, rv); return; }
  };
}
function revealKTP(id, btn) {
  const span = $(`[data-ktp="${CSS.escape(id)}"]`);
  if (span && span.dataset.shown) { span.textContent = maskKTP(byId('pengemudi', id).NoKTP); delete span.dataset.shown; btn.innerHTML = '<i class="bi bi-eye"></i>'; return; }
  btnBusy(btn, true);
  api('revealKTP', S.token, id).then(r => { if (span) { span.textContent = r.data; span.dataset.shown = '1'; } }).catch(fail).finally(() => { btnBusy(btn, false); btn.innerHTML = '<i class="bi bi-eye-slash"></i>'; });
}

/** Modal tambah/ubah data master. opt.onSaved(rec) dipanggil setelah server menyimpan. */
function openMasterModal(type, rec, opt) {
  opt = opt || {};
  const cfg = MASTERS[type];
  const canEdit = !rec || cfg.canEdit(rec);
  const d = Object.assign({ Aktif: 'true', TipeEntitas: 'Perusahaan', JenisSIM: 'B2 Umum' }, rec ? {} : (opt.preset || {}), rec || {});
  const pools = Array.from(new Set(S.d.kendaraan.map(k => k.Pool).concat(S.d.pengemudi.map(x => x.Pool)).filter(Boolean)));
  $('#dlPool').innerHTML = pools.map(p => `<option>${esc(p)}</option>`).join('');
  const thisYear = Number(today().slice(0, 4));
  const fieldHTML = f => {
    const v = d[f.k] === undefined || d[f.k] === null ? '' : String(d[f.k]);
    const ro = !canEdit || (type === 'pengemudi' && f.k === 'NoKTP' && rec && !isSA());
    const cls = `input${f.mono ? ' mono' : ''}${f.upper ? ' upper' : ''}`;
    const attrs = `name="${f.k}" ${ro ? 'readonly disabled' : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}`;
    let ctrl = '';
    if (f.t === 'ids') {
      return `<div class="field full"><div class="readonly" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><i class="bi bi-info-circle muted"></i><span class="muted" style="font-size:12.5px">ID otomatis:</span>
        <span class="chip b-indigo mono"><i class="bi bi-lock"></i> Sewa: ${esc(d.IDSewa || 'CUST-otomatis')}</span><span class="chip b-indigo mono"><i class="bi bi-lock"></i> Kirim: ${esc(d.IDKirim || 'KRM-otomatis')}</span></div></div>`;
    }
    if (f.t === 'layanan') {
      const sel = ekspLayananList(v, !rec);
      const ck = (x, lbl) => `<label class="lyn-chip"><input type="checkbox" data-lyn="${esc(x)}" ${sel.includes(x) ? 'checked' : ''} ${ro ? 'disabled' : ''}><span>${lbl}</span></label>`;
      return `<div class="field full" data-f="${f.k}"><span class="label req">${esc(f.l)}</span><input type="hidden" name="${f.k}" value="${esc(sel.join(', '))}">
        <div class="lyn-grid"><div class="lyn-grp"><small class="muted">Kirim mobil</small>${ck('Towing', '<i class="bi bi-truck-flatbed"></i> Towing')}</div>
        <div class="lyn-grp"><small class="muted">Paket</small>${ck('Paket Darat', 'Darat')}${ck('Paket Laut', 'Laut')}${ck('Paket Udara', 'Udara')}${ck('Paket Kereta', 'Kereta')}</div></div>
        <div class="err-msg" data-err="${f.k}" hidden></div></div>`;
    }
    if (f.t === 'tarif') {
      const rows = tarifParse(v), mn = !!f.min, nh = mn && !isSA();
      const lynCls = mn ? ' ' + ekspTarifCls(ekspLayananList(d.Layanan, !rec)) : '';
      return `<div class="field full" data-f="${f.k}"><input type="hidden" name="${f.k}" value="${esc(v)}" data-tf-hidden>
        <small class="muted" style="margin-bottom:6px">${nh ? 'Kota tujuan & estimasi lama kirim. Harga ekspedisi hanya dapat dilihat dan diisi Super Admin.' : mn ? 'Tarif dari ekspedisi ke kita (biaya modal, hanya Super Admin yang melihat harga). Tampil sebagai perkiraan biaya saat ekspedisi dipilih di Form Kirim Paket. Estimasi hari (mis. 3-5) juga tampil untuk Admin. Kosongkan nama kota untuk tarif umum (semua kota).' : 'Terisi otomatis di Form Kirim Paket sesuai kota tujuan. Kosongkan nama kota untuk tarif umum (semua kota).'}</small>
        <div class="tf-table${mn ? ' tf-min' : ''}${nh ? ' tf-nohrg' : ''}${lynCls}" data-tf-table${mn ? ' data-tf-min' : ''}${nh ? ' data-tf-nohrg' : ''}>
          <div class="tf-row tf-head"><span>Kota tujuan</span>${nh ? '' : `<span class="tc-pk">Harga per kg (Rp)</span><span class="tc-pk">Harga per m³ (Rp)</span>${mn ? '<span class="tc-pk">Harga minimal (Rp)</span><span class="tc-tw">Towing per unit (Rp)</span>' : ''}`}${mn ? '<span>Estimasi (hari)</span>' : ''}<span></span></div>
          ${(rows.length ? rows : [{}]).map(t => tarifRowHTML(t, ro, mn, nh)).join('')}
        </div>
        ${ro ? '' : '<button type="button" class="btn btn-secondary btn-sm" data-tf-add style="margin-top:8px;justify-self:start"><i class="bi bi-plus-lg"></i> Tambah kota</button>'}
        <div class="err-msg" data-err="${f.k}" hidden></div></div>`;
    }
    if (f.t === 'textarea') ctrl = `<textarea class="${cls}" ${attrs} rows="2">${esc(v)}</textarea>`;
    else if (f.t === 'select') ctrl = `<select class="${cls}" ${attrs}>${f.opts.map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(f.optLabel ? f.optLabel(o) : o)}</option>`).join('')}</select>`;
    else if (f.t === 'year') ctrl = `<select class="${cls}" ${attrs}><option value="">Pilih tahun</option>${Array.from({ length: thisYear - 1979 }, (_, i) => thisYear + 1 - i).map(y => `<option ${String(y) === v ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
    else if (f.t === 'list') { ctrl = `<input class="${cls}" ${attrs} list="dl_${f.k}" value="${esc(v)}"><datalist id="dl_${f.k}">${f.opts.map(o => `<option>${esc(o)}</option>`).join('')}</datalist>`; }
    else if (f.t === 'pool') ctrl = `<input class="${cls}" ${attrs} list="dlPool" value="${esc(v)}" placeholder="Pool Cakung">`;
    else if (f.t === 'radio') ctrl = `<div class="radio-cards">${f.opts.map(([o, h]) => `<label><input type="radio" name="${f.k}" value="${esc(o)}" ${o === v ? 'checked' : ''} ${ro ? 'disabled' : ''}><span><b>${esc(o)}</b><small>${esc(h)}</small></span></label>`).join('')}</div>`;
    else if (f.t === 'switch') return `<div class="field full"><div class="readonly" style="display:flex;justify-content:space-between;align-items:center"><span><b>${esc(f.l)}</b><br><small class="muted">Rekening nonaktif tidak muncul di pilihan pembayaran.</small></span><label class="switch"><input type="checkbox" name="${f.k}" ${v !== 'false' ? 'checked' : ''} ${ro ? 'disabled' : ''}><span></span></label></div></div>`;
    else {
      const type2 = f.t === 'date' ? 'date' : f.t === 'email' ? 'email' : f.t === 'tel' ? 'tel' : 'text';
      const im = f.t === 'number' || f.t === 'ktp' ? 'inputmode="numeric"' : f.t === 'tel' ? 'inputmode="tel"' : '';
      const showV = type === 'pengemudi' && f.k === 'NoKTP' && rec && !isSA() ? maskKTP(v) : v;
      ctrl = `<input class="${cls}" type="${type2}" ${im} ${attrs} value="${esc(showV)}" ${f.t === 'ktp' ? 'maxlength="20"' : ''}>`;
    }
    const expChip = f.exp ? `<span class="badge plain" data-exp="${f.k}"></span>` : '';
    return `<div class="field ${f.full ? 'full' : ''}" data-f="${f.k}" ${f.show && !f.show(d) ? 'hidden' : ''}>
      <div class="label-row"><span class="label ${f.req ? 'req' : ''}">${esc(f.l)}</span>${expChip}${f.t === 'npwp' ? '<span class="badge plain" data-npwp></span>' : ''}</div>
      ${ctrl}${f.help ? `<small class="muted">${esc(f.help)}</small>` : ''}<div class="err-msg" data-err="${f.k}" hidden></div></div>`;
  };
  const body = `<form id="masterForm" novalidate>${cfg.sections.map(s => `<div class="sec-title">${esc(s.t)}</div>${s.note ? `<div class="alert alert-warning"><i class="bi bi-info-circle"></i><div>${esc(s.note)}</div></div>` : ''}<div class="row-2 mf-grid">${s.f.map(fieldHTML).join('')}</div>`).join('')}</form>`;
  openModal({
    title: (rec ? (canEdit ? 'Ubah ' : 'Detail ') : 'Tambah ') + cfg.title.replace('Data Master ', '').replace('Master ', '').toLowerCase(),
    sub: rec ? cfg.label(rec) : 'Data baru langsung bisa dipilih di form order.', icon: cfg.icon, size: 'lg', body,
    foot: `<span class="mf-note"><i class="bi bi-shield-check"></i> Tersimpan ke Google Sheets</span><button class="btn btn-secondary" data-close>${canEdit ? 'Batal' : 'Tutup'}</button>${canEdit ? `<button class="btn btn-primary" id="mfSave"><i class="bi bi-check2"></i> Simpan</button>` : ''}`
  });
  $$('.mf-grid .field.full').forEach(f => f.style.gridColumn = '1 / -1');
  const form = $('#masterForm');
  const live = () => {
    const vals = formValues(form);
    cfg.sections.forEach(s => s.f.forEach(f => { if (f.show) { const box = form.querySelector(`[data-f="${f.k}"]`); if (box) box.hidden = !f.show(vals); } }));
    form.querySelectorAll('[data-exp]').forEach(b => {
      const x = expInfo(vals[b.dataset.exp]);
      b.className = 'badge plain ' + (x.lvl === 'exp' ? 'b-red' : x.lvl === 'warn' ? 'b-amber' : x.lvl === 'ok' ? 'b-green' : '');
      b.textContent = x.lvl === 'none' ? '' : x.lvl === 'ok' ? 'Berlaku' : x.text;
    });
    const np = form.querySelector('[data-npwp]');
    if (np) { const n = digits(vals.NPWP).length; np.className = 'badge plain ' + (!n ? '' : (n === 15 || n === 16) ? 'b-green' : 'b-red'); np.textContent = !n ? '' : (n === 15 || n === 16) ? 'Format valid: ' + n + ' digit' : n + ' digit (harus 15/16)'; }
  };
  form.addEventListener('input', live); form.addEventListener('change', live); live();
  if (type === 'pelanggan' || type === 'penerima' || type === 'ekspedisi') bindTarifEditor(form);
  if (type === 'ekspedisi') bindLayananEksp(form);
  const save = $('#mfSave');
  if (save) save.onclick = e => { e.preventDefault(); submitMaster(type, rec, form, save, opt); };
}
// ── Tarif paket pelanggan: [{kota, kg, m3}] · ekspedisi: [{kota, kg, m3, min}] ──
function tarifParse(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function tarifList(p) { return tarifParse(p && p.TarifPaket); }
function cariTarifDi(list, kota) {
  const k = String(kota || '').trim().toLowerCase();
  return (k && list.find(t => String(t.kota || '').trim().toLowerCase() === k)) || list.find(t => !String(t.kota || '').trim()) || null;
}
function cariTarif(p, kota) {
  const list = tarifList(p), k = String(kota || '').trim().toLowerCase();
  return (k && list.find(t => String(t.kota || '').trim().toLowerCase() === k)) || list.find(t => !String(t.kota || '').trim()) || null;
}
function tarifRowHTML(t, ro, mn, nh) {
  const m = v => (num(v) ? num(v).toLocaleString('id-ID') : '');
  const cell = (k, lbl, inner) => `<span class="tf-cell" data-c="${k}"><small>${lbl}</small>${inner}</span>`;
  const uang = (k, ph, lbl) => cell(k, lbl, `<input class="input t-right" data-tf="${k}" inputmode="numeric" placeholder="${ph}" title="${lbl}" value="${m(t[k])}" ${ro ? 'readonly' : ''}>`);
  const hari = mn ? cell('hari', 'Estimasi (hari)', `<input class="input t-right" data-tf="hari" maxlength="20" placeholder="mis. 3-5" title="Estimasi lama kirim (hari)" value="${esc(t.hari || '')}" ${ro ? 'readonly' : ''}>`) : '';
  const del = ro ? '<span class="tf-del"></span>' : '<button type="button" class="icon-btn tf-del" data-tf-del title="Hapus kota" aria-label="Hapus kota"><i class="bi bi-trash"></i></button>';
  const kota = `<input class="input tf-kota" data-tf="kota" maxlength="60" placeholder="Semua kota" value="${esc(t.kota || '')}" ${ro ? 'readonly' : ''}>`;
  if (nh) return `<div class="tf-row" data-tf-row>${kota}${hari}${del}</div>`;
  return `<div class="tf-row" data-tf-row>${kota}${uang('kg', mn ? 'per kg' : '0', 'Harga per kg')}${uang('m3', mn ? 'per m³' : '0', 'Harga per m³')}${mn ? uang('min', 'minimal', 'Harga minimal') + uang('unit', 'per unit', 'Towing per unit') : ''}${hari}${del}</div>`;
}
function bindTarifEditor(form) {
  const table = form.querySelector('[data-tf-table]'), hidden = form.querySelector('[data-tf-hidden]');
  if (!table) return;
  const mn = table.hasAttribute('data-tf-min'), nh = table.hasAttribute('data-tf-nohrg');
  const val = (r, k) => { const i = r.querySelector(`[data-tf=${k}]`); return i ? i.value : ''; };
  const sync = () => {
    const rows = $$('[data-tf-row]', table).map(r => {
      const o = { kota: val(r, 'kota').trim(), kg: num(val(r, 'kg')), m3: num(val(r, 'm3')) };
      if (mn) { o.min = num(val(r, 'min')); o.unit = num(val(r, 'unit')); o.hari = val(r, 'hari').trim(); }
      return o;
    }).filter(t => t.kota || t.kg || t.m3 || t.min || t.unit || t.hari);
    hidden.value = rows.length ? JSON.stringify(rows) : '';
  };
  table.addEventListener('input', e => { if (['kg', 'm3', 'min', 'unit'].includes(e.target.dataset.tf)) formatMoneyInput(e.target); sync(); });
  form.addEventListener('click', e => {
    if (e.target.closest('[data-tf-add]')) { table.insertAdjacentHTML('beforeend', tarifRowHTML({}, false, mn, nh)); const r = $$('[data-tf-row]', table); r[r.length - 1].querySelector('[data-tf=kota]').focus(); }
    const del = e.target.closest('[data-tf-del]');
    if (del) { const rows = $$('[data-tf-row]', table); if (rows.length > 1) del.closest('[data-tf-row]').remove(); else rows[0].querySelectorAll('input').forEach(i => { i.value = ''; }); sync(); }
  });
}
function formValues(form) {
  const v = {};
  form.querySelectorAll('[name]').forEach(el => {
    if (el.type === 'radio') { if (el.checked) v[el.name] = el.value; else if (!(el.name in v)) v[el.name] = ''; }
    else if (el.type === 'checkbox') v[el.name] = el.checked ? 'true' : 'false';
    else v[el.name] = el.value.trim();
  });
  return v;
}
function validateMasterLocal(type, v, rec) {
  const cfg = MASTERS[type], errs = {};
  cfg.sections.forEach(s => s.f.forEach(f => { if (f.req && (!f.show || f.show(v)) && !String(v[f.k] || '').trim() && !(type === 'pengemudi' && f.k === 'NoKTP' && rec && !isSA())) errs[f.k] = f.l + ' wajib diisi.'; }));
  const others = S.d[cfg.list].filter(r => !rec || r.ID !== rec.ID);
  if (v.Email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.Email)) errs.Email = 'Format email tidak valid.';
  if (v.NPWP) { const n = digits(v.NPWP); if (n.length !== 15 && n.length !== 16) errs.NPWP = 'NPWP harus 15 atau 16 digit.'; else if (type === 'pelanggan' && others.some(r => digits(r.NPWP) === n)) errs.NPWP = 'NPWP sudah terdaftar untuk pelanggan lain.'; }
  if (type === 'kendaraan' && v.NoPol) { const p = normPlate(v.NoPol); const dup = others.find(r => normPlate(r.NoPol) === p); if (dup) errs.NoPol = 'No. polisi sudah terdaftar (' + dup.Kode + ').'; }
  if (type === 'pengemudi') {
    if (v.NoKTP && (!rec || isSA()) && digits(v.NoKTP).length !== 16) errs.NoKTP = 'No. KTP harus 16 digit.';
    const sim = digits(v.NoSIM); const dup = sim && others.find(r => digits(r.NoSIM) === sim);
    if (dup) errs.NoSIM = 'No. SIM sudah terdaftar atas nama ' + dup.Nama + ' (' + dup.Kode + ').';
  }
  if (type === 'pelanggan' && v.PembayaranBawaan === 'Termin' && !(num(v.TerminHari) > 0)) errs.TerminHari = 'Isi jumlah hari termin.';
  const tk = type === 'ekspedisi' ? 'Tarif' : (type === 'pelanggan' || type === 'penerima') ? 'TarifPaket' : '';
  if (tk) { const ks = tarifParse(v[tk]).map(t => String(t.kota || '').trim().toLowerCase()); const dup = ks.find((k, i) => ks.indexOf(k) !== i); if (dup !== undefined) errs[tk] = 'Kota "' + (dup || 'Semua kota') + '" tercantum dua kali.'; }
  return errs;
}
function submitMaster(type, rec, form, btn, opt) {
  const cfg = MASTERS[type], v = formValues(form);
  form.querySelectorAll('.err-msg').forEach(e => { e.hidden = true; });
  form.querySelectorAll('.invalid').forEach(e => e.classList.remove('invalid'));
  const errs = validateMasterLocal(type, v, rec);
  if (Object.keys(errs).length) {
    Object.entries(errs).forEach(([k, m]) => { const em = form.querySelector(`[data-err="${k}"]`); if (em) { em.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${esc(m)}`; em.hidden = false; } const inp = form.querySelector(`[name="${k}"]`); if (inp) inp.classList.add('invalid'); });
    const first = form.querySelector('.invalid'); if (first) first.focus();
    return;
  }
  if (rec) v.ID = rec.ID;
  if (type === 'kendaraan') v.NoPol = normPlate(v.NoPol);
  // Dari form order: tunggu ID asli dari server agar bisa langsung dipilih
  if (opt.onSaved || S.page !== type) {
    btnBusy(btn, true, 'Menyimpan…');
    api('saveMaster', S.token, type, v).then(r => {
      upsert(cfg.list, r.data); saveCache(); closeModal(); ok(r.message);
      if (opt.onSaved) opt.onSaved(r.data);
      if (S.page === type) renderMaster(type);
      if (S.page === 'pengaturan') renderPengaturan();
      updateBadges();
    }).catch(err => fail(err, 'Gagal menyimpan')).finally(() => btnBusy(btn, false));
    return;
  }
  // Halaman master: optimistic, baris langsung muncul
  const tempId = rec ? rec.ID : 'tmp-' + Date.now();
  const backup = rec ? Object.assign({}, rec) : null;
  upsert(cfg.list, Object.assign({}, rec || {}, v, { ID: tempId, _pending: true, Kode: (rec && rec.Kode) || '…', IDSewa: (rec && rec.IDSewa) || '…', IDKirim: (rec && rec.IDKirim) || '…' }));
  closeModal(); renderMaster(type);
  api('saveMaster', S.token, type, v).then(r => {
    removeFrom(cfg.list, tempId); upsert(cfg.list, r.data); saveCache(); updateBadges();
    if (S.page === type) renderMaster(type);
    ok(r.message, cfg.label(r.data));
  }).catch(err => {
    removeFrom(cfg.list, tempId); if (backup) upsert(cfg.list, backup);
    if (S.page === type) renderMaster(type);
    fail(err, 'Gagal menyimpan');
    openMasterModal(type, rec, opt);
    const f = $('#masterForm'); if (f) Object.entries(v).forEach(([k, val]) => { const el = f.querySelector(`[name="${k}"]`); if (el && el.type !== 'radio' && el.type !== 'checkbox') el.value = val; });
  });
}
function deleteMaster(type, id) {
  const cfg = MASTERS[type], rec = byId(cfg.list, id); if (!rec) return;
  confirmDialog({ title: 'Hapus ' + cfg.label(rec) + '?', text: 'Data yang sudah dipakai di order tidak dapat dihapus.', variant: 'danger', icon: 'bi-trash', ok: 'Hapus' }).then(v => {
    if (v !== true) return;
    removeFrom(cfg.list, id); renderMaster(type);
    api('deleteMaster', S.token, type, id).then(() => { saveCache(); updateBadges(); ok('Data dihapus'); })
      .catch(err => { upsert(cfg.list, rec); renderMaster(type); fail(err, 'Tidak dapat menghapus'); });
  });
}

// ============================================================
// KOMBO (pilihan dengan pencarian)
// ============================================================
const COMBO_SRC = {
  pelanggan: () => S.d.pelanggan.map(p => ({ id: p.ID, label: p.Nama, sub: `${p.IDSewa}${p.IDKirim !== p.IDSewa ? ' · ' + p.IDKirim : ''}${p.Tipe === 'Corporate' ? ' · Corporate' + (p.Marketing ? ' (' + p.Marketing + ')' : '') : ''}${p.NoHP ? ' · ' + p.NoHP : ''}`, key: [p.Nama, p.IDSewa, p.IDKirim, p.NoHP].join(' ') })),
  kendaraan: () => S.d.kendaraan.map(k => { const a = vehicleAlerts(k); return { id: k.ID, label: k.NoPol + ' — ' + (k.JenisKendaraan || ''), sub: `${[k.Merk, k.Tipe].filter(Boolean).join(' ')}${k.Pool ? ' · ' + k.Pool : ''}${vehicleBusy(k) ? ' · sedang jalan' : ''}${a.length ? ' · ⚠ ' + a.map(x => x.jenis + ' ' + x.text.toLowerCase()).join(', ') : ''}`, key: [k.NoPol, k.Merk, k.Tipe, k.JenisKendaraan, k.Kode].join(' ') }; }),
  pengemudi: () => S.d.pengemudi.map(d => { const a = driverAlert(d); return { id: d.ID, label: d.Nama, sub: `${d.Kode} · SIM ${d.JenisSIM || ''}${driverBusy(d) ? ' · bertugas' : ' · standby'}${a ? ' · ⚠ SIM ' + a.text.toLowerCase() : ''}`, key: [d.Nama, d.Kode, d.NoHP].join(' ') }; }),
  ekspedisi: () => S.d.ekspedisi.filter(e => ekspPunya(e, 'Paket')).map(e => ({ id: e.ID, label: e.Nama, sub: `${e.Kode}${e.PIC ? ' · ' + e.PIC : ''}${e.NoWA ? ' · WA ' + e.NoWA : ''}`, key: [e.Nama, e.Kode, e.PIC, e.NoWA].join(' ') })),
  ekspTowing: () => S.d.ekspedisi.filter(e => ekspPunya(e, 'Towing')).map(e => ({ id: e.ID, label: e.Nama, sub: `${e.Kode}${e.PIC ? ' · ' + e.PIC : ''}${e.NoWA ? ' · WA ' + e.NoWA : ''}`, key: [e.Nama, e.Kode, e.PIC, e.NoWA].join(' ') })),
  penerima: () => S.d.penerima.map(p => ({ id: p.ID, label: p.Nama, sub: `${p.Kode}${p.Kota ? ' · ' + p.Kota : ''}${p.NamaPIC ? ' · PIC ' + p.NamaPIC : ''}`, key: [p.Nama, p.Kode, p.Kota, p.NamaPIC].join(' ') })),
  orderKirim: () => sortOrders(S.d.orders.filter(o => o.Layanan === 'kirim' && o.Status !== 'Dibatalkan')).map(o => ({ id: o.ID, label: orderLabel(o) + ' — ' + (o.NoPolMobil || 'tanpa nopol'), sub: `${o.NamaPelanggan || '—'}${o.Merk ? ' · ' + o.Merk + ' ' + (o.Tipe || '') : ''} · inspeksi: ${o.StatusInspeksi || 'belum'}`, key: [o.NoSJ, o.NoUnik, o.NoPolMobil, o.NamaPelanggan, o.Merk].join(' ') }))
};
function initCombo(el, onPick) {
  const src = el.dataset.combo, input = el.querySelector('.combo-input'), hidden = el.querySelector('input[type=hidden]');
  const list = document.createElement('div'); list.className = 'combo-list'; list.hidden = true; list.setAttribute('role', 'listbox');
  const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'combo-clear'; clear.innerHTML = '<i class="bi bi-x-lg"></i>'; clear.hidden = true; clear.setAttribute('aria-label', 'Kosongkan');
  el.appendChild(clear); el.appendChild(list);
  input.setAttribute('role', 'combobox'); input.setAttribute('autocomplete', 'off');
  let items = [], active = 0;
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const all = COMBO_SRC[src]();
    const sel = all.find(i => i.id === hidden.value);
    const filt = (sel && input.value === sel.label) || !q ? all : all.filter(i => (i.key || i.label).toLowerCase().includes(q));
    items = filt.slice(0, 60); active = 0;
    list.innerHTML = items.length ? items.map((it, i) => `<div class="combo-opt${i === 0 ? ' active' : ''}" role="option" data-i="${i}"><b>${esc(it.label)}</b><small>${esc(it.sub || '')}</small></div>`).join('') +
      (filt.length > 60 ? `<div class="combo-empty">${filt.length - 60} data lain — ketik untuk mempersempit</div>` : '')
      : `<div class="combo-empty">Tidak ditemukan.${el.closest('.field') && el.closest('.field').querySelector('[data-add]') ? ' Gunakan tombol "Tambah" di atas.' : ''}</div>`;
    list.hidden = false;
  };
  const pick = it => { setValue(it ? it.id : ''); list.hidden = true; if (onPick) onPick(hidden.value, el); };
  const setValue = id => {
    hidden.value = id || '';
    const it = id ? COMBO_SRC[src]().find(i => i.id === id) : null;
    input.value = it ? it.label : '';
    el.classList.toggle('has-value', !!it);
    clear.hidden = !it || input.readOnly || (el.closest('.locked') !== null && !el.closest('.no-lock'));
  };
  el._set = setValue;
  input.addEventListener('focus', () => { if (!input.readOnly) { input.select(); draw(); } });
  input.addEventListener('input', debounce(draw, 60));
  input.addEventListener('keydown', e => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))); $$('.combo-opt', list).forEach(o => o.classList.toggle('active', Number(o.dataset.i) === active)); const a = list.querySelector('.combo-opt.active'); if (a) a.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[active]) pick(items[active]); }
    else if (e.key === 'Escape') { list.hidden = true; }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    list.hidden = true;
    const it = hidden.value ? COMBO_SRC[src]().find(i => i.id === hidden.value) : null;
    if (!input.value.trim() && hidden.value) pick(null); else input.value = it ? it.label : '';
  }, 160));
  list.addEventListener('mousedown', e => { const o = e.target.closest('.combo-opt'); if (o) { e.preventDefault(); pick(items[Number(o.dataset.i)]); } });
  clear.onclick = () => { pick(null); input.focus(); };
}
function comboSet(el, id) { if (el && el._set) el._set(id); }

// ============================================================
// FORM ORDER (Sewa & Kirim)
// ============================================================
const FORMS = {};
const MONEY = ['Harga', 'Pajak', 'Penyesuaian', 'DP'];
const METODE_PAKET = [['Lunas', 'Lunas'], ['Termin', 'Invoice (termin)'], ['Invoice Surat Kembali', 'Invoice surat kembali']];
const FORM_SEL = { sewa: '#formSewa', kirim: '#formKirim', paket: '#formPaket' };
const REQ = {
  paket: [['PelangganID', 'Pelanggan'], ['KodePelanggan', 'ID pelanggan'], ['PengirimNama', 'Nama pengirim'], ['PengirimHP', 'No. HP pengirim'], ['PengirimAlamat', 'Alamat pengirim'], ['PenerimaNama', 'Nama penerima'], ['PenerimaHP', 'No. HP penerima'], ['KotaTujuan', 'Kota tujuan'], ['PenerimaAlamat', 'Alamat penerima'], ['Pembayaran', 'Metode pembayaran'], ['Harga', 'Ongkos kirim']],
  sewa: [['PelangganID', 'Pelanggan'], ['KodePelanggan', 'ID pelanggan'], ['MuatPIC', 'Nama PIC muat'], ['MuatHP', 'No. HP PIC muat'], ['MuatAlamat', 'Alamat muat'], ['BongkarPIC', 'Nama PIC bongkar'], ['BongkarHP', 'No. HP PIC bongkar'], ['BongkarAlamat', 'Alamat bongkar'], ['JenisKendaraan', 'Jenis kendaraan'], ['KendaraanID', 'Unit kendaraan'], ['PengemudiID', 'Pengemudi'], ['JenisMuatan', 'Jenis muatan'], ['Pembayaran', 'Metode pembayaran'], ['Harga', 'Harga']],
  kirim: [['PelangganID', 'Pelanggan'], ['KodePelanggan', 'ID pelanggan'], ['JenisLayanan', 'Jenis layanan'], ['PenerimaID', 'Penerima'], ['NoPolMobil', 'No. polisi'], ['Warna', 'Warna'], ['Merk', 'Merk'], ['Tahun', 'Tahun pembuatan'], ['Pembayaran', 'Metode pembayaran'], ['Harga', 'Harga']]
};
function payBlockHTML(lay) {
  return `<div class="card-h"><span class="num">${({ sewa: '3', kirim: '04', paket: '4' })[lay]}</span><div><h3>Rincian pembayaran &amp; tarif</h3><p>Nominal hanya tercetak bila memilih <b>cetak dengan nominal</b>.</p></div></div>
  <div class="row-2">
    <label class="field"><span class="label req">Metode pembayaran</span><select class="input" name="Pembayaran"><option value="">Pilih metode</option>${lay === 'paket' ? METODE_PAKET.map(([v, l]) => `<option value="${v}">${l}</option>`).join('') : METODE.map(m => `<option>${m}</option>`).join('')}</select></label>
    <label class="field" data-pay="hari" hidden><span class="label req" data-pay-hari-label>Jumlah hari termin</span><input class="input" name="TerminHari" inputmode="numeric" placeholder="14" maxlength="3"></label>
  </div>
  <div class="pay-hint" data-pay="due" hidden></div>
  <div class="pay-box" data-pay="dp" hidden>
    <div class="row-2">
      <label class="field"><span class="label req">DP diterima</span><div class="prefix-input"><span>Rp</span><input class="input money" name="DP" inputmode="numeric" placeholder="0"></div></label>
      <div class="field"><span class="label">Sisa tagihan</span><div class="readonly mono" data-calc="Sisa">Rp 0</div></div>
    </div>
  </div>
  <div class="row-2">
    <label class="field"><span class="label req">${lay === 'paket' ? 'Ongkos kirim' : 'Harga dasar'} <span class="pay-auto" data-harga-auto hidden>· otomatis dari tarif</span></span><div class="prefix-input"><span>Rp</span><input class="input money" name="Harga" inputmode="numeric" placeholder="0"></div></label>
    <div class="field"><label class="label" for="pp-${lay}">Pajak <small class="muted">(% dari harga dasar)</small></label><div class="suffix-input"><input class="input" id="pp-${lay}" name="PajakPersen" inputmode="decimal" placeholder="0" maxlength="6" autocomplete="off"><span>%</span></div>
      <input type="hidden" name="Pajak"><div class="tax-row"><small class="muted mono" data-calc="PajakRp">= Rp 0</small><span class="tax-chips">${['0', '1,1', '2', '11'].map(v => `<button type="button" class="chip-btn" data-pajak="${v}">${v}%</button>`).join('')}</span></div></div>
  </div>
  <div class="dh-box" data-dh>
    <div class="dh-top"><button type="button" class="btn btn-secondary btn-sm" data-dh-pick><i class="bi bi-tags"></i> Pilih dari daftar harga</button>
      <label class="check-row dh-save"><input type="checkbox" data-dh-save> <span>Simpan ke daftar harga <span class="badge b-slate plain">Reguler</span></span></label></div>
    <div class="dh-src" data-dh-src hidden></div>
    <div class="dh-fields" data-dh-fields hidden>
      <div class="row-3">
        <label class="field"><span class="label">Asal (kota)</span><input class="input" data-dh-f="asal" maxlength="80" placeholder="mis. Jakarta"></label>
        <label class="field"><span class="label req">Tujuan (kota)</span><input class="input" data-dh-f="tujuan" maxlength="80" placeholder="mis. Surabaya"></label>
        <label class="field"><span class="label">${lay === 'paket' ? 'Jenis / jalur' : 'Armada / jenis'}</span><input class="input" data-dh-f="armada" maxlength="80"></label>
      </div>
      ${lay === 'paket' ? '<label class="field"><span class="label">Harga minimal (opsional)</span><div class="prefix-input"><span>Rp</span><input class="input" data-dh-f="min" inputmode="numeric" placeholder="0"></div></label>' : ''}
      <small class="muted"><i class="bi bi-info-circle"></i> Disimpan saat order disimpan. ${lay === 'paket' ? 'Tarif per kg / per m³' : 'Harga dasar'} order ini menjadi harga Reguler; bila rute + armada sudah ada, harganya diperbarui.</small>
    </div>
  </div>
  <label class="field"><span class="label">Penyesuaian tarif <small class="muted">(boleh minus untuk diskon)</small></span><div class="prefix-input"><span>Rp</span><input class="input money" name="Penyesuaian" inputmode="numeric" placeholder="0"></div></label>
  <div class="pay-total"><div><span class="label">Total tagihan</span><br><span data-calc="TotalText">Harga + pajak + penyesuaian</span></div><b data-calc="Total">Rp 0</b></div>
  <label class="field"><span class="label">Rekening pembayaran</span><select class="input" name="RekeningID"></select><small class="muted"><i class="bi bi-printer"></i> Tercetak hanya pada surat jalan dengan nominal.</small></label>
  <label class="field"><span class="label">Catatan internal</span><textarea class="input" name="Catatan" rows="2" maxlength="500" placeholder="Tidak tercetak"></textarea></label>`;
}
function actionBarHTML(lay) {
  return `<div class="ab-info"><span class="dot" data-ab="dot"></span><span data-ab="info">Belum disimpan</span></div>
    <button type="button" class="btn btn-ghost" data-act="reset"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
    <button type="button" class="btn btn-indigo" data-act="draft"><i class="bi bi-save"></i> <span>Simpan draf</span></button>
    <button type="button" class="btn btn-primary" data-act="confirm"><i class="bi bi-check2-circle"></i> Konfirmasi order (kunci)</button>
    <div class="split dd-wrap pos-rel" data-ab="print" hidden>
      <button type="button" class="btn btn-primary" data-act="print-tanpa"><i class="bi bi-printer"></i> ${lay === 'paket' ? 'Cetak resi' : 'Cetak surat jalan'}</button>
      <button type="button" class="btn btn-primary caret" data-act="print-menu" aria-label="Pilihan cetak"><i class="bi bi-chevron-up"></i></button>
      <div class="menu dd-menu" style="bottom:calc(100% + 6px);top:auto" hidden>
        <button type="button" data-act="print-tanpa"><i class="bi bi-file-earmark"></i> Cetak tanpa nominal (bawaan)</button>
        <button type="button" data-act="print-nominal"><i class="bi bi-cash-stack"></i> Cetak dengan nominal</button>
        ${lay === 'kirim' ? '<button type="button" data-act="print-tt"><i class="bi bi-receipt-cutoff"></i> Tanda terima pengiriman</button>' : ''}
      </div>
    </div>`;
}
function initForms() {
  if (initForms.done) { ORDER_PAGES.forEach(refreshFormLists); return; }
  initForms.done = true;
  ORDER_PAGES.forEach(setupForm);
  setupInspeksi();
}
function setupForm(lay) {
  const form = $(FORM_SEL[lay]);
  const st = FORMS[lay] = { el: form, rec: null, dirty: false };
  form.querySelector('[name=Status]').innerHTML = STATUS.map(s => `<option>${s}</option>`).join('');
  if (lay === 'sewa') form.querySelector('[name=JenisKendaraan]').innerHTML = '<option value="">Pilih jenis</option>' + JENIS_KENDARAAN.map(j => `<option>${j}</option>`).join('');
  else if (lay === 'kirim') {
    form.querySelector('[name=JenisLayanan]').innerHTML = '<option value="">Pilih layanan</option>' + LAYANAN_KIRIM.map(j => `<option>${j}</option>`).join('');
    form.querySelector('[name=Merk]').innerHTML = '<option value="">Pilih merk</option>' + MERK.map(j => `<option>${j}</option>`).join('');
    const y = Number(today().slice(0, 4));
    form.querySelector('[name=Tahun]').innerHTML = '<option value="">Pilih tahun</option>' + Array.from({ length: y + 2 - 1880 }, (_, i) => y + 1 - i).map(v => `<option>${v}</option>`).join('');
  }
  form.querySelector('[data-pay-block]').innerHTML = payBlockHTML(lay);
  form.querySelector('[data-actionbar]').innerHTML = actionBarHTML(lay);
  setupDaftarHargaBox(lay);
  form.querySelectorAll('.combo').forEach(c => initCombo(c, (id, el) => onComboPick(lay, el.dataset.target, id)));
  refreshFormLists(lay);

  form.addEventListener('click', e => {
    if (lay === 'paket' && e.target.closest('[data-eksp-save]')) { simpanEkspedisi(lay); return; }
    const md = e.target.closest('[data-moda]');
    if (md && lay === 'kirim') { if (!form.classList.contains('locked')) gantiModa(md.dataset.moda); return; }
    if (lay === 'paket' && !form.classList.contains('locked')) {
      if (e.target.closest('[data-it-add]')) { addItemRow(lay); return; }
      const del = e.target.closest('[data-it-del]'); if (del) { removeItemRow(lay, Number(del.dataset.itDel)); return; }
      const ds = e.target.closest('[data-dasar]'); if (ds) { form.querySelector('[name=DasarTarif]').value = ds.dataset.dasar; markDirty(lay); recalc(lay); return; }
      const jl = e.target.closest('[data-jalur]'); if (jl) { form.querySelector('[name=Jalur]').value = jl.dataset.jalur; markDirty(lay); recalc(lay); return; }
      const by = e.target.closest('[data-bayar]'); if (by) { form.querySelector('[name=Pembayar]').value = by.dataset.bayar; updateKotaList(lay); applyTarif(lay); markDirty(lay); recalc(lay); return; }
    }
    const b = e.target.closest('[data-pajak]'); if (!b || form.classList.contains('locked')) return;
    const inp = form.querySelector('[name=PajakPersen]'); inp.value = b.dataset.pajak; inp.classList.remove('invalid');
    markDirty(lay); recalc(lay);
  });
  form.addEventListener('input', e => {
    if (e.target.classList.contains('money')) formatMoneyInput(e.target);
    if (e.target.name === 'PajakPersen') { const v = e.target.value.replace(/[^\d.,]/g, ''); if (v !== e.target.value) e.target.value = v; }
    if (e.target.name === 'KotaTujuan') applyTarif(lay);
    if (form.classList.contains('locked') && e.target.closest('.no-lock')) return;
    if (e.target.matches('[data-f]')) {
      const f = e.target.dataset.f;
      if (f !== 'd') { const v = f === 'q' ? e.target.value.replace(/\D/g, '') : e.target.value.replace(/[^\d.,]/g, ''); if (v !== e.target.value) e.target.value = v; }
      syncItems(lay);
    }
    if (e.target.name === 'NoPolMobil' || e.target.name === 'NoRangka') { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p, p); }
    if (e.target.classList.contains('invalid')) e.target.classList.remove('invalid');
    if (e.target.name === 'Status') return;
    markDirty(lay); recalc(lay);
  });
  form.addEventListener('change', e => {
    if (e.target.name === 'Status' && st.rec && st.rec.StatusDok === 'Terkonfirmasi') { changeStatus(st.rec.ID, e.target.value, null); st.rec.Status = e.target.value; return; }
    if (e.target.name === 'Pembayaran') recalc(lay);
    markDirty(lay);
  });
  form.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      e.preventDefault();
      const type = add.dataset.add, combo = add.closest('.field, .sub-box').querySelector('.combo');
      const preset = type !== 'ekspedisi' ? null : lay === 'kirim' ? { Layanan: 'Towing' } : { Layanan: 'Paket ' + ((form.querySelector('[name=Jalur]') || {}).value || 'Darat') };
      openMasterModal(type, null, { preset, onSaved: rec => { comboSet(combo, rec.ID); onComboPick(lay, combo.dataset.target, rec.ID); if (!(form.classList.contains('locked') && combo.closest('.no-lock'))) markDirty(lay); } });
      return;
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act;
    if (a === 'new' || a === 'reset') newOrder(lay, a === 'reset');
    if (a === 'draft') saveForm(lay, 'draft', b);
    if (a === 'confirm') saveForm(lay, 'confirm', b);
    if (a === 'inspeksi') goInspeksi(lay);
    if (a === 'print-menu') { e.stopPropagation(); const m = b.parentNode.querySelector('.dd-menu'); m.hidden = !m.hidden; }
    if (a.startsWith('print-') && a !== 'print-menu') {
      $$('.dd-menu', form).forEach(m => { m.hidden = true; });
      if (!st.rec || st.rec.StatusDok !== 'Terkonfirmasi') { toast('warning', 'Belum dikonfirmasi', 'Konfirmasi order dulu sebelum mencetak.'); return; }
      if (st.dirty && isSA()) { toast('warning', 'Ada perubahan belum disimpan', 'Simpan perubahan dulu agar dokumen sesuai.'); return; }
      if (a === 'print-tt') printTandaTerima(st.rec.ID); else printOrder(st.rec.ID, a === 'print-nominal' ? 'nominal' : 'tanpa');
    }
  });
  // Pulihkan isian lokal yang belum tersimpan
  let saved = null; try { saved = JSON.parse(lsGet(LS.draft + lay, 'null')); } catch (e) { saved = null; }
  if (saved && saved.data) {
    const base = saved.id ? byId('orders', saved.id) : null;
    if (!saved.id || (base && base.StatusDok === 'Draf')) {
      fillForm(lay, base);
      applyValues(lay, saved.data);
      st.dirty = true; updateActionBar(lay);
      setTimeout(() => toast('info', 'Isian dipulihkan', 'Form ' + ({ sewa: 'sewa', kirim: 'kirim mobil', paket: 'kirim paket' })[lay] + ' yang belum disimpan dikembalikan.'), 600);
      return;
    }
  }
  fillForm(lay, null);
}
function refreshFormLists(lay) {
  const st = FORMS[lay]; if (!st) return;
  const sel = st.el.querySelector('[name=RekeningID]'), cur = sel.value || (st.rec && st.rec.RekeningID) || '';
  const reks = S.d.rekening.filter(r => String(r.Aktif) === 'true' || r.ID === cur);
  sel.innerHTML = '<option value="">— Tidak dicantumkan / semua rekening penerima —</option>' + reks.map(r => `<option value="${esc(r.ID)}">${esc(r.Bank)} ${esc(r.NoRekening)} · ${esc(r.Alias)}</option>`).join('');
  sel.value = cur;
  updateCustomerInfo(lay); updateWarnings(lay);
}
function syncOpenForms() {
  ORDER_PAGES.forEach(lay => {
    const st = FORMS[lay]; if (!st) return;
    refreshFormLists(lay);
    if (st.rec && !st.dirty) {
      const fresh = byId('orders', st.rec.ID);
      if (fresh && fresh.DiubahPada !== st.rec.DiubahPada) fillForm(lay, fresh);
    }
  });
  if (S.page === 'inspeksi') renderInspeksiList();
}
function formDirty(lay) { return !!(FORMS[lay] && FORMS[lay].dirty); }
function markDirty(lay) {
  const st = FORMS[lay]; if (!st || st.loading) return;
  st.dirty = true; updateActionBar(lay);
  saveLocalDraft(lay);
}
const saveLocalDraft = debounce(lay => {
  const st = FORMS[lay]; if (!st || !st.dirty || (st.rec && st.rec.StatusDok === 'Terkonfirmasi')) return;
  lsSet(LS.draft + lay, JSON.stringify({ id: st.rec ? st.rec.ID : '', data: collectForm(lay), t: Date.now() }));
}, 500);
function clearLocalDraft(lay) { lsDel(LS.draft + lay); }
function formatMoneyInput(el) {
  const neg = el.name === 'Penyesuaian' && /^\s*-/.test(el.value);
  const d = digits(el.value);
  el.value = d ? (neg ? '-' : '') + Number(d).toLocaleString('id-ID') : (neg ? '-' : '');
}
function setMoney(el, v) { const n = num(v); el.value = (v === '' || v === undefined || v === null) ? '' : (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('id-ID'); }
function collectForm(lay) {
  const st = FORMS[lay], data = {};
  st.el.querySelectorAll('[name]').forEach(el => {
    if (el.closest('.combo') && el.type !== 'hidden') return;
    data[el.name] = el.classList.contains('money') ? (el.value.trim() === '' ? '' : String(num(el.value))) : el.value.trim();
  });
  if (st.rec) data.ID = st.rec.ID;
  return data;
}
function applyValues(lay, data) {
  const st = FORMS[lay]; st.loading = true;
  if (data && String(data.PajakPersen || '').trim() === '' && num(data.Pajak) > 0 && num(data.Harga) > 0) {
    data = Object.assign({}, data, { PajakPersen: fmtPersen(num(data.Pajak) / num(data.Harga) * 100) });
  } else if (data && String(data.PajakPersen || '').trim() !== '') data = Object.assign({}, data, { PajakPersen: fmtPersen(data.PajakPersen) });
  Object.entries(data || {}).forEach(([k, v]) => {
    const el = st.el.querySelector(`[name="${k}"]`); if (!el) return;
    if (el.type === 'hidden' && el.closest('.combo')) comboSet(el.closest('.combo'), v);
    else if (el.classList.contains('money')) setMoney(el, v);
    else el.value = v === undefined || v === null ? '' : v;
  });
  st.loading = false;
  if (lay === 'paket') renderItems(lay);
  updateCustomerInfo(lay, data && data.KodePelanggan); updateWarnings(lay); recalc(lay);
}
function fillForm(lay, rec) {
  const st = FORMS[lay]; const form = st.el;
  st.rec = rec ? Object.assign({}, rec) : null;
  st.loading = true;
  form.querySelectorAll('[name]').forEach(el => { if (el.type !== 'hidden' || el.closest('.combo') || ['Pajak', 'Barang', 'DasarTarif', 'Pembayar', 'Jalur', 'ModaAngkut'].includes(el.name)) el.value = ''; el.classList.remove('invalid'); });
  form.querySelectorAll('.combo').forEach(c => comboSet(c, ''));
  form.querySelector('[name=Status]').value = 'Dijadwalkan';
  if (rec) applyValues(lay, rec);
  if (lay === 'paket') renderItems(lay);
  st.loading = false;
  const m = k => form.querySelector(`[data-meta="${k}"]`);
  m('Tanggal').textContent = rec ? tglJam(orderDate(rec)) : 'Otomatis saat disimpan';
  m('NoSJ').textContent = rec && rec.NoSJ ? rec.NoSJ : 'Terbit saat konfirmasi';
  m('NoUnik').textContent = rec ? rec.NoUnik : 'Otomatis';
  st.dirty = false;
  applyLock(lay); updateCustomerInfo(lay); updateWarnings(lay); recalc(lay); updateActionBar(lay);
  dhReset(lay);
  if (lay === 'kirim') updateInspBox();
}
function newOrder(lay, isReset) {
  const st = FORMS[lay]; if (!st) return;
  const go = () => {
    clearLocalDraft(lay);
    if (isReset && st.rec) fillForm(lay, byId('orders', st.rec.ID) || null); else fillForm(lay, null);
    if (!isReset) window.scrollTo({ top: 0 });
  };
  if (st.dirty) confirmDialog({ title: 'Buang perubahan?', text: 'Isian yang belum disimpan akan hilang.', variant: 'warn', icon: 'bi-exclamation-triangle', ok: 'Ya, buang' }).then(v => { if (v === true) go(); });
  else go();
}
function loadOrderToForm(lay, o) {
  const st = FORMS[lay];
  const go = () => { clearLocalDraft(lay); fillForm(lay, byId('orders', o.ID) || o); };
  if (st.dirty && (!st.rec || st.rec.ID !== o.ID)) confirmDialog({ title: 'Buka order lain?', text: 'Perubahan pada form saat ini belum disimpan dan akan hilang.', variant: 'warn', icon: 'bi-exclamation-triangle', ok: 'Ya, buka' }).then(v => { if (v === true) go(); });
  else go();
}
function applyLock(lay) {
  const st = FORMS[lay], form = st.el, rec = st.rec;
  const conf = rec && rec.StatusDok === 'Terkonfirmasi';
  const locked = conf && !isSA();
  form.classList.toggle('locked', !!locked);
  form.querySelectorAll('.card [name], .card [data-f], .combo-input').forEach(el => {
    if (el.name === 'Status' || el.closest('.no-lock')) return;
    if (el.tagName === 'SELECT') el.disabled = !!locked; else el.readOnly = !!locked;
  });
  form.querySelectorAll('.combo').forEach(c => { const cl = c.querySelector('.combo-clear'); if (cl) cl.hidden = (!!locked && !c.closest('.no-lock')) || !c.querySelector('input[type=hidden]').value; });
  const es = form.querySelector('[data-eksp-save]'); if (es) es.hidden = !locked;
  if (lay === 'paket') updateEkspInfo(lay);
  const banner = form.querySelector('.lock-banner');
  if (conf) {
    const printed = String(rec.Dicetak) === 'true';
    banner.className = 'lock-banner' + (locked ? '' : ' sa');
    banner.innerHTML = locked
      ? `<span class="lb-ic"><i class="bi bi-lock-fill"></i></span><div class="grow"><b>Order sudah dikonfirmasi. Admin hanya dapat mengubah status.</b><span>Untuk mengubah isi order, hubungi Super Admin.</span></div>${printed ? `<span class="chip" style="background:#fff;color:#92400E"><i class="bi bi-printer"></i> Dicetak ${tglJam(rec.WaktuCetak)}</span>` : ''}`
      : `<span class="lb-ic"><i class="bi bi-shield-lock"></i></span><div class="grow"><b>Mode Super Admin: order terkonfirmasi dapat diubah.</b><span>Setiap perubahan dicatat di Log Aktivitas.${printed ? ' Dokumen sudah dicetak ' + tglJam(rec.WaktuCetak) + '.' : ''}</span></div>`;
    banner.hidden = false;
  } else banner.hidden = true;
}
function updateActionBar(lay) {
  const st = FORMS[lay], form = st.el, rec = st.rec;
  const conf = rec && rec.StatusDok === 'Terkonfirmasi';
  const q = s => form.querySelector(s);
  q('[data-act="draft"]').hidden = conf && !isSA();
  q('[data-act="draft"] span').textContent = conf ? 'Simpan perubahan' : 'Simpan draf';
  q('[data-act="confirm"]').hidden = !!conf;
  q('[data-act="reset"]').hidden = conf && !isSA();
  q('[data-ab="print"]').hidden = !conf;
  const info = q('[data-ab="info"]'), dot = q('[data-ab="dot"]');
  dot.classList.toggle('dirty', st.dirty);
  if (st.dirty) info.textContent = conf ? 'Ada perubahan belum disimpan' : 'Isian tersimpan sementara di perangkat ini';
  else if (!rec) info.textContent = 'Order baru · isi lalu simpan draf atau konfirmasi';
  else if (!conf) info.textContent = 'Draf tersimpan · ' + tglJam(rec.DiubahPada);
  else info.textContent = (String(rec.Dicetak) === 'true' ? 'Dicetak ' + tglJam(rec.WaktuCetak) : 'Terkonfirmasi, siap dicetak') + (lay === 'paket' ? ' · No. resi ' : ' · No. SJ ') + rec.NoSJ;
}
function onComboPick(lay, target, id) {
  const st = FORMS[lay], form = st.el;
  if (target === 'PelangganID') {
    const p = byId('pelanggan', id);
    updateCustomerInfo(lay);
    const kode = form.querySelector('[name=KodePelanggan]');
    if (p) kode.value = lay === 'sewa' ? p.IDSewa : p.IDKirim;
    const pay = form.querySelector('[name=Pembayaran]');
    if (lay === 'paket' && p) [['PengirimNama', 'Nama'], ['PengirimHP', 'NoHP'], ['PengirimAlamat', 'Alamat']].forEach(([f, k]) => { const el = form.querySelector(`[name=${f}]`); el.value = p[k] || ''; el.classList.remove('invalid'); });
    if (lay === 'paket') { updateKotaList(lay); applyTarif(lay); }
    if (p && p.PembayaranBawaan && !pay.value && [...pay.options].some(o => o.value === p.PembayaranBawaan)) { pay.value = p.PembayaranBawaan; if (p.PembayaranBawaan === 'Termin') form.querySelector('[name=TerminHari]').value = p.TerminHari || ''; }
  }
  if (target === 'EkspedisiID' && lay === 'kirim') updateEkspInfo(lay);
  if (target === 'EkspedisiID' && lay === 'paket') {
    updateEkspInfo(lay);
    if (form.classList.contains('locked')) return;
  }
  if (target === 'PenerimaID' && lay === 'paket') {
    const r = byId('penerima', id);
    if (r) [['PenerimaNama', 'Nama'], ['PenerimaHP', 'NoHP'], ['PenerimaAlamat', 'Alamat'], ['KotaTujuan', 'Kota']].forEach(([f, k]) => { const el = form.querySelector(`[name=${f}]`); el.value = r[k] || el.value; el.classList.remove('invalid'); });
    updateKotaList(lay); applyTarif(lay);
  }
  if (target === 'KendaraanID' && lay === 'sewa') {
    const k = byId('kendaraan', id), j = form.querySelector('[name=JenisKendaraan]');
    if (k && JENIS_KENDARAAN.includes(k.JenisKendaraan)) j.value = k.JenisKendaraan;
  }
  updateCustomerInfo(lay); updateWarnings(lay); recalc(lay); markDirty(lay);
}
function updateCustomerInfo(lay, prefer) {
  const st = FORMS[lay]; if (!st) return; const form = st.el;
  const p = byId('pelanggan', form.querySelector('[name=PelangganID]').value);
  const kode = form.querySelector('[name=KodePelanggan]'), cur = prefer || kode.value;
  kode.innerHTML = !p ? '<option value="">Pilih pelanggan dulu</option>' : p.IDSewa === p.IDKirim ? `<option value="${esc(p.IDSewa)}">${esc(p.IDSewa)} · ${esc(p.Tipe || 'Corporate')}</option>`
    : `<option value="${esc(p.IDSewa)}">${esc(p.IDSewa)} · ID sewa</option><option value="${esc(p.IDKirim)}">${esc(p.IDKirim)} · ID kirim</option>`;
  if (p) kode.value = cur === p.IDSewa || cur === p.IDKirim ? cur : (lay === 'sewa' ? p.IDSewa : p.IDKirim);
  const set = (k, v) => { const el = form.querySelector(`[data-info="${k}"]`); if (el) el.textContent = v || '—'; };
  set('NoHP', p && p.NoHP); set('NPWP', p && p.NPWP); set('Alamat', p && p.Alamat);
  if (lay === 'paket') updateKotaList(lay);
  if (lay === 'kirim') {
    const r = byId('penerima', form.querySelector('[name=PenerimaID]').value);
    set('PenerimaHP', r && (r.NoHP + (r.NamaPIC ? ' · PIC ' + r.NamaPIC : ''))); set('PenerimaAlamat', r && [r.Alamat, r.Kota].filter(Boolean).join(', '));
  }
}
function updateWarnings(lay) {
  const st = FORMS[lay]; if (!st || lay === 'paket') return; const form = st.el;
  const kv = form.querySelector(lay === 'sewa' ? '[name=KendaraanID]' : '[name=UnitID]').value;
  const k = byId('kendaraan', kv), wk = form.querySelector('[data-warn="kendaraan"]');
  const al = k ? vehicleAlerts(k) : [];
  const busyK = k ? vehicleBusy(k) : null;
  const msgK = al.map(a => `${a.jenis} ${a.text.toLowerCase()} (${tgl(a.tgl)})`).concat(busyK && (!st.rec || busyK.ID !== st.rec.ID) ? ['sedang dipakai di ' + busyK.NoSJ] : []);
  wk.hidden = !msgK.length; wk.className = 'warn-line ' + (al.some(a => a.lvl === 'exp') ? 'red' : 'amber');
  wk.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${esc(msgK.join(' · '))}. Tetap dapat digunakan.`;
  const d = byId('pengemudi', form.querySelector('[name=PengemudiID]').value), wd = form.querySelector('[data-warn="pengemudi"]');
  const ad = d ? driverAlert(d) : null, busyD = d ? driverBusy(d) : null;
  const msgD = (ad ? ['SIM ' + ad.text.toLowerCase() + ' (' + tgl(ad.tgl) + ')'] : []).concat(busyD && (!st.rec || busyD.ID !== st.rec.ID) ? ['sedang bertugas di ' + busyD.NoSJ] : []);
  wd.hidden = !msgD.length; wd.className = 'warn-line ' + (ad && ad.lvl === 'exp' ? 'red' : 'amber');
  wd.innerHTML = `<i class="bi bi-exclamation-triangle"></i> ${esc(msgD.join(' · '))}. Tetap dapat ditugaskan.`;
}
function recalc(lay) {
  const st = FORMS[lay]; if (!st) return; const form = st.el;
  const v = n => num(form.querySelector(`[name="${n}"]`).value);
  const pay = form.querySelector('[name=Pembayaran]').value;
  if (lay === 'paket') { hitungOngkos(lay); updateEkspInfo(lay); }
  if (lay === 'kirim') syncModa();
  const ppEl = form.querySelector('[name=PajakPersen]'), pp = persenNum(ppEl.value);
  const pajak = Math.round(v('Harga') * pp / 100);
  form.querySelector('[name=Pajak]').value = ppEl.value.trim() === '' ? '' : String(pajak);
  form.querySelector('[data-calc="PajakRp"]').textContent = '= ' + rp(pajak) + (pp ? ' (' + fmtPersen(pp) + '% × ' + rp(v('Harga')) + ')' : '');
  form.querySelectorAll('[data-pajak]').forEach(b => b.classList.toggle('on', ppEl.value.trim() !== '' && persenNum(b.dataset.pajak.replace(',', '.')) === pp));
  const total = v('Harga') + pajak + v('Penyesuaian');
  form.querySelector('[data-calc="Total"]').textContent = rp(total);
  form.querySelector('[data-calc="TotalText"]').textContent = pay ? 'Metode: ' + (lay === 'paket' ? (METODE_PAKET.find(m => m[0] === pay) || [, pay])[1] : pay) : 'Harga + pajak + penyesuaian';
  const hari = form.querySelector('[data-pay="hari"]'), dp = form.querySelector('[data-pay="dp"]'), due = form.querySelector('[data-pay="due"]');
  hari.hidden = !(pay === 'Termin' || pay === 'DP');
  form.querySelector('[data-pay-hari-label]').textContent = pay === 'DP' ? 'Pelunasan sisa dalam (hari)' : 'Jumlah hari termin';
  form.querySelector('[data-pay-hari-label]').classList.toggle('req', pay === 'Termin');
  dp.hidden = pay !== 'DP';
  form.querySelector('[data-calc="Sisa"]').textContent = rp(Math.max(total - v('DP'), 0));
  const base = st.rec && st.rec.NoSJ ? String(st.rec.Tanggal).slice(0, 10) : today();
  const h = v('TerminHari');
  if ((pay === 'Termin' || pay === 'DP') && h > 0) { due.hidden = false; due.innerHTML = `<i class="bi bi-calendar-event"></i> Jatuh tempo: <b>${tgl(addDays(base, h), true)}</b>${st.rec && st.rec.NoSJ ? '' : ' (dihitung dari tanggal konfirmasi)'}`; }
  else if (pay === 'COD' || pay === 'Invoice Surat Kembali') { due.hidden = false; due.innerHTML = `<i class="bi bi-info-circle"></i> Invoice dibuat otomatis dan ditagih saat ${lay === 'paket' ? 'resi' : 'surat jalan'} terbit.`; }
  else if (pay === 'Lunas') { due.hidden = false; due.innerHTML = '<i class="bi bi-check2-circle"></i> Langsung tercatat sebagai pemasukan saat konfirmasi.'; }
  else due.hidden = true;
}
function validateForm(lay) {
  const st = FORMS[lay], form = st.el, data = collectForm(lay);
  form.querySelectorAll('.invalid').forEach(e => e.classList.remove('invalid'));
  const miss = REQ[lay].filter(([k]) => !String(data[k] || '').trim() || (MONEY.includes(k) && num(data[k]) <= 0));
  const ppRaw = String(data.PajakPersen || '').trim();
  if (ppRaw !== '' && (!/^\d{1,3}([.,]\d{1,2})?$/.test(ppRaw) || parseFloat(ppRaw.replace(',', '.')) > 100)) miss.push(['PajakPersen', 'Pajak (0–100%, maks. 2 desimal)']);
  if (data.Pembayaran === 'Termin' && !(num(data.TerminHari) > 0)) miss.push(['TerminHari', 'Jumlah hari termin']);
  if (lay === 'kirim') {
    const moda = data.ModaAngkut || 'Towing';
    if (moda === 'Dikendarai' && !data.PengemudiID) { form.querySelector('[data-combo="pengemudi"] .combo-input').classList.add('invalid'); miss.push(['', 'Sopir (mobil dikendarai)']); }
    if (moda === 'Towing rekanan' && !data.EkspedisiID) { form.querySelector('[data-combo="ekspTowing"] .combo-input').classList.add('invalid'); miss.push(['', 'Towing rekanan']); }
  }
  if (lay === 'paket' && data.Pembayar === 'penerima' && !data.PenerimaID) { const c = form.querySelector('[data-combo="penerima"] .combo-input'); if (c) c.classList.add('invalid'); miss.push(['', 'Penerima dari Data Penerima (ongkos ditanggung penerima)']); }
  if (lay === 'paket') {
    const rows = $$('.it-row', form), list = itemsOf(lay);
    let ok = 0;
    list.forEach((b, i) => {
      const row = rows[i]; if (!row) return;
      const empty = !b.d && !b.q && !b.kg && !b.p && !b.l && !b.t; if (empty) return;
      const bad = [];
      if (!b.d) bad.push('d'); if (!(b.q > 0)) bad.push('q');
      if (!(b.kg > 0) && !(b.p > 0 && b.l > 0 && b.t > 0)) bad.push('kg', 'p', 'l', 't');
      bad.forEach(f => row.querySelector(`[data-f="${f}"]`).classList.add('invalid'));
      if (bad.length) miss.push(['', 'Barang baris ' + (i + 1)]); else ok++;
    });
    if (!ok && !miss.some(m => m[1].startsWith('Barang'))) { const d = form.querySelector('.it-row [data-f="d"]'); if (d) d.classList.add('invalid'); miss.push(['', 'Minimal satu barang kiriman']); }
  }
  if (data.Pembayaran === 'DP') { const tot = num(data.Harga) + num(data.Pajak) + num(data.Penyesuaian); if (!(num(data.DP) > 0) || num(data.DP) > tot) miss.push(['DP', 'Nominal DP (≤ total)']); }
  if (!miss.length) return true;
  miss.forEach(([k]) => { if (!k) return; const el = form.querySelector(`[name="${k}"]`); const target = el && el.type === 'hidden' ? el.closest('.combo').querySelector('.combo-input') : el; if (target) target.classList.add('invalid'); });
  const first = form.querySelector('.invalid');
  if (first) { first.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => first.focus({ preventScroll: true }), 300); }
  toast('warning', 'Lengkapi data dulu', miss.map(m => m[1]).join(', '));
  return false;
}
function saveForm(lay, action, btn) {
  const st = FORMS[lay], data = collectForm(lay);
  const dh = dhNilai(lay);
  if (dh) {
    if (!dh.tujuan && !dh.armada) { toast('warning', 'Lengkapi rute untuk daftar harga', 'Isi tujuan (kota) atau armada, atau hilangkan centang "Simpan ke daftar harga".'); const t = st.el.querySelector('[data-dh-f=tujuan]'); t.classList.add('invalid'); t.focus(); return; }
    data.SimpanHarga = dh;
  }
  const run = () => {
    btnBusy(btn, true, action === 'confirm' ? 'Menerbitkan…' : 'Menyimpan…');
    api('saveOrder', S.token, lay, data, action).then(r => {
      const o = r.data.order;
      upsert('orders', o);
      if (r.data.invoice) upsert('invoices', r.data.invoice);
      (r.data.finance || []).forEach(f => upsert('finance', f));
      if (r.data.harga) upsert('harga', r.data.harga);
      saveCache(); updateBadges(); clearLocalDraft(lay);
      fillForm(lay, byId('orders', o.ID));
      if (action === 'confirm') {
        const t = toast('success', (lay === 'paket' ? 'Resi ' : 'Surat jalan ') + o.NoSJ + ' terbit', 'Order terkunci. Klik di sini untuk mencetak.', 8000);
        t.style.cursor = 'pointer'; t.onclick = e => { if (!e.target.closest('.x')) printOrder(o.ID, 'tanpa'); };
      } else ok(r.message);
    }).catch(err => fail(err, action === 'confirm' ? 'Konfirmasi gagal' : 'Gagal menyimpan')).finally(() => btnBusy(btn, false));
  };
  if (action !== 'confirm') {
    if (!data.PelangganID && !st.rec) { toast('warning', 'Pilih pelanggan dulu', 'Draf minimal memuat pelanggan.'); return; }
    run(); return;
  }
  if (!validateForm(lay)) return;
  const p = byId('pelanggan', data.PelangganID);
  const total = num(data.Harga) + num(data.Pajak) + num(data.Penyesuaian);
  const rows = lay === 'paket'
    ? [['Pelanggan', p && p.Nama], ['Pengirim', data.PengirimNama], ['Penerima', data.PenerimaNama + ' · ' + firstPart(data.PenerimaAlamat)], ['Isi kiriman', paketRingkas(itemTotals(itemsOf(lay)))], ['Jalur', data.Jalur || 'Darat'], ['Ongkos ditanggung', data.Pembayar === 'penerima' ? 'Penerima' : 'Pengirim']]
    : lay === 'sewa'
    ? [['Pelanggan', p && p.Nama], ['Unit', (byId('kendaraan', data.KendaraanID) || {}).NoPol], ['Pengemudi', (byId('pengemudi', data.PengemudiID) || {}).Nama], ['Rute', firstPart(data.MuatAlamat) + ' → ' + firstPart(data.BongkarAlamat)]]
    : [['Pelanggan', p && p.Nama], ['Penerima', (byId('penerima', data.PenerimaID) || {}).Nama], ['Mobil', [data.Merk, data.Tipe, data.NoPolMobil].filter(Boolean).join(' ')], ['Layanan', data.JenisLayanan]];
  rows.push(['Pembayaran', data.Pembayaran + (data.Pembayaran === 'Termin' ? ' ' + data.TerminHari + ' hari' : '')], ['Total', rp(total)]);
  confirmDialog({
    title: 'Konfirmasi & kunci order?', icon: 'bi-lock', ok: 'Konfirmasi & terbitkan', okIcon: 'bi-check2-circle',
    html: `Nomor ${lay === 'paket' ? 'resi' : 'surat jalan'} akan diterbitkan. Setelah dikonfirmasi, Admin hanya dapat mengubah status.<div class="confirm-sum">${rows.map(r => `<div><span>${esc(r[0])}</span><b>${esc(r[1] || '—')}</b></div>`).join('')}</div>`
  }).then(v => { if (v === true) run(); });
}
// ── Paket: tabel barang multi-baris ─────────────────────────
// Disimpan sebagai JSON di input tersembunyi name="Barang": [{d, q, kg, p, l, t}]
// Volume per koli = P × L × T (cm) / 1.000.000 → m³. Total dihitung ulang di server.
function decNum(v) { const n = parseFloat(String(v === undefined || v === null ? '' : v).replace(',', '.')); return isFinite(n) && n > 0 ? n : 0; }
function itemsOf(lay) { const h = FORMS[lay] && FORMS[lay].el.querySelector('[name=Barang]'); try { const a = JSON.parse((h && h.value) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function itemTotals(list) {
  return list.reduce((t, b) => { const q = Number(b.q) || 0; t.TotalKoli += q; t.TotalBerat += q * (Number(b.kg) || 0); t.TotalVolume += q * (Number(b.p) || 0) * (Number(b.l) || 0) * (Number(b.t) || 0) / 1e6; return t; }, { TotalKoli: 0, TotalBerat: 0, TotalVolume: 0 });
}
function itemRowHTML(b, i) {
  const v = k => (b[k] ? String(b[k]).replace('.', ',') : '');
  return `<div class="it-row" data-i="${i}">
    <span class="it-no">${i + 1}</span>
    <label class="it-c it-d"><span>Detail kiriman</span><input class="input" data-f="d" maxlength="200" value="${esc(b.d || '')}" placeholder="Contoh: Dus sparepart motor"></label>
    <label class="it-c it-q"><span>Qty (koli)</span><input class="input t-right" data-f="q" inputmode="numeric" maxlength="6" value="${v('q')}" placeholder="0"></label>
    <label class="it-c it-kg"><span>Kg / koli</span><input class="input t-right" data-f="kg" inputmode="decimal" maxlength="9" value="${v('kg')}" placeholder="0"></label>
    <div class="it-c it-dim"><span>P × L × T (cm)</span><div class="dim3"><input class="input" data-f="p" inputmode="decimal" maxlength="7" value="${v('p')}" placeholder="P" aria-label="Panjang cm"><i>×</i><input class="input" data-f="l" inputmode="decimal" maxlength="7" value="${v('l')}" placeholder="L" aria-label="Lebar cm"><i>×</i><input class="input" data-f="t" inputmode="decimal" maxlength="7" value="${v('t')}" placeholder="T" aria-label="Tinggi cm"></div></div>
    <div class="it-c it-sum"><span>Subtotal</span><b data-it="kg">0 kg</b><small data-it="m3">0 m³</small></div>
    <button type="button" class="icon-btn it-del" data-it-del="${i}" title="Hapus baris" aria-label="Hapus baris ${i + 1}"><i class="bi bi-trash"></i></button>
  </div>`;
}
function renderItems(lay) {
  const st = FORMS[lay]; if (!st) return;
  const box = st.el.querySelector('[data-items]'); if (!box) return;
  let list = itemsOf(lay); if (!list.length) list = [{}];
  box.innerHTML = list.map(itemRowHTML).join('');
  if (st.el.classList.contains('locked')) $$('[data-f]', box).forEach(el => { el.readOnly = true; });
  updateItemTotals(lay);
}
function readItems(lay) {
  return $$('.it-row', FORMS[lay].el).map(row => {
    const g = f => row.querySelector(`[data-f="${f}"]`).value;
    return { d: g('d').trim(), q: Math.round(decNum(g('q'))), kg: decNum(g('kg')), p: decNum(g('p')), l: decNum(g('l')), t: decNum(g('t')) };
  });
}
function syncItems(lay) {
  const list = readItems(lay);
  const filled = list.filter(b => b.d || b.q || b.kg || b.p || b.l || b.t);
  FORMS[lay].el.querySelector('[name=Barang]').value = filled.length ? JSON.stringify(list) : '';
  updateItemTotals(lay, list);
}
function updateItemTotals(lay, list) {
  const form = FORMS[lay].el; list = list || readItems(lay);
  $$('.it-row', form).forEach((row, i) => {
    const b = list[i] || {}, q = b.q || 0;
    row.querySelector('[data-it="kg"]').textContent = fnumDec(q * (b.kg || 0)) + ' kg';
    row.querySelector('[data-it="m3"]').textContent = fnumDec(q * (b.p || 0) * (b.l || 0) * (b.t || 0) / 1e6, 4) + ' m³';
  });
  const t = itemTotals(list);
  form.querySelector('[data-tot="koli"]').textContent = fnumDec(t.TotalKoli);
  form.querySelector('[data-tot="kg"]').textContent = fnumDec(t.TotalBerat) + ' kg';
  form.querySelector('[data-tot="m3"]').textContent = fnumDec(t.TotalVolume, 4) + ' m³';
  $$('.it-del', form).forEach(b => { b.disabled = $$('.it-row', form).length === 1; });
}
function addItemRow(lay) {
  const list = readItems(lay); list.push({});
  FORMS[lay].el.querySelector('[name=Barang]').value = JSON.stringify(list);
  renderItems(lay); markDirty(lay);
  const rows = $$('.it-row', FORMS[lay].el); rows[rows.length - 1].querySelector('[data-f="d"]').focus();
}
function removeItemRow(lay, i) {
  const list = readItems(lay); if (list.length <= 1) return;
  list.splice(i, 1);
  FORMS[lay].el.querySelector('[name=Barang]').value = JSON.stringify(list);
  renderItems(lay); markDirty(lay); recalc(lay);
}
// ── Paket: tarif kg / volume dari Data Pelanggan ────────────
function updateEkspInfo(lay) {
  const form = FORMS[lay].el, box = form.querySelector('[data-eksp-info]'); if (!box) return;
  const e = byId('ekspedisi', form.querySelector('[name=EkspedisiID]').value);
  box.hidden = !e;
  if (e) box.innerHTML = `<div><b>${esc(e.Nama)}</b><span class="t-sub">${esc(e.Kode)}${e.PIC ? ' · PIC ' + esc(e.PIC) : ''}${e.Alamat ? ' · ' + esc(firstPart(e.Alamat)) : ''}</span></div>${e.NoWA ? `<a class="btn btn-secondary btn-sm" href="https://wa.me/${waNumber(e.NoWA)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WA ${esc(e.NoWA)}</a>` : ''}${ekspEstimasiHTML(lay, e)}`;
}
/** Perkiraan biaya ke ekspedisi = maks(harga minimal, berat × harga/kg atau volume × harga/m³). Hanya info internal. */
function ekspEstimasiHTML(lay, e) {
  if (lay === 'kirim') return towingEstimasiHTML(e);
  const form = FORMS[lay].el, kota = form.querySelector('[name=KotaTujuan]').value.trim();
  const list = tarifParse(e.Tarif);
  if (!isSA()) {
    const t = cariTarifDi(list, kota);
    return t && t.hari ? `<div class="eksp-est"><div class="eksp-est-r"><span><i class="bi bi-clock-history"></i> Estimasi sampai${t.kota ? ' ' + esc(t.kota) : ''}</span><b>${esc(t.hari)} hari</b></div></div>` : '';
  }
  if (!list.length) return '<div class="eksp-est muted">Belum ada tarif untuk ekspedisi ini. Isi di Data Master → Ekspedisi Rekanan.</div>';
  const t = cariTarifDi(list, kota);
  if (!t) return `<div class="eksp-est muted">Tarif ke ${esc(kota || 'kota tujuan')} belum ada di ekspedisi ini.</div>`;
  const tot = itemTotals(itemsOf(lay));
  const kg = Math.round(tot.TotalBerat * 100) / 100, m3 = Math.round(tot.TotalVolume * 10000) / 10000;
  const opsi = [];
  if (num(t.kg)) opsi.push({ l: `${fnumDec(kg)} kg × ${rp(t.kg)}`, v: Math.round(kg * num(t.kg)) });
  if (num(t.m3)) opsi.push({ l: `${fnumDec(m3, 4)} m³ × ${rp(t.m3)}`, v: Math.round(m3 * num(t.m3)) });
  const dasar = form.querySelector('[name=DasarTarif]').value === 'volume' ? 1 : 0;
  const pilih = opsi.length === 2 ? opsi[dasar] : opsi[0];
  const min = num(t.min), nilai = Math.max(pilih ? pilih.v : 0, min);
  const harga = num(form.querySelector('[name=Harga]').value);
  return `<div class="eksp-est"><div class="eksp-est-h"><i class="bi bi-calculator"></i> Perkiraan biaya ekspedisi${t.kota ? ' · ' + esc(t.kota) : ' · tarif umum'}</div>
    <div class="eksp-est-r"><span>${pilih ? esc(pilih.l) : 'Tanpa harga per kg / m³'}${min ? ` · minimal ${rp(min)}` : ''}</span><b class="mono">${rp(nilai)}</b></div>
    ${t.hari ? `<div class="eksp-est-r"><span>Estimasi lama kirim</span><b>${esc(t.hari)} hari</b></div>` : ''}
    ${harga ? `<div class="eksp-est-r"><span>Ongkos ke pelanggan − biaya ekspedisi</span><b class="mono ${harga - nilai < 0 ? 't-red' : 't-green'}">${rp(harga - nilai)}</b></div>` : ''}</div>`;
}
function simpanEkspedisi(lay) {
  const st = FORMS[lay], form = st.el; if (!st.rec) return;
  const btn = form.querySelector('[data-eksp-save]'); btn.disabled = true;
  api('updateEkspedisi', S.token, st.rec.ID, { EkspedisiID: form.querySelector('[name=EkspedisiID]').value, ResiEkspedisi: form.querySelector('[name=ResiEkspedisi]').value })
    .then(r => { upsert('orders', r.data); saveCache(); st.rec = r.data; toast('success', 'Ekspedisi tersimpan', r.data.EkspedisiNama ? 'Diteruskan via ' + r.data.EkspedisiNama : 'Ekspedisi dikosongkan.'); if (S.page === 'rekap') renderRekapTable(); })
    .catch(err => fail(err, 'Gagal menyimpan ekspedisi')).finally(() => { btn.disabled = false; });
}
/** Pihak yang menanggung ongkos (sumber tarif): pelanggan/pengirim atau penerima. */
function payerOf(lay) {
  const form = FORMS[lay].el;
  return form.querySelector('[name=Pembayar]').value === 'penerima'
    ? byId('penerima', form.querySelector('[name=PenerimaID]').value)
    : byId('pelanggan', form.querySelector('[name=PelangganID]').value);
}
function updateKotaList(lay) {
  const form = FORMS[lay].el, p = payerOf(lay);
  $('#dlKotaPaket').innerHTML = tarifList(p).filter(t => t.kota).map(t => `<option value="${esc(t.kota)}">${esc(rp(t.kg))}/kg · ${esc(rp(t.m3))}/m³</option>`).join('');
}
/** Isi tarif/kg & tarif/m³ dari pelanggan + kota tujuan (dipanggil saat pengguna mengubah pelanggan/kota). */
function applyTarif(lay) {
  const form = FORMS[lay].el, p = payerOf(lay);
  const kota = form.querySelector('[name=KotaTujuan]').value.trim();
  const t = p ? cariTarif(p, kota) : null;
  setMoney(form.querySelector('[name=TarifKg]'), t && num(t.kg) ? t.kg : '');
  setMoney(form.querySelector('[name=TarifVolume]'), t && num(t.m3) ? t.m3 : '');
  if (t && num(t.m3) && !num(t.kg)) form.querySelector('[name=DasarTarif]').value = 'volume';
  if (t && num(t.kg) && !num(t.m3)) form.querySelector('[name=DasarTarif]').value = 'kg';
  form.dataset.tarifSrc = !p ? '' : t ? (t.kota ? 'kota' : 'umum') : 'none';
}
function hitungOngkos(lay) {
  const form = FORMS[lay].el, q = s => form.querySelector(s);
  const t = itemTotals(itemsOf(lay));
  const kg = Math.round(t.TotalBerat * 100) / 100, m3 = Math.round(t.TotalVolume * 10000) / 10000;
  const rk = num(q('[name=TarifKg]').value), rv = num(q('[name=TarifVolume]').value);
  const dasar = q('[name=DasarTarif]').value === 'volume' ? 'volume' : 'kg';
  const sum = { kg: Math.round(kg * rk), volume: Math.round(m3 * rv) };
  q('[data-to="kg"]').textContent = `${fnumDec(kg)} kg × ${rp(rk)}`;
  q('[data-to="volume"]').textContent = `${fnumDec(m3, 4)} m³ × ${rp(rv)}`;
  q('[data-to-sum="kg"]').textContent = rp(sum.kg); q('[data-to-sum="volume"]').textContent = rp(sum.volume);
  $$('[data-dasar]', form).forEach(b => { b.classList.toggle('on', b.dataset.dasar === dasar); b.disabled = form.classList.contains('locked'); });
  const rate = dasar === 'volume' ? rv : rk, harga = q('[name=Harga]');
  const auto = rate > 0;
  if (auto) setMoney(harga, sum[dasar]);
  harga.readOnly = auto || form.classList.contains('locked');
  q('[data-harga-auto]').hidden = !auto;
  const byr = q('[name=Pembayar]').value === 'penerima' ? 'penerima' : 'pengirim', jalur = q('[name=Jalur]').value || 'Darat';
  $$('[data-bayar]', form).forEach(b => { b.classList.toggle('on', b.dataset.bayar === byr); b.disabled = form.classList.contains('locked'); });
  $$('[data-jalur]', form).forEach(b => { b.classList.toggle('on', b.dataset.jalur === jalur); b.disabled = form.classList.contains('locked'); });
  const p = payerOf(lay), kota = q('[name=KotaTujuan]').value.trim();
  const src = q('[data-tarif-src]'), hint = q('[data-kota-hint]');
  const found = p ? cariTarif(p, kota) : null;
  if (!p) src.textContent = byr === 'penerima' ? 'Ongkos ditanggung penerima: pilih penerima dari Data Penerima untuk mengisi tarif.' : 'Pilih pelanggan & kota tujuan untuk mengisi tarif otomatis.';
  else if (found && found.kota) src.textContent = `Tarif ${p.Nama} untuk ${found.kota}. Bisa diubah khusus untuk order ini.`;
  else if (found) src.textContent = `Tarif umum ${p.Nama} (semua kota). Bisa diubah khusus untuk order ini.`;
  else src.textContent = `${p.Nama} belum punya tarif${kota ? ' untuk ' + kota : ''}. Isi tarif manual atau tambahkan di Data ${byr === 'penerima' ? 'Penerima' : 'Pelanggan'}.`;
  hint.textContent = !p ? 'Menentukan tarif dari data pihak yang menanggung ongkos.' : found ? `Tarif: ${rp(found.kg)}/kg · ${rp(found.m3)}/m³${found.kota ? '' : ' (umum)'}` : (kota ? 'Belum ada tarif untuk kota ini.' : 'Ketik atau pilih kota dari daftar tarif pelanggan.');
  hint.className = found ? 'pay-auto' : 'muted';
}
function basisText(o) {
  if (o.Layanan !== 'paket') return '';
  const vol = o.DasarTarif === 'volume', rate = num(vol ? o.TarifVolume : o.TarifKg);
  if (!rate) return '';
  return vol ? `${fnumDec(o.TotalVolume, 4)} m³ × ${rp(rate)}` : `${fnumDec(o.TotalBerat)} kg × ${rp(rate)}`;
}
function goInspeksi(lay) {
  const st = FORMS[lay];
  if (!st.rec) { toast('warning', 'Simpan order dulu', 'Simpan draf atau konfirmasi agar form inspeksi bisa disambungkan.'); return; }
  if (st.dirty) { toast('warning', 'Ada perubahan belum disimpan', 'Simpan dulu sebelum membuka inspeksi.'); return; }
  navigateTo('inspeksi', { orderId: st.rec.ID });
}
function updateInspBox() {
  const st = FORMS.kirim; if (!st) return;
  const box = $('#kirimInspBox'), txt = box.querySelector('[data-insp-text]');
  const insp = st.rec ? S.d.inspeksi.find(i => i.OrderID === st.rec.ID) : null;
  txt.innerHTML = insp ? (insp.Status === 'Disahkan' ? `<span class="badge b-green">Disahkan · ${esc(insp.KondisiRingkas)}</span>` : '<span class="badge b-amber">Draf inspeksi</span>') : (st.rec ? 'Belum diisi' : 'Simpan order dulu untuk mengisi inspeksi');
}

// ============================================================
// FORM INSPEKSI
// ============================================================
function setupInspeksi() {
  const combo = $('#page-inspeksi .combo');
  initCombo(combo, id => { S.ui.insp.orderId = id; loadInspeksi(id); });
  const form = $('#formInspeksi');
  form.addEventListener('change', e => {
    if (e.target.matches('[data-part]')) {
      const tr = e.target.closest('tr'); tr.classList.toggle('flag', e.target.value !== 'Baik');
      const kr = form.querySelector('[name=KondisiRingkas]:checked');
      if (e.target.value !== 'Baik' && kr && kr.value === 'Baik') form.querySelector('[name=KondisiRingkas][value="Ada Catatan"]').checked = true;
      renderTemuan();
    }
  });
  form.addEventListener('input', e => { if (e.target.matches('[data-note]')) renderTemuan(); });
  form.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (b) { const a = b.dataset.act; if (a === 'simpan') saveInspeksi('simpan', b); if (a === 'sahkan') saveInspeksi('sahkan', b); if (a === 'cetak') printInspeksi(); return; }
    const del = e.target.closest('[data-pdel]'); if (del) { e.stopPropagation(); removePhoto(del.dataset.pdel); return; }
    const slot = e.target.closest('[data-slot]'); if (slot && !form.classList.contains('locked')) pickPhoto(slot.dataset.slot);
  });
  $('#inspLegend').innerHTML = KONDISI_PART.slice(1).map(k => `<span class="badge b-slate plain">${KONDISI_ICON[k]} ${esc(k)}</span>`).join('');
}
function renderInspeksiPage() {
  const ui = S.ui.insp;
  comboSet($('#page-inspeksi .combo'), ui.orderId || '');
  if (ui.orderId && byId('orders', ui.orderId)) { if (!ui.rec || ui.rec.OrderID !== ui.orderId) loadInspeksi(ui.orderId); else showInspeksiForm(); }
  else { $('#formInspeksi').hidden = true; $('#inspPickStatus').innerHTML = ''; $('#inspEmpty').innerHTML = `<div class="card">${emptyHTML('bi-clipboard2-check', 'Pilih surat jalan pengiriman', 'Cari surat jalan Kirim Mobil di atas untuk mengisi atau melihat form inspeksi body kendaraan.')}</div>`; }
  renderInspeksiList();
}
function renderInspeksiList() {
  const box = $('#inspList');
  const rows = S.d.inspeksi.slice().sort((a, b) => String(b.DiubahPada).localeCompare(String(a.DiubahPada))).slice(0, 12);
  box.innerHTML = `<div class="card-title-row"><div><h3>Inspeksi terbaru</h3><p class="muted">Klik untuk membuka.</p></div></div>` + (rows.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>No. surat jalan</th><th>Mobil</th><th>Pelanggan</th><th>Kondisi</th><th>Status</th><th>Diperbarui</th></tr></thead><tbody>
    ${rows.map(i => { const o = byId('orders', i.OrderID) || {}; return `<tr class="clickable" data-oid="${esc(i.OrderID)}"><td class="card-title" data-label="No. SJ"><span class="t-link">${esc(o.NoSJ || i.NoSJ || 'Draf')}</span></td><td data-label="Mobil"><span class="mono">${esc(o.NoPolMobil || '—')}</span><span class="t-sub">${esc([o.Merk, o.Tipe].filter(Boolean).join(' '))}</span></td><td data-label="Pelanggan">${esc(o.NamaPelanggan || '—')}</td><td data-label="Kondisi"><span class="badge ${i.KondisiRingkas === 'Rusak' ? 'b-red' : i.KondisiRingkas === 'Ada Catatan' ? 'b-amber' : 'b-green'}">${esc(i.KondisiRingkas)}</span></td><td data-label="Status">${i.Status === 'Disahkan' ? '<span class="badge b-green plain"><i class="bi bi-patch-check"></i> Disahkan</span>' : '<span class="badge b-slate">Draf</span>'}</td><td data-label="Diperbarui" class="mono">${tglPendek(i.DiubahPada)}</td></tr>`; }).join('')}
  </tbody></table></div>` : emptyHTML('bi-clipboard', 'Belum ada inspeksi', 'Inspeksi yang disimpan akan muncul di sini.'));
  box.onclick = e => { const tr = e.target.closest('[data-oid]'); if (tr) { S.ui.insp.orderId = tr.dataset.oid; comboSet($('#page-inspeksi .combo'), tr.dataset.oid); loadInspeksi(tr.dataset.oid); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
}
function loadInspeksi(orderId) {
  const ui = S.ui.insp, o = byId('orders', orderId);
  if (!o) { renderInspeksiPage(); return; }
  const ex = S.d.inspeksi.find(i => i.OrderID === orderId);
  let checklist = []; try { checklist = JSON.parse(ex && ex.Checklist || '[]'); } catch (e) { checklist = []; }
  let foto = []; try { foto = JSON.parse(ex && ex.Foto || '[]'); } catch (e) { foto = []; }
  ui.rec = ex ? Object.assign({}, ex) : { OrderID: orderId, KondisiRingkas: 'Baik', Catatan: '', KM: '', NamaPengirim: o.NamaPelanggan || '', NamaInspektur: S.me.nama || '', NamaPenerimaUnit: o.PengemudiNama || '', Status: 'Draf' };
  ui.checklist = PARTS.map(p => Object.assign({ p, k: 'Baik', c: '' }, checklist.find(x => x.p === p) || {}));
  ui.photos = PHOTO_SLOTS.map(s => Object.assign({ slot: s }, foto.find(f => f.slot === s) || {}));
  showInspeksiForm();
}
function showInspeksiForm() {
  const ui = S.ui.insp, rec = ui.rec, o = byId('orders', rec.OrderID), form = $('#formInspeksi');
  $('#inspEmpty').innerHTML = ''; form.hidden = false;
  const locked = rec.Status === 'Disahkan' && !isSA();
  form.classList.toggle('locked', locked);
  $('#inspPickStatus').innerHTML = rec.Status === 'Disahkan' ? `<span class="badge b-green plain"><i class="bi bi-patch-check"></i> Disahkan ${tglPendek(rec.DisahkanPada)}</span>` : rec.ID ? '<span class="badge b-amber">Draf tersimpan</span>' : '<span class="badge b-slate">Baru</span>';
  $('[data-insp="NoSJ"]').textContent = o.NoSJ || 'Belum terbit';
  $('[data-insp="Tanggal"]').textContent = tglPendek(rec.Tanggal || today());
  const kv = [['Jenis / model', [o.Merk, o.Tipe, o.JenisMobil, o.Model].filter(Boolean).join(' ') || '—'], ['No. polisi', o.NoPolMobil || '—'], ['No. rangka (VIN)', o.NoRangka || '—'], ['Warna / tahun', [o.Warna, o.Tahun].filter(Boolean).join(' · ') || '—'], ['Pengirim', o.NamaPelanggan || '—'], ['Penerima', o.PenerimaNama || '—']];
  $('#inspVehicle').innerHTML = kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  form.querySelector('[name=KM]').value = rec.KM ? fnum(rec.KM) : '';
  form.querySelectorAll('[name=KondisiRingkas]').forEach(r => { r.checked = r.value === rec.KondisiRingkas; r.disabled = locked; });
  ['Catatan', 'NamaPengirim', 'NamaInspektur', 'NamaPenerimaUnit'].forEach(k => { const el = form.querySelector(`[name=${k}]`); el.value = rec[k] || ''; el.readOnly = locked; });
  form.querySelector('[name=KM]').readOnly = locked;
  $('#inspChecklist').innerHTML = ui.checklist.map((c, i) => `<tr class="${c.k !== 'Baik' ? 'flag' : ''}"><td>${esc(c.p)}</td><td><select class="input" data-part="${i}" ${locked ? 'disabled' : ''}>${KONDISI_PART.map(k => `<option ${k === c.k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></td><td><input class="input" data-note="${i}" value="${esc(c.c)}" placeholder="—" ${locked ? 'readonly' : ''} maxlength="160"></td></tr>`).join('');
  $('#inspCount').textContent = PARTS.length + ' bagian diperiksa';
  renderTemuan(); renderPhotos();
  $('#inspInfo').innerHTML = !o.NoSJ ? '<i class="bi bi-info-circle"></i> Konfirmasi surat jalan dulu agar inspeksi bisa disahkan.' : rec.Status === 'Disahkan' ? `<i class="bi bi-patch-check"></i> Disahkan oleh ${esc(rec.DisahkanOleh || '')}${locked ? ' · hanya Super Admin yang dapat mengubah' : ''}` : '<i class="bi bi-pencil"></i> Isi checklist, unggah foto, lalu sahkan.';
  form.querySelector('[data-act="simpan"]').hidden = locked;
  form.querySelector('[data-act="sahkan"]').hidden = locked || (rec.Status === 'Disahkan' && !isSA());
  form.querySelector('[data-act="sahkan"]').innerHTML = rec.Status === 'Disahkan' ? '<i class="bi bi-patch-check"></i> Simpan &amp; sahkan ulang' : '<i class="bi bi-patch-check"></i> Sahkan &amp; lampirkan';
  form.querySelector('.lock-banner').hidden = !locked;
  if (locked) { const lb = form.querySelector('.lock-banner'); lb.className = 'lock-banner'; lb.innerHTML = '<span class="lb-ic"><i class="bi bi-lock-fill"></i></span><div class="grow"><b>Inspeksi sudah disahkan dan dilampirkan ke surat jalan.</b><span>Hanya Super Admin yang dapat mengubah. Anda tetap dapat mencetak form fisik.</span></div>'; }
}
function collectChecklist() {
  const ui = S.ui.insp;
  $$('#inspChecklist [data-part]').forEach(s => { ui.checklist[Number(s.dataset.part)].k = s.value; });
  $$('#inspChecklist [data-note]').forEach(s => { ui.checklist[Number(s.dataset.note)].c = s.value.trim(); });
  return ui.checklist;
}
function temuanList() {
  return collectChecklist().filter(c => c.k !== 'Baik').map(c => `${c.p}: ${c.k.toLowerCase()}${c.c ? ' — ' + c.c : ''}`);
}
function renderTemuan() {
  const t = temuanList();
  $('#inspTemuan').innerHTML = t.length ? t.map((x, i) => `<li class="${i === 0 ? 'first' : ''}">${esc(x)}</li>`).join('') : '<li class="muted" style="list-style:none;margin-left:-20px"><i class="bi bi-check2-circle"></i> Tidak ada temuan. Semua bagian dalam kondisi baik.</li>';
}
function renderPhotos() {
  const ui = S.ui.insp, locked = $('#formInspeksi').classList.contains('locked');
  $('#inspPhotos').innerHTML = ui.photos.map(p => {
    const thumb = p.local || (p.id && S.thumbs[p.id]);
    if (p.id && S.thumbs[p.id] === undefined && !p.loading) loadThumb(p);
    return `<div class="photo ${p.id || p.local ? 'filled' : ''}" data-slot="${esc(p.slot)}" role="button" tabindex="0" aria-label="Foto ${esc(p.slot)}">
      <span class="ph-label">${esc(p.slot)}</span>
      ${thumb ? `<img src="${thumb}" alt="Foto ${esc(p.slot)}">` : p.id ? (S.thumbs[p.id] === '' ? '<i class="bi bi-cloud-check"></i><span>Tersimpan di Drive</span>' : '<i class="bi bi-image"></i><span>Memuat…</span>') : `<i class="bi bi-camera"></i><span>${locked ? 'Tidak ada foto' : 'Ambil / pilih foto'}</span>`}
      ${(p.id || p.local) && !locked && !p.busy ? `<button type="button" class="ph-del" data-pdel="${esc(p.slot)}" aria-label="Hapus foto"><i class="bi bi-trash"></i></button>` : ''}
      ${p.busy ? '<div class="ph-busy"><span class="spin" style="width:22px;height:22px;border:3px solid var(--primary);border-right-color:transparent;border-radius:50%;animation:rot .7s linear infinite"></span></div>' : ''}</div>`;
  }).join('');
  $('#inspFotoCount').textContent = ui.photos.filter(p => p.id).length + '/' + PHOTO_SLOTS.length + ' terisi · dikompres otomatis';
}
function loadThumb(p) {
  p.loading = true;
  api('getFotoThumb', S.token, p.id).then(r => { S.thumbs[p.id] = r.data; }).catch(() => { S.thumbs[p.id] = ''; }).finally(() => { p.loading = false; if (S.page === 'inspeksi') renderPhotos(); });
}
function compressImage(file, maxDim, q) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const sc = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('File bukan gambar yang valid.')); };
    img.src = url;
  });
}
function pickPhoto(slot) {
  const fp = $('#filePicker');
  fp.value = ''; fp.setAttribute('capture', 'environment');
  fp.onchange = () => {
    const file = fp.files && fp.files[0]; if (!file) return;
    if (!/^image[/]/.test(file.type)) { toast('warning', 'Bukan gambar', 'Pilih file JPG, PNG, atau WEBP.'); return; }
    const p = S.ui.insp.photos.find(x => x.slot === slot);
    Promise.all([compressImage(file, 1600, 0.82), compressImage(file, 420, 0.7)]).then(([big, small]) => {
      p.local = small; p.busy = true; renderPhotos();
      const b64 = big.split(',')[1];
      if (b64.length * 0.75 > 5 * 1024 * 1024) throw new Error('Foto melebihi 5 MB setelah dikompres.');
      return api('uploadFotoInspeksi', S.token, b64, 'image/jpeg', `${(byId('orders', S.ui.insp.rec.OrderID) || {}).NoSJ || 'draf'}_${slot.replace(/\s+/g, '-')}.jpg`).then(r => {
        p.id = r.data.id; p.name = r.data.name; S.thumbs[p.id] = small; p.busy = false; renderPhotos();
        toast('success', 'Foto ' + slot.toLowerCase() + ' terunggah', 'Klik Simpan untuk menyimpan inspeksi.');
      });
    }).catch(err => { p.busy = false; delete p.local; renderPhotos(); fail(err, 'Foto gagal diunggah'); });
  };
  fp.click();
}
function removePhoto(slot) {
  const p = S.ui.insp.photos.find(x => x.slot === slot); if (!p) return;
  delete p.id; delete p.local; delete p.name; renderPhotos();
}
function saveInspeksi(action, btn) {
  const ui = S.ui.insp, form = $('#formInspeksi'), o = byId('orders', ui.rec.OrderID);
  if (ui.photos.some(p => p.busy)) { toast('warning', 'Foto masih diunggah', 'Tunggu hingga unggahan selesai.'); return; }
  const kondisi = (form.querySelector('[name=KondisiRingkas]:checked') || {}).value || 'Baik';
  const data = {
    ID: ui.rec.ID || '', OrderID: ui.rec.OrderID, KM: String(num(form.querySelector('[name=KM]').value)), KondisiRingkas: kondisi,
    Checklist: JSON.stringify(collectChecklist()), Temuan: JSON.stringify(temuanList()),
    Foto: JSON.stringify(ui.photos.filter(p => p.id).map(p => ({ slot: p.slot, id: p.id, name: p.name || '' }))),
    Catatan: form.querySelector('[name=Catatan]').value.trim(), NamaPengirim: form.querySelector('[name=NamaPengirim]').value.trim(),
    NamaInspektur: form.querySelector('[name=NamaInspektur]').value.trim(), NamaPenerimaUnit: form.querySelector('[name=NamaPenerimaUnit]').value.trim()
  };
  const run = () => {
    btnBusy(btn, true, action === 'sahkan' ? 'Mengesahkan…' : 'Menyimpan…');
    api('saveInspeksi', S.token, data, action).then(r => {
      upsert('inspeksi', r.data.inspeksi); upsert('orders', r.data.order); saveCache();
      ui.rec = Object.assign({}, r.data.inspeksi); showInspeksiForm(); renderInspeksiList(); updateInspBox(); ok(r.message);
    }).catch(err => fail(err, 'Inspeksi gagal disimpan')).finally(() => btnBusy(btn, false));
  };
  if (action !== 'sahkan') return run();
  if (!o.NoSJ) { toast('warning', 'Surat jalan belum terbit', 'Konfirmasi form pengiriman dulu.'); return; }
  if (kondisi === 'Rusak' && !temuanList().length && !data.Catatan) { toast('warning', 'Keterangan wajib', 'Kondisi rusak harus disertai temuan pada checklist atau keterangan.'); return; }
  confirmDialog({
    title: 'Sahkan hasil inspeksi?', icon: 'bi-patch-check', ok: 'Sahkan & lampirkan', okIcon: 'bi-patch-check',
    html: `Hasil inspeksi dilampirkan ke surat jalan ${esc(o.NoSJ)}. Setelah disahkan hanya Super Admin yang dapat mengubah.<div class="confirm-sum"><div><span>Kondisi eksterior</span><b>${esc(kondisi)} · ${temuanList().length} temuan</b></div><div><span>KM odometer</span><b>${fnum(data.KM)} km</b></div><div><span>Foto</span><b>${ui.photos.filter(p => p.id).length}/${PHOTO_SLOTS.length}</b></div></div>`
  }).then(v => { if (v === true) run(); });
}

// ============================================================
// FINANCE (Super Admin)
// ============================================================
function periodRange(p, from, to) {
  const t = today(), mk = monthKey(t);
  if (p === 'bulan') return [mk + '-01', t];
  if (p === 'bulanlalu') { const pm = monthKey(addDays(mk + '-01', -1)); return [pm + '-01', addDays(mk + '-01', -1)]; }
  if (p === '3bulan') { const ms = lastMonths(3); return [ms[0] + '-01', t]; }
  if (p === 'tahun') return [t.slice(0, 4) + '-01-01', t];
  if (p === 'semua') return ['0000-01-01', '9999-12-31'];
  return [from || '0000-01-01', to || '9999-12-31'];
}
function rekName(id) { const r = byId('rekening', id); return r ? r.Bank + ' · ' + r.Alias : '—'; }
function renderFinance() {
  const el = $('#page-finance'), f = S.ui.fin;
  const [from, to] = periodRange(f.period, f.from, f.to);
  const fin = S.d.finance.filter(x => x.Status !== 'Batal' && x.Tanggal >= from && x.Tanggal <= to);
  const sum = (fn) => fin.filter(fn).reduce((a, x) => a + num(x.Nominal), 0);
  const masuk = sum(x => x.Jenis === 'Pemasukan'), keluar = sum(x => x.Jenis === 'Pengeluaran');
  const masukSewa = sum(x => x.Jenis === 'Pemasukan' && x.Layanan === 'Sewa'), masukKirim = sum(x => x.Jenis === 'Pemasukan' && x.Layanan === 'Kirim'), masukPaket = sum(x => x.Jenis === 'Pemasukan' && x.Layanan === 'Paket');
  const piutangInv = S.d.invoices.filter(i => i.Status === 'Belum Lunas');
  const piutang = piutangInv.reduce((a, i) => a + num(i.Tagihan), 0) + S.d.finance.filter(x => x.Jenis === 'Piutang' && x.Status === 'Belum Lunas').reduce((a, x) => a + num(x.Nominal), 0);
  const utang = S.d.finance.filter(x => x.Jenis === 'Utang' && x.Status === 'Belum Lunas').reduce((a, x) => a + num(x.Nominal), 0);
  const laba = masuk - keluar;
  const tabs = [['semua', 'Semua transaksi', () => true], ['sewa', 'Pemasukan sewa', x => x.Jenis === 'Pemasukan' && x.Layanan === 'Sewa'], ['kirim', 'Pemasukan kirim', x => x.Jenis === 'Pemasukan' && x.Layanan === 'Kirim'], ['paket', 'Pemasukan paket', x => x.Jenis === 'Pemasukan' && x.Layanan === 'Paket'],
    ['ops', 'Operasional & pengeluaran', x => x.Jenis === 'Pengeluaran'], ['up', 'Utang & piutang', x => x.Jenis === 'Utang' || x.Jenis === 'Piutang']];
  const biaya = Object.entries(fin.filter(x => x.Jenis === 'Pengeluaran').reduce((m, x) => { m[x.Kategori || 'Lainnya'] = (m[x.Kategori || 'Lainnya'] || 0) + num(x.Nominal); return m; }, {})).sort((a, b) => b[1] - a[1]);
  const perRek = S.d.rekening.map(r => ({ r, inn: fin.filter(x => x.RekeningID === r.ID && x.Jenis === 'Pemasukan').reduce((a, x) => a + num(x.Nominal), 0), out: fin.filter(x => x.RekeningID === r.ID && x.Jenis === 'Pengeluaran').reduce((a, x) => a + num(x.Nominal), 0) })).filter(x => x.inn || x.out || String(x.r.Aktif) === 'true');
  const noRek = fin.filter(x => !x.RekeningID && (x.Jenis === 'Pemasukan' || x.Jenis === 'Pengeluaran'));
  const colors = ['#DC2626', '#EA580C', '#2563EB', '#475569', '#7C3AED', '#0D9488'];
  el.innerHTML = `
  <div class="page-head">
    <div class="ph-icon"><i class="bi bi-wallet2"></i></div>
    <div><span class="chip chip-soft">SUPER ADMIN</span><h1 style="margin-top:6px">Keuangan &amp; Finance</h1><p class="muted">Pembukuan kas masuk, pengeluaran operasional, utang, dan piutang. Pemasukan order tercatat otomatis lewat kode unik.</p></div>
    <div class="ph-actions"><button class="btn btn-primary" id="finAdd"><i class="bi bi-plus-lg"></i> Tambah transaksi</button></div>
  </div>
  <div class="card" style="margin-bottom:16px"><div class="toolbar" style="margin:0">
    <div class="chips-row">${[['bulan', 'Bulan ini'], ['bulanlalu', 'Bulan lalu'], ['3bulan', '3 bulan'], ['tahun', 'Tahun ini'], ['semua', 'Semua'], ['custom', 'Rentang…']].map(([k, l]) => `<button class="fchip ${f.period === k ? 'active' : ''}" data-per="${k}">${l}</button>`).join('')}</div>
    ${f.period === 'custom' ? `<input class="input" type="date" id="finFrom" value="${esc(f.from)}" style="width:auto"><span class="muted">s/d</span><input class="input" type="date" id="finTo" value="${esc(f.to)}" style="width:auto">` : `<span class="muted" style="font-size:12.5px"><i class="bi bi-calendar3"></i> ${f.period === 'semua' ? 'Seluruh periode' : tgl(from) + ' – ' + tgl(to)}</span>`}
  </div></div>
  <div class="kpis five">
    ${kpi('Pemasukan', rp(masuk), 'bi-graph-up-arrow', 'ic-green', `Sewa ${rp(masukSewa)} · Kirim ${rp(masukKirim)} · Paket ${rp(masukPaket)}`, 'money')}
    ${kpi('Pengeluaran', rp(keluar), 'bi-fuel-pump', 'ic-red', masuk ? Math.round(keluar / masuk * 100) + '% dari pemasukan' : 'BBM, tol, uang jalan, servis', 'money')}
    ${kpi('Laba operasional', rp(laba), 'bi-piggy-bank', 'ic-primary', masuk ? 'Margin ' + Math.round(laba / masuk * 100) + '% · sebelum pajak' : 'Sebelum pajak & depresiasi', 'money', laba >= 0 ? 'ok' : 'danger')}
    ${kpi('Piutang belum lunas', rp(piutang), 'bi-hourglass-split', 'ic-amber', piutangInv.length + ' invoice + piutang manual', 'money')}
    ${kpi('Utang belum lunas', rp(utang), 'bi-credit-card-2-back', 'ic-indigo', S.d.finance.filter(x => x.Jenis === 'Utang' && x.Status === 'Belum Lunas').length + ' catatan utang', 'money')}
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="toolbar">
      <div class="tabs" style="margin:0;box-shadow:none;flex:1">${tabs.map(([k, l, fn]) => `<button class="tab ${f.tab === k ? 'active' : ''}" data-tab="${k}">${l} <span class="badge b-slate plain">${fin.filter(fn).length}</span></button>`).join('')}</div>
    </div>
    <div class="toolbar" style="margin:0">
      <div class="search grow"><i class="bi bi-search"></i><input class="input" id="finQ" placeholder="Cari kode unik, pihak, keterangan…" value="${esc(f.q)}"></div>
      <select class="input" id="finRek" style="width:auto;min-width:220px"><option value="">Semua akun / rekening</option>${S.d.rekening.map(r => `<option value="${esc(r.ID)}" ${f.rek === r.ID ? 'selected' : ''}>${esc(r.Bank)} · ${esc(r.Alias)}</option>`).join('')}</select>
    </div>
  </div>
  <div class="table-card" id="finTable"></div>
  <div class="grid-3 mt">
    <div class="card"><div class="card-title-row"><div><h3>Pemasukan vs pengeluaran</h3><p class="muted">6 bulan terakhir</p></div></div><div class="chart-box" style="height:220px"><canvas id="chFin"></canvas></div></div>
    <div class="card"><div class="card-title-row"><div><h3>Struktur biaya operasional</h3><p class="muted">${rp(keluar)} pada periode ini</p></div></div>
      ${biaya.length ? biaya.slice(0, 6).map(([k, v], i) => `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;gap:8px"><span>${esc(k)}</span><b class="mono">${rp(v)} <span class="muted">(${keluar ? Math.round(v / keluar * 100) : 0}%)</span></b></div><div class="bar"><span style="width:${keluar ? v / keluar * 100 : 0}%;background:${colors[i % colors.length]}"></span></div></div>`).join('') : emptyHTML('bi-pie-chart', 'Belum ada pengeluaran', 'Catat BBM, tol, dan servis lewat Tambah transaksi.')}
    </div>
    <div class="card"><div class="card-title-row"><div><h3>Arus kas per rekening</h3><p class="muted">Tercatat di aplikasi pada periode ini (bukan saldo bank).</p></div></div>
      <div class="rek-list">${perRek.length ? perRek.map(x => `<div class="rek"><span class="bank">${esc(x.r.Bank)}</span><div style="flex:1;min-width:0"><b style="font-size:13px">${esc(x.r.Alias)}</b><div class="muted mono" style="font-size:11.5px">+${fnum(x.inn)} / −${fnum(x.out)}</div></div><b class="mono ${x.inn - x.out >= 0 ? 'amount-in' : 'amount-out'}">${rp(x.inn - x.out)}</b></div>`).join('') : '<p class="muted">Belum ada rekening.</p>'}
      ${noRek.length ? `<p class="muted" style="font-size:12px"><i class="bi bi-info-circle"></i> ${noRek.length} transaksi belum memiliki rekening.</p>` : ''}</div>
    </div>
  </div>`;
  el.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { f.period = b.dataset.per; f.page = 1; renderFinance(); });
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { f.tab = b.dataset.tab; f.page = 1; renderFinance(); });
  if ($('#finFrom')) { $('#finFrom').onchange = e => { f.from = e.target.value; renderFinance(); }; $('#finTo').onchange = e => { f.to = e.target.value; renderFinance(); }; }
  $('#finQ').addEventListener('input', debounce(e => { f.q = e.target.value; f.page = 1; renderFinanceTable(fin, tabs); }, 150));
  $('#finRek').onchange = e => { f.rek = e.target.value; f.page = 1; renderFinanceTable(fin, tabs); };
  $('#finAdd').onclick = () => openFinanceModal(null);
  renderFinanceTable(fin, tabs);
  const months = lastMonths(6), all = S.d.finance.filter(x => x.Status !== 'Batal'), c = chartColors();
  const s = j => months.map(m => all.filter(x => x.Jenis === j && monthKey(x.Tanggal) === m).reduce((a, x) => a + num(x.Nominal), 0));
  drawChart('chFin', { type: 'bar', data: { labels: months.map(monthLabel), datasets: [{ label: 'Pemasukan', data: s('Pemasukan'), backgroundColor: c.primary, borderRadius: 5, maxBarThickness: 22 }, { label: 'Pengeluaran', data: s('Pengeluaran'), backgroundColor: c.red, borderRadius: 5, maxBarThickness: 22 }] } });
}
function renderFinanceTable(fin, tabs) {
  const f = S.ui.fin, size = 20, q = f.q.trim().toLowerCase();
  const tabFn = (tabs.find(t => t[0] === f.tab) || tabs[0])[2];
  const list = fin.filter(tabFn).filter(x => (!f.rek || x.RekeningID === f.rek) && (!q || [x.KodeRef, x.Pihak, x.Keterangan, x.Kategori].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => String(b.Tanggal + b.DibuatPada).localeCompare(String(a.Tanggal + a.DibuatPada)));
  const pages = Math.max(1, Math.ceil(list.length / size)); if (f.page > pages) f.page = pages;
  const rows = list.slice((f.page - 1) * size, f.page * size);
  const sign = x => x.Jenis === 'Pemasukan' || x.Jenis === 'Piutang' ? 1 : -1;
  const wrap = $('#finTable');
  wrap.innerHTML = rows.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Tanggal</th><th>Kode unik &amp; ref</th><th>Layanan / divisi</th><th>Keterangan &amp; pihak</th><th>Akun</th><th>Kategori</th><th class="t-num">Nominal</th><th>Status</th><th class="t-actions"></th></tr></thead><tbody>
    ${rows.map(x => `<tr class="${x.Sumber === 'Manual' ? 'clickable' : ''}" data-id="${esc(x.ID)}"><td data-label="Tanggal" class="mono">${tglPendek(x.Tanggal)}</td>
      <td class="card-title" data-label="Kode"><span class="chip ${String(x.KodeRef).startsWith('SW') ? 'b-green' : String(x.KodeRef).startsWith('KR') ? 'b-indigo' : 'b-slate'} mono">${esc(x.KodeRef)}</span><span class="t-sub">${esc(x.Sumber === 'Manual' ? 'Input manual' : 'Otomatis · ' + x.Sumber)}</span></td>
      <td data-label="Layanan"><span class="svc ${x.Layanan === 'Kirim' ? 'svc-kirim' : 'svc-sewa'}">${esc(x.Layanan || '—')}</span></td>
      <td data-label="Keterangan"><span class="t-strong">${esc(x.Pihak || '—')}</span><span class="t-sub">${esc(x.Keterangan || '')}</span></td>
      <td data-label="Akun">${esc(rekName(x.RekeningID))}<span class="t-sub">${esc(x.Metode || '')}</span></td>
      <td data-label="Kategori">${esc(x.Kategori)}<span class="t-sub">${esc(x.Jenis)}</span></td>
      <td data-label="Nominal" class="t-num ${sign(x) > 0 ? 'amount-in' : 'amount-out'}">${sign(x) > 0 ? '+' : '−'}${rp(x.Nominal).replace('Rp ', 'Rp ')}</td>
      <td data-label="Status"><span class="badge ${x.Status === 'Belum Lunas' ? 'b-amber' : 'b-green'}">${esc(x.Status)}</span></td>
      <td class="t-actions">${x.Sumber === 'Manual' ? `<button class="icon-btn" data-fe="${esc(x.ID)}" title="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn" data-fd="${esc(x.ID)}" title="Hapus"><i class="bi bi-trash"></i></button>` : '<i class="bi bi-lock muted" title="Transaksi otomatis"></i>'}</td></tr>`).join('')}
  </tbody></table></div><div class="table-foot"><span>Menampilkan ${rows.length} dari ${list.length} mutasi · Net <b class="mono">${rp(list.reduce((a, x) => a + (x.Jenis === 'Pemasukan' ? 1 : x.Jenis === 'Pengeluaran' ? -1 : 0) * num(x.Nominal), 0))}</b></span>${pagerHTML(list.length, f.page, size, 'pg')}</div>`
    : emptyHTML('bi-journal-x', 'Belum ada transaksi', 'Tidak ada transaksi untuk filter dan periode ini.', '<br><button class="btn btn-primary" data-fadd><i class="bi bi-plus-lg"></i> Tambah transaksi</button>');
  wrap.onclick = e => {
    const pg = e.target.closest('[data-pg]'); if (pg) { f.page = Number(pg.dataset.pg); renderFinanceTable(fin, tabs); return; }
    if (e.target.closest('[data-fadd]')) { openFinanceModal(null); return; }
    const del = e.target.closest('[data-fd]'); if (del) { e.stopPropagation(); deleteFinance(del.dataset.fd); return; }
    const ed = e.target.closest('[data-fe]') || e.target.closest('tr.clickable'); if (ed) openFinanceModal(byId('finance', ed.dataset.fe || ed.dataset.id));
  };
}
const FIN_KAT = {
  Pemasukan: ['Pelunasan Sewa', 'Pelunasan Kirim', 'DP Sewa', 'DP Kirim', 'Pendapatan Lain'],
  Pengeluaran: ['BBM & Solar', 'Tol & Parkir', 'Uang Makan & Jalan Driver', 'Servis, KIR & Ban', 'Sparepart', 'Gaji', 'Pajak Kendaraan', 'Sewa Pool', 'Lainnya'],
  Utang: ['Utang Vendor', 'Cicilan Armada', 'Utang Lain'], Piutang: ['Piutang Pelanggan', 'Kasbon Driver', 'Piutang Lain']
};
function openFinanceModal(rec) {
  const d = Object.assign({ Jenis: 'Pengeluaran', Tanggal: today(), Layanan: 'Operasional', Metode: 'Transfer', Status: '' }, rec || {});
  const body = `<form id="finForm" novalidate>
    <div class="tabs" id="finJenis" style="margin-bottom:16px">${['Pemasukan', 'Pengeluaran', 'Utang', 'Piutang'].map(j => `<button type="button" class="tab ${d.Jenis === j ? 'active' : ''}" data-j="${j}">${j}</button>`).join('')}</div>
    <input type="hidden" name="Jenis" value="${esc(d.Jenis)}">
    <div class="row-2">
      <label class="field"><span class="label req">Tanggal transaksi</span><input class="input" type="date" name="Tanggal" value="${esc(d.Tanggal)}"></label>
      <label class="field"><span class="label req">Akun / kas</span><select class="input" name="RekeningID"><option value="">Pilih rekening</option>${S.d.rekening.filter(r => String(r.Aktif) === 'true' || r.ID === d.RekeningID).map(r => `<option value="${esc(r.ID)}" ${r.ID === d.RekeningID ? 'selected' : ''}>${esc(r.Bank)} ${esc(r.NoRekening)} · ${esc(r.Alias)}</option>`).join('')}</select></label>
      <label class="field"><span class="label req">Divisi / layanan</span><select class="input" name="Layanan">${['Sewa', 'Kirim', 'Operasional', 'Lainnya'].map(l => `<option ${l === d.Layanan ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span class="label req">Kategori</span><input class="input" name="Kategori" list="dlKat" value="${esc(d.Kategori || '')}" placeholder="Pilih atau ketik"><datalist id="dlKat"></datalist></label>
      <label class="field"><span class="label">Pihak terkait</span><input class="input" name="Pihak" value="${esc(d.Pihak || '')}" placeholder="Pelanggan / vendor / pengemudi"></label>
      <label class="field"><span class="label req">Nominal</span><div class="prefix-input"><span>Rp</span><input class="input money" name="Nominal" inputmode="numeric" value="${d.Nominal ? fnum(d.Nominal) : ''}" placeholder="0"></div></label>
      <label class="field"><span class="label">Metode</span><select class="input" name="Metode">${['Transfer', 'Tunai', 'Kas Kecil', 'Kartu', 'Lainnya'].map(m => `<option ${m === d.Metode ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="field" data-stat><span class="label">Status</span><select class="input" name="Status"><option>Belum Lunas</option><option>Lunas</option></select></label>
      <label class="field"><span class="label">Kode unik / ref</span><input class="input mono" name="KodeRef" value="${esc(d.KodeRef || '')}" placeholder="Otomatis bila kosong"></label>
    </div>
    <label class="field"><span class="label">Keterangan</span><textarea class="input" name="Keterangan" rows="2">${esc(d.Keterangan || '')}</textarea></label>
  </form>`;
  openModal({ title: rec ? 'Ubah transaksi' : 'Tambah transaksi keuangan', sub: 'Kas masuk, pengeluaran operasional, utang, atau piutang.', icon: 'bi-journal-plus', size: 'lg', body,
    foot: '<span class="mf-note"><i class="bi bi-lock"></i> Khusus Super Admin</span><button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="finSave"><i class="bi bi-check2"></i> Simpan transaksi</button>' });
  const form = $('#finForm');
  const sync = () => {
    const j = form.querySelector('[name=Jenis]').value;
    $('#dlKat').innerHTML = (FIN_KAT[j] || []).map(k => `<option>${esc(k)}</option>`).join('');
    const st = form.querySelector('[data-stat]'); st.hidden = !(j === 'Utang' || j === 'Piutang');
    if (!st.hidden) form.querySelector('[name=Status]').value = d.Status === 'Lunas' ? 'Lunas' : 'Belum Lunas';
  };
  $('#finJenis').onclick = e => { const b = e.target.closest('[data-j]'); if (!b) return; $$('#finJenis .tab').forEach(t => t.classList.toggle('active', t === b)); form.querySelector('[name=Jenis]').value = b.dataset.j; sync(); };
  form.addEventListener('input', e => { if (e.target.classList.contains('money')) formatMoneyInput(e.target); });
  sync();
  $('#finSave').onclick = () => {
    const v = formValues(form); v.Nominal = String(num(v.Nominal));
    if (!['Utang', 'Piutang'].includes(v.Jenis)) v.Status = 'Tercatat';
    if (!v.Kategori || !(num(v.Nominal) > 0) || !v.RekeningID) { toast('warning', 'Lengkapi data', 'Kategori, nominal, dan akun wajib diisi.'); return; }
    if (rec) v.ID = rec.ID;
    const b = $('#finSave'); btnBusy(b, true, 'Menyimpan…');
    api('saveFinance', S.token, v).then(r => { upsert('finance', r.data); closeModal(); ok(r.message); renderFinance(); }).catch(fail).finally(() => btnBusy(b, false));
  };
}
function deleteFinance(id) {
  const x = byId('finance', id); if (!x) return;
  confirmDialog({ title: 'Hapus transaksi?', text: `${x.KodeRef} · ${rp(x.Nominal)} akan dihapus.`, variant: 'danger', icon: 'bi-trash', ok: 'Hapus' }).then(v => {
    if (v !== true) return;
    removeFrom('finance', id); renderFinance();
    api('deleteFinance', S.token, id).then(() => ok('Transaksi dihapus')).catch(err => { upsert('finance', x); renderFinance(); fail(err); });
  });
}

// ============================================================
// LAPORAN & EXPORT (Super Admin)
// ============================================================
function reportData() {
  const f = S.ui.lap;
  const from = f.from || '0000-01-01', to = f.to || '9999-12-31';
  const inRange = d => { const x = String(d || '').slice(0, 10); return x >= from && x <= to; };
  if (f.jenis === 'order') {
    const list = sortOrders(S.d.orders.filter(o => o.StatusDok === 'Terkonfirmasi' && inRange(o.Tanggal) && (!f.svc || o.Layanan === f.svc) && (!f.status || o.Status === f.status)));
    return { title: 'Rekap Order & Surat Jalan', head: ['No. SJ / resi', 'Tanggal', 'Layanan', 'Pelanggan', 'Armada / mobil / isi', 'Pengemudi', 'Rute', 'Status', 'Pembayaran', 'Total'],
      rows: list.map(o => [o.NoSJ, tglPendek(o.Tanggal), o.Layanan === 'sewa' ? 'Sewa ' + (o.JenisKendaraan || '') : o.Layanan === 'paket' ? 'Paket' : 'Kirim ' + (o.JenisLayanan || ''), o.NamaPelanggan, o.Layanan === 'sewa' ? o.NoPol : o.Layanan === 'paket' ? paketRingkas(o) : [o.Merk, o.Tipe, o.NoPolMobil].filter(Boolean).join(' '), o.PengemudiNama || '', orderRoute(o).filter(Boolean).join(' → '), o.Status, o.Pembayaran, num(o.Total)]),
      money: [9], kpi: [['Surat jalan', fnum(list.length)], ['Sewa', fnum(list.filter(o => o.Layanan === 'sewa').length)], ['Kirim / paket', fnum(list.filter(o => o.Layanan === 'kirim').length) + ' / ' + fnum(list.filter(o => o.Layanan === 'paket').length)], ['Nilai order', rp(list.filter(o => o.Status !== 'Dibatalkan').reduce((a, o) => a + num(o.Total), 0))]],
      chart: () => { const ms = Array.from(new Set(list.map(o => monthKey(o.Tanggal)))).sort().slice(-12); return { type: 'bar', money: false, data: { labels: ms.map(monthLabel), datasets: [{ label: 'Sewa', data: ms.map(m => list.filter(o => o.Layanan === 'sewa' && monthKey(o.Tanggal) === m).length), backgroundColor: chartColors().primary, borderRadius: 5 }, { label: 'Kirim', data: ms.map(m => list.filter(o => o.Layanan === 'kirim' && monthKey(o.Tanggal) === m).length), backgroundColor: chartColors().indigo, borderRadius: 5 }, { label: 'Paket', data: ms.map(m => list.filter(o => o.Layanan === 'paket' && monthKey(o.Tanggal) === m).length), backgroundColor: chartColors().amber || '#F59E0B', borderRadius: 5 }] } }; } };
  }
  if (f.jenis === 'invoice') {
    const st = f.status;
    const list = S.d.invoices.filter(i => inRange(i.Tanggal) && (!f.svc || i.Layanan === f.svc) && (!st || i.Status === st)).sort((a, b) => String(a.JatuhTempo).localeCompare(String(b.JatuhTempo)));
    const t = today();
    return { title: 'Invoice & Piutang', head: ['No. invoice', 'No. SJ', 'Pelanggan', 'Layanan', 'Tanggal', 'Jatuh tempo', 'Metode', 'Status', 'Tgl bayar', 'Tagihan'],
      rows: list.map(i => [i.NoInvoice, i.NoSJ, i.NamaPelanggan, LAY_LABEL[i.Layanan] || 'Kirim', tglPendek(i.Tanggal), tglPendek(i.JatuhTempo), i.Pembayaran, i.Status === 'Belum Lunas' && i.JatuhTempo < t ? 'Lewat jatuh tempo' : i.Status, i.TglBayar ? tglPendek(i.TglBayar) : '', num(i.Tagihan)]),
      money: [9], kpi: [['Invoice', fnum(list.length)], ['Belum lunas', rp(list.filter(i => i.Status === 'Belum Lunas').reduce((a, i) => a + num(i.Tagihan), 0))], ['Lewat jatuh tempo', rp(list.filter(i => i.Status === 'Belum Lunas' && i.JatuhTempo < t).reduce((a, i) => a + num(i.Tagihan), 0))], ['Sudah lunas', rp(list.filter(i => i.Status === 'Lunas').reduce((a, i) => a + num(i.Tagihan), 0))]],
      chart: null };
  }
  if (f.jenis === 'finance') {
    const list = S.d.finance.filter(x => x.Status !== 'Batal' && inRange(x.Tanggal) && (!f.svc || x.Layanan === LAY_LABEL[f.svc])).sort((a, b) => String(a.Tanggal).localeCompare(String(b.Tanggal)));
    const inn = list.filter(x => x.Jenis === 'Pemasukan').reduce((a, x) => a + num(x.Nominal), 0), out = list.filter(x => x.Jenis === 'Pengeluaran').reduce((a, x) => a + num(x.Nominal), 0);
    return { title: 'Arus Kas & Buku Besar', head: ['Tanggal', 'Kode unik', 'Jenis', 'Kategori', 'Layanan', 'Pihak', 'Keterangan', 'Akun', 'Status', 'Nominal'],
      rows: list.map(x => [tglPendek(x.Tanggal), x.KodeRef, x.Jenis, x.Kategori, x.Layanan, x.Pihak, x.Keterangan, rekName(x.RekeningID), x.Status, (x.Jenis === 'Pengeluaran' || x.Jenis === 'Utang' ? -1 : 1) * num(x.Nominal)]),
      money: [9], kpi: [['Pemasukan', rp(inn)], ['Pengeluaran', rp(out)], ['Laba operasional', rp(inn - out)], ['Transaksi', fnum(list.length)]],
      chart: () => { const ms = Array.from(new Set(list.map(x => monthKey(x.Tanggal)))).sort().slice(-12); const c = chartColors(); return { type: 'bar', data: { labels: ms.map(monthLabel), datasets: [{ label: 'Pemasukan', data: ms.map(m => list.filter(x => x.Jenis === 'Pemasukan' && monthKey(x.Tanggal) === m).reduce((a, x) => a + num(x.Nominal), 0)), backgroundColor: c.primary, borderRadius: 5 }, { label: 'Pengeluaran', data: ms.map(m => list.filter(x => x.Jenis === 'Pengeluaran' && monthKey(x.Tanggal) === m).reduce((a, x) => a + num(x.Nominal), 0)), backgroundColor: c.red, borderRadius: 5 }] } }; } };
  }
  const rows = [];
  S.d.kendaraan.forEach(k => [['Uji KIR', k.MasaKIR], ['Pajak / STNK', k.MasaPajak]].forEach(([j, d]) => rows.push(['Kendaraan', k.NoPol, k.JenisKendaraan, j, d])));
  S.d.pengemudi.forEach(d => rows.push(['Pengemudi', d.Nama, 'SIM ' + (d.JenisSIM || ''), 'SIM', d.MasaSIM]));
  rows.sort((a, b) => String(a[4] || '9999').localeCompare(String(b[4] || '9999')));
  const exp = rows.filter(r => expInfo(r[4]).lvl === 'exp').length, warn = rows.filter(r => expInfo(r[4]).lvl === 'warn').length;
  return { title: 'Masa Berlaku Legalitas', head: ['Kategori', 'Nama / nopol', 'Keterangan', 'Dokumen', 'Berlaku s/d', 'Status'],
    rows: rows.map(r => [r[0], r[1], r[2], r[3], r[4] ? tglPendek(r[4]) : '—', expInfo(r[4]).text]), money: [],
    kpi: [['Dokumen dipantau', fnum(rows.length)], ['Sudah habis', fnum(exp)], ['Hampir habis', fnum(warn)], ['Aman', fnum(rows.length - exp - warn)]], chart: null };
}
function renderLaporan() {
  const el = $('#page-laporan'), f = S.ui.lap;
  const R = reportData();
  const statusOpts = f.jenis === 'order' ? STATUS : f.jenis === 'invoice' ? ['Belum Lunas', 'Lunas', 'Batal'] : [];
  el.innerHTML = `
  <div class="page-head">
    <div class="ph-icon"><i class="bi bi-bar-chart-line"></i></div>
    <div><h1>Laporan &amp; Export Data</h1><p class="muted">Pilih jenis laporan dan periode, lalu unduh Excel atau PDF.</p></div>
    <div class="ph-actions"><button class="btn btn-secondary" id="lapPrint"><i class="bi bi-printer"></i> Cetak</button><button class="btn btn-secondary" id="lapPdf"><i class="bi bi-file-earmark-pdf"></i> Unduh PDF</button><button class="btn btn-primary" id="lapXls"><i class="bi bi-file-earmark-spreadsheet"></i> Unduh Excel</button></div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="chips-row" style="margin-bottom:12px">${[['order', 'Rekap order', 'bi-journal-text'], ['invoice', 'Invoice & piutang', 'bi-receipt'], ['finance', 'Arus kas', 'bi-wallet2'], ['legalitas', 'Masa berlaku legalitas', 'bi-shield-check']].map(([k, l, i]) => `<button class="fchip ${f.jenis === k ? 'active' : ''}" data-j="${k}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>
    ${f.jenis !== 'legalitas' ? `<div class="filters">
      <label class="field"><span class="label">Dari tanggal</span><input class="input" type="date" id="lapFrom" value="${esc(f.from)}"></label>
      <label class="field"><span class="label">Sampai tanggal</span><input class="input" type="date" id="lapTo" value="${esc(f.to)}"></label>
      <label class="field"><span class="label">Layanan</span><select class="input" id="lapSvc"><option value="">Semua layanan</option><option value="sewa" ${f.svc === 'sewa' ? 'selected' : ''}>Sewa</option><option value="kirim" ${f.svc === 'kirim' ? 'selected' : ''}>Kirim</option><option value="paket" ${f.svc === 'paket' ? 'selected' : ''}>Paket</option></select></label>
      ${statusOpts.length ? `<label class="field"><span class="label">Status</span><select class="input" id="lapStatus"><option value="">Semua status</option>${statusOpts.map(s => `<option ${f.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>` : '<div></div>'}
    </div><div class="chips-row" style="margin-top:12px">${[['Bulan ini', 'bulan'], ['Bulan lalu', 'bulanlalu'], ['3 bulan', '3bulan'], ['Tahun ini', 'tahun'], ['Semua', 'semua']].map(([l, k]) => `<button class="fchip" data-per="${k}">${l}</button>`).join('')}</div>` : ''}
  </div>
  <div class="kpis">${R.kpi.map((k, i) => kpi(k[0], k[1], ['bi-collection', 'bi-check2-circle', 'bi-exclamation-diamond', 'bi-graph-up'][i], ['ic-indigo', 'ic-primary', 'ic-amber', 'ic-green'][i], '', String(k[1]).startsWith('Rp') ? 'money' : '')).join('')}</div>
  ${R.chart ? '<div class="card" style="margin-bottom:16px"><div class="card-title-row"><h3>Grafik ' + esc(R.title.toLowerCase()) + '</h3></div><div class="chart-box"><canvas id="chLap"></canvas></div></div>' : ''}
  <div class="table-card" id="lapTable"></div>`;
  el.querySelectorAll('[data-j]').forEach(b => b.onclick = () => { f.jenis = b.dataset.j; f.status = ''; f.page = 1; renderLaporan(); });
  el.querySelectorAll('[data-per]').forEach(b => b.onclick = () => { const [a, z] = periodRange(b.dataset.per); f.from = a === '0000-01-01' ? '' : a; f.to = z === '9999-12-31' ? '' : z; f.page = 1; renderLaporan(); });
  [['#lapFrom', 'from'], ['#lapTo', 'to'], ['#lapSvc', 'svc'], ['#lapStatus', 'status']].forEach(([s, k]) => { const x = $(s); if (x) x.onchange = e => { f[k] = e.target.value; f.page = 1; renderLaporan(); }; });
  $('#lapXls').onclick = () => exportExcel(R);
  $('#lapPdf').onclick = e => exportReportPdf(R, e.currentTarget);
  $('#lapPrint').onclick = () => openPrint({ title: R.title, sub: periodText(), build: () => docReport(R, false), pdfBuild: () => docReport(R, true), doc: 'lap' });
  const size = 50, rows = R.rows, pages = Math.max(1, Math.ceil(rows.length / size)); if (f.page > pages) f.page = pages;
  const show = rows.slice((f.page - 1) * size, f.page * size);
  const lt = $('#lapTable');
  lt.innerHTML = rows.length ? `<div class="table-wrap"><table class="table"><thead><tr>${R.head.map((h, i) => `<th class="${R.money.includes(i) ? 't-num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${show.map(r => `<tr>${r.map((c, i) => `<td class="${R.money.includes(i) ? 't-num' : ''}">${R.money.includes(i) ? rp(c) : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><div class="table-foot"><span>${rows.length} baris · ${esc(periodText())}</span>${pagerHTML(rows.length, f.page, size, 'pg')}</div>`
    : emptyHTML('bi-file-earmark-bar-graph', 'Tidak ada data', 'Ubah periode atau filter laporan.');
  lt.onclick = e => { const pg = e.target.closest('[data-pg]'); if (pg) { f.page = Number(pg.dataset.pg); renderLaporan(); } };
  if (R.chart) drawChart('chLap', R.chart());
}
function periodText() { const f = S.ui.lap; return f.jenis === 'legalitas' ? 'Per ' + tgl(today()) : (f.from || f.to) ? 'Periode ' + (f.from ? tgl(f.from) : 'awal') + ' – ' + (f.to ? tgl(f.to) : tgl(today())) : 'Seluruh periode'; }
function exportExcel(R) {
  const b = $('#lapXls'); btnBusy(b, true, 'Menyiapkan…');
  loadScript(CDN.xlsx).then(() => {
    const aoa = [[(S.settings.companyName || '') + ' — ' + R.title], [periodText()], [], R.head].concat(R.rows);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = R.head.map((h, i) => ({ wch: Math.min(40, Math.max(h.length + 2, ...R.rows.slice(0, 200).map(r => String(r[i] === undefined ? '' : r[i]).length + 2))) }));
    R.money.forEach(ci => { for (let r = 4; r < aoa.length; r++) { const ref = XLSX.utils.encode_cell({ r, c: ci }); if (ws[ref]) ws[ref].z = '#,##0'; } });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, R.title.slice(0, 30));
    XLSX.writeFile(wb, R.title.replace(/[^\w]+/g, '_') + '_' + today() + '.xlsx');
    ok('Excel diunduh', R.rows.length + ' baris');
  }).catch(fail).finally(() => btnBusy(b, false));
}
function downloadBase64(b64, name, mime) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: mime }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function exportReportPdf(R, btn) {
  btnBusy(btn, true, 'Membuat PDF…');
  api('exportPdf', S.token, docReport(R, true), R.title.replace(/[^\w]+/g, '_') + '_' + today())
    .then(r => { downloadBase64(r.data.base64, r.data.name, 'application/pdf'); ok('PDF diunduh', 'Salinan juga tersimpan di folder Laporan.'); })
    .catch(fail).finally(() => btnBusy(btn, false));
}

// ============================================================
// PENGATURAN (Super Admin)
// ============================================================
function renderPengaturan() {
  const el = $('#page-pengaturan'), t = S.ui.set.tab;
  el.innerHTML = `
  <div class="page-head">
    <div class="ph-icon"><i class="bi bi-gear"></i></div>
    <div><h1>Pengaturan Sistem &amp; Hak Akses</h1><p class="muted">Kelola akun, identitas aplikasi, kop dokumen cetak, rekening bank, dan status sistem.</p></div>
  </div>
  <div class="tabs">${[['akun', 'bi-people', 'Kelola akun & pengguna'], ['branding', 'bi-palette', 'Branding & identitas'], ['kop', 'bi-printer', 'Kop dokumen cetak'], ['rekening', 'bi-bank', 'Master rekening bank'], ['sistem', 'bi-hdd-network', 'Konfigurasi sistem']]
    .map(([k, i, l]) => `<button class="tab ${t === k ? 'active' : ''}" data-st="${k}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>
  <div id="setBody"></div>`;
  el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { S.ui.set.tab = b.dataset.st; renderPengaturan(); });
  ({ akun: setAkun, branding: setBranding, kop: setKop, rekening: setRekening, sistem: setSistem })[t]();
}
function setAkun() {
  const users = S.d.users.slice().sort((a, b) => (a.Peran === b.Peran ? 0 : a.Peran === 'SUPER_ADMIN' ? -1 : 1) || a.Nama.localeCompare(b.Nama));
  $('#setBody').innerHTML = `<div class="table-card">
    <div class="card-title-row" style="padding:18px 20px 0"><div><h3>Daftar pengguna</h3><p class="muted">${users.filter(u => u.Status === 'Aktif').length} aktif dari ${users.length} akun</p></div><button class="btn btn-primary" id="uAdd"><i class="bi bi-person-plus"></i> Tambah pengguna</button></div>
    <div class="table-wrap"><table class="table cards"><thead><tr><th>Pengguna</th><th>Peran</th><th>Divisi</th><th>WhatsApp</th><th>Terakhir masuk</th><th>Status</th><th class="t-actions">Aksi</th></tr></thead><tbody>
    ${users.map(u => `<tr class="${u.Status !== 'Aktif' ? 'row-muted' : ''}"><td class="card-title" data-label="Pengguna"><div class="who"><span class="avatar soft">${esc(initials(u.Nama))}</span><div><span class="t-strong">${esc(u.Nama)}${u.Email === S.me.email ? ' <span class="chip chip-soft">Anda</span>' : ''}</span><span class="t-sub">${esc(u.Email)}</span></div></div></td>
      <td data-label="Peran"><span class="badge ${u.Peran === 'SUPER_ADMIN' ? 'b-green' : u.Peran === 'SALES' || u.Peran === 'CS' ? 'b-amber' : 'b-indigo'}">${u.Peran === 'SUPER_ADMIN' ? 'Super Admin' : u.Peran === 'SALES' ? 'Sales' : u.Peran === 'CS' ? 'Customer Service' : 'Admin'}</span></td><td data-label="Divisi">${esc(u.Divisi || '—')}</td>
      <td data-label="WhatsApp" class="mono">${esc(u.NoHP || '—')}</td><td data-label="Terakhir masuk" class="muted">${u.TerakhirLogin ? tglJam(u.TerakhirLogin) : 'Belum pernah'}</td>
      <td data-label="Status"><span class="badge ${u.Status === 'Aktif' ? 'b-green' : 'b-slate'}">${esc(u.Status)}</span></td>
      <td class="t-actions"><button class="icon-btn" data-ue="${esc(u.ID)}" title="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn" data-ur="${esc(u.ID)}" title="Reset kata sandi"><i class="bi bi-key"></i></button>${u.Email !== S.me.email ? `<button class="icon-btn" data-ut="${esc(u.ID)}" title="${u.Status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}"><i class="bi ${u.Status === 'Aktif' ? 'bi-slash-circle' : 'bi-check-circle'}"></i></button><button class="icon-btn" data-ud="${esc(u.ID)}" title="Hapus"><i class="bi bi-trash"></i></button>` : ''}</td></tr>`).join('')}
    </tbody></table></div></div>
    <div class="role-note"><i class="bi bi-shield-check" style="font-size:18px"></i><div><b>Ketentuan hak akses</b><br><b>Admin</b>: input Form Sewa, Form Kirim, dan Form Inspeksi; mencetak surat jalan (dengan atau tanpa nominal); mengubah status order setelah dikonfirmasi; menambah data pelanggan, kendaraan, pengemudi, dan penerima; mengubah data kendaraan, pengemudi, dan penerima; membuka Rekap Order dan Invoice &amp; Tagihan; melihat Ringkasan tanpa angka keuangan.<br><b>Super Admin</b>: semua akses Admin, ditambah mengubah isi order yang sudah dikonfirmasi atau dicetak, Keuangan &amp; Finance, Laporan &amp; Export, serta Pengaturan Sistem dan pengelolaan akun.</div></div>`;
  $('#uAdd').onclick = () => openUserModal(null);
  $('#setBody').onclick = e => {
    const b = e.target.closest('[data-ue],[data-ur],[data-ut],[data-ud]'); if (!b) return;
    const id = b.dataset.ue || b.dataset.ur || b.dataset.ut || b.dataset.ud, u = byId('users', id);
    if (b.dataset.ue) openUserModal(u);
    if (b.dataset.ur) confirmDialog({ title: 'Reset kata sandi ' + u.Nama + '?', text: 'Kata sandi baru dibuat dan semua sesi pengguna ini dicabut.', icon: 'bi-key', variant: 'warn', ok: 'Reset kata sandi' }).then(v => {
      if (v !== true) return; btnBusy(b, true);
      api('resetUserPassword', S.token, id).then(r => showSecret('Kata sandi baru untuk ' + u.Nama, u.Email, r.data.sandi)).catch(fail).finally(() => btnBusy(b, false));
    });
    if (b.dataset.ut) {
      const aktif = u.Status !== 'Aktif';
      confirmDialog({ title: (aktif ? 'Aktifkan' : 'Nonaktifkan') + ' akun ' + u.Nama + '?', text: aktif ? 'Pengguna dapat masuk kembali.' : 'Akses dicabut seketika dan sesi aktif diakhiri.', variant: aktif ? '' : 'danger', icon: aktif ? 'bi-check-circle' : 'bi-slash-circle', ok: aktif ? 'Aktifkan' : 'Nonaktifkan akun' }).then(v => {
        if (v !== true) return;
        api('setUserStatus', S.token, id, aktif).then(r => { upsert('users', r.data); ok(r.message); setAkun(); }).catch(fail);
      });
    }
    if (b.dataset.ud) confirmDialog({ title: 'Hapus akun ' + u.Nama + '?', text: 'Akun dan kata sandinya dihapus permanen. Riwayat log tetap tersimpan.', variant: 'danger', icon: 'bi-trash', ok: 'Hapus akun' }).then(v => {
      if (v !== true) return;
      api('deleteUser', S.token, id).then(() => { removeFrom('users', id); ok('Akun dihapus'); setAkun(); }).catch(fail);
    });
  };
}
function openUserModal(u) {
  const d = Object.assign({ Peran: 'ADMIN', Status: 'Aktif' }, u || {});
  openModal({ title: u ? 'Ubah pengguna' : 'Tambah pengguna', sub: u ? u.Email : 'Kata sandi awal dibuat otomatis dan ditampilkan sekali.', icon: 'bi-person-plus',
    body: `<form id="uForm" class="row-2" novalidate>
      <label class="field" style="grid-column:1/-1"><span class="label req">Nama lengkap</span><input class="input" name="Nama" value="${esc(d.Nama || '')}"></label>
      <label class="field" style="grid-column:1/-1"><span class="label req">Email</span><input class="input" type="email" name="Email" value="${esc(d.Email || '')}" placeholder="nama@gmail.com"><small class="muted">Dipakai untuk masuk. Akun Google pemilik skrip bisa memakai tombol "Masuk dengan Google".</small></label>
      <label class="field"><span class="label req">Peran</span><select class="input" name="Peran"><option value="ADMIN" ${d.Peran === 'ADMIN' ? 'selected' : ''}>Admin</option><option value="SUPER_ADMIN" ${d.Peran === 'SUPER_ADMIN' ? 'selected' : ''}>Super Admin</option><option value="SALES" ${d.Peran === 'SALES' ? 'selected' : ''}>Sales (hanya menu CRM)</option><option value="CS" ${d.Peran === 'CS' ? 'selected' : ''}>Customer Service (keluhan & pertanyaan)</option></select></label>
      <label class="field"><span class="label">Divisi / tanggung jawab</span><input class="input" name="Divisi" value="${esc(d.Divisi || '')}" placeholder="Operasional sewa"></label>
      <label class="field"><span class="label">No. WhatsApp</span><input class="input" name="NoHP" inputmode="tel" value="${esc(d.NoHP || '')}"></label>
      <label class="field"><span class="label">Status</span><select class="input" name="Status" ${u && u.Email === S.me.email ? 'disabled' : ''}><option ${d.Status === 'Aktif' ? 'selected' : ''}>Aktif</option><option ${d.Status === 'Nonaktif' ? 'selected' : ''}>Nonaktif</option></select></label>
    </form>`,
    foot: '<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="uSave"><i class="bi bi-check2"></i> Simpan pengguna</button>' });
  $('#uSave').onclick = () => {
    const v = formValues($('#uForm')); if (u) v.ID = u.ID;
    if (!v.Nama || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.Email)) { toast('warning', 'Lengkapi data', 'Nama dan email valid wajib diisi.'); return; }
    if (u && u.Email === S.me.email) v.Status = 'Aktif';
    const b = $('#uSave'); btnBusy(b, true, 'Menyimpan…');
    api('saveUser', S.token, v).then(r => {
      upsert('users', r.data.user); closeModal(); setAkun();
      if (r.data.sandiAwal) showSecret('Akun ' + r.data.user.Nama + ' dibuat', r.data.user.Email, r.data.sandiAwal); else ok(r.message);
    }).catch(fail).finally(() => btnBusy(b, false));
  };
}
function showSecret(title, email, pass) {
  openModal({ title, sub: 'Sampaikan langsung ke pengguna. Kata sandi ini tidak dapat dilihat lagi.', icon: 'bi-key',
    body: `<dl class="dl"><dt>Email</dt><dd>${esc(email)}</dd><dt>Kata sandi awal</dt><dd></dd></dl><div class="secret">${esc(pass)}</div><div class="alert alert-warning"><i class="bi bi-exclamation-triangle"></i><div>Minta pengguna mengganti kata sandi lewat menu profil → <b>Ubah kata sandi</b> setelah masuk pertama kali.</div></div>`,
    foot: `<button class="btn btn-secondary" id="secCopy"><i class="bi bi-clipboard"></i> Salin</button><button class="btn btn-primary" data-close>Selesai</button>` });
  $('#secCopy').onclick = () => copyText('Email: ' + email + '\nKata sandi: ' + pass, 'Data masuk disalin');
}
function setBranding() {
  const st = S.settings;
  $('#setBody').innerHTML = `<div class="set-grid">
    <div class="stack">
      <div class="card"><div class="card-h"><span class="num"><i class="bi bi-type"></i></span><div><h3>Nama &amp; identitas aplikasi</h3><p>Tampil di sidebar, halaman masuk, judul tab, dan email notifikasi.</p></div></div>
        <label class="field"><span class="label req">Nama aplikasi</span><input class="input" id="bName" maxlength="40" value="${esc(st.appName)}"></label>
      </div>
      <div class="card"><div class="card-h"><span class="num"><i class="bi bi-door-open"></i></span><div><h3>Tulisan halaman masuk</h3><p>Teks di panel hijau halaman masuk. Kosongkan kolom untuk menyembunyikan bagian itu.</p></div></div>
        <label class="field"><span class="label">Subjudul di bawah nama aplikasi</span><input class="input" data-lt="loginSub" maxlength="60" value="${esc(st.loginSub)}"></label>
        <label class="field"><span class="label">Judul besar</span><textarea class="input" data-lt="tagline" rows="2" maxlength="90">${esc(st.tagline)}</textarea><small class="muted"><span data-count="tagline"></span>/90 karakter. Paling pas 40–70 karakter.</small></label>
        ${[1, 2, 3].map(n => `<div class="lt-point"><span class="lt-num">${n}</span><div class="grow"><label class="field" style="margin-bottom:8px"><span class="label">Poin ${n} — judul</span><input class="input" data-lt="loginP${n}Judul" maxlength="50" value="${esc(st['loginP' + n + 'Judul'])}"></label>
          <label class="field" style="margin:0"><span class="label">Poin ${n} — keterangan</span><input class="input" data-lt="loginP${n}Teks" maxlength="100" value="${esc(st['loginP' + n + 'Teks'])}"></label></div></div>`).join('')}
        <label class="field" style="margin-top:14px"><span class="label">Catatan di bagian bawah</span><input class="input" data-lt="loginFoot" maxlength="60" value="${esc(st.loginFoot)}"></label>
      </div>
      <div class="card"><div class="card-h"><span class="num"><i class="bi bi-image"></i></span><div><h3>Logo aplikasi</h3><p>Disimpan sebagai thumbnail; tampil di sidebar dan kop dokumen.</p></div></div>
        <div class="logo-up"><div class="logo-prev" id="bLogoPrev">${logoHTML(st)}</div><div style="flex:1"><b>Logo utama</b><p class="muted" style="font-size:12.5px">PNG, JPG, atau SVG. Diperkecil otomatis menjadi thumbnail persegi.</p>
          <div class="chips-row" style="margin-top:8px"><button class="btn btn-secondary btn-sm" id="bLogoPick"><i class="bi bi-upload"></i> Ganti logo</button>${st.logo ? '<button class="btn btn-ghost btn-sm" id="bLogoDel" style="color:var(--red)"><i class="bi bi-trash"></i> Hapus</button>' : ''}</div></div></div></div>
      <div class="card"><div class="card-h"><span class="num"><i class="bi bi-palette"></i></span><div class="grow"><h3>Warna tema aplikasi</h3><p>Warna aksen tombol utama, menu aktif, dan penanda.</p></div></div>
        <div class="swatches">${THEMES.map(([n, c]) => `<button class="swatch ${st.themeColor.toUpperCase() === c ? 'active' : ''}" data-color="${c}"><i style="background:${c}">${st.themeColor.toUpperCase() === c ? '<span class="bi bi-check-lg"></span>' : ''}</i><span><b>${n}</b><small>${c}</small></span></button>`).join('')}</div>
        <div class="row-2 mt" style="align-items:end"><label class="field" style="margin:0"><span class="label">Kode hex kustom</span><div class="prefix-input"><span>#</span><input class="input mono" id="bHex" maxlength="6" style="text-align:left" value="${esc(st.themeColor.replace('#', ''))}"></div></label><input type="color" id="bColor" value="${esc(st.themeColor)}" style="height:40px;width:100%;border:1px solid var(--field-border);border-radius:8px;background:var(--surface);cursor:pointer"></div></div>
      <div class="card"><div class="card-h"><span class="num"><i class="bi bi-bell"></i></span><div><h3>Notifikasi &amp; pengingat</h3><p>Ringkasan harian dikirim ke email Super Admin setiap pukul 06.00 WIB.</p></div></div>
        <div class="readonly" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><span><b>Email ringkasan harian</b><br><small class="muted">Invoice jatuh tempo + SIM/KIR/pajak yang hampir habis.</small></span><label class="switch"><input type="checkbox" id="bDigest" ${st.emailDigest === 'true' ? 'checked' : ''}><span></span></label></div>
        <label class="field"><span class="label">Peringatan masa berlaku (hari sebelum habis)</span><input class="input" id="bWarn" inputmode="numeric" value="${esc(st.peringatanHari)}" style="max-width:140px"></label>
        <label class="field"><span class="label">Templat pesan WhatsApp pengingat</span><textarea class="input" id="bWa" rows="4">${esc(st.waTemplate)}</textarea><small class="muted">Variabel: {pelanggan} {perusahaan} {invoice} {nominal} {jatuhTempo} {suratJalan}</small></label></div>
    </div>
    <div class="card" style="position:sticky;top:84px"><div class="card-title-row"><div><h3><i class="bi bi-eye"></i> Pratinjau langsung</h3><p class="muted">Simulasi tampilan dengan warna terpilih.</p></div></div>
      <div class="preview-box" id="bPreview"></div>
      <div class="action-bar" style="position:static;margin-top:16px;box-shadow:none"><span class="ab-info muted" id="bDirty">Belum ada perubahan</span><button class="btn btn-ghost" id="bReset"><i class="bi bi-arrow-counterclockwise"></i> Reset</button><button class="btn btn-primary" id="bSave"><i class="bi bi-check2-circle"></i> Simpan perubahan</button></div></div>
  </div>`;
  const draft = { appName: st.appName, logo: st.logo, themeColor: st.themeColor, emailDigest: st.emailDigest, peringatanHari: st.peringatanHari, waTemplate: st.waTemplate };
  LOGIN_TEXT_KEYS.forEach(k => { draft[k] = st[k] || ''; });
  const preview = () => {
    applyThemeColor(draft.themeColor);
    const pt = n => (draft['loginP' + n + 'Judul'] || draft['loginP' + n + 'Teks']) ? `<li><i class="bi bi-check2-circle"></i><div><b>${esc(draft['loginP' + n + 'Judul'])}</b><span>${esc(draft['loginP' + n + 'Teks'])}</span></div></li>` : '';
    $('#bPreview').innerHTML = `<div class="pv"><div class="pv-label">Halaman masuk (panel hijau)</div><div class="lt-prev" style="background:linear-gradient(160deg,${draft.themeColor},#022C22)">
        <div class="lt-brand"><div class="brand-logo sm">${logoHTML(draft)}</div><div><b>${esc(draft.appName)}</b>${draft.loginSub ? `<small>${esc(draft.loginSub)}</small>` : ''}</div></div>
        ${draft.tagline ? `<h4>${esc(draft.tagline)}</h4>` : ''}<ul>${pt(1)}${pt(2)}${pt(3)}</ul>${draft.loginFoot ? `<p>● ${esc(draft.loginFoot)}</p>` : ''}</div></div>
      <div class="pv"><div class="pv-label">Menu aktif sidebar</div><div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><div class="brand-logo sm" style="background:${draft.themeColor};border:0">${logoHTML(draft)}</div><b style="color:${draft.themeColor};font-family:var(--head)">${esc(draft.appName)}</b></div><div class="sb-link active"><i class="bi bi-gear"></i><span>Pengaturan Sistem</span></div><div class="sb-link"><i class="bi bi-truck-front"></i><span>Form Sewa Kendaraan</span></div></div>
      <div class="pv"><div class="pv-label">Tombol aksi utama</div><div class="chips-row"><button class="btn btn-primary btn-sm"><i class="bi bi-plus-lg"></i> Buat surat jalan</button><button class="btn btn-secondary btn-sm">Batal</button></div></div>
      <div class="pv"><div class="pv-label">Status &amp; tab</div><div class="chips-row"><span class="badge b-indigo">Dijadwalkan</span><span class="badge b-amber">Dikirim</span><span class="badge b-green">Diterima</span><span class="badge b-red">Dibatalkan</span></div><div class="tabs" style="margin:10px 0 0;box-shadow:none"><span class="tab active">Pemasukan sewa</span><span class="tab">Pengeluaran</span></div></div>`;
    const changed = Object.keys(draft).some(k => String(draft[k]) !== String(st[k]));
    $('#bDirty').innerHTML = changed ? '<span class="dot dirty"></span> Perubahan belum disimpan' : 'Belum ada perubahan';
  };
  const setColor = c => { draft.themeColor = c.toUpperCase(); $('#bHex').value = draft.themeColor.slice(1); $('#bColor').value = draft.themeColor; $$('.swatch').forEach(s => { const on = s.dataset.color === draft.themeColor; s.classList.toggle('active', on); s.querySelector('i').innerHTML = on ? '<span class="bi bi-check-lg"></span>' : ''; }); preview(); };
  $$('.swatch').forEach(s => s.onclick = () => setColor(s.dataset.color));
  $('#bHex').oninput = e => { const v = e.target.value.replace(/[^0-9a-f]/gi, ''); if (v.length === 6) setColor('#' + v); };
  $('#bColor').oninput = e => setColor(e.target.value);
  [['#bName', 'appName'], ['#bWa', 'waTemplate'], ['#bWarn', 'peringatanHari']].forEach(([s, k]) => $(s).oninput = e => { draft[k] = e.target.value; preview(); });
  const cnt = () => { const c = $('[data-count="tagline"]'); if (c) c.textContent = String(draft.tagline || '').length; };
  $$('[data-lt]').forEach(i => i.oninput = () => { draft[i.dataset.lt] = i.value.replace(/\s*\n\s*/g, ' '); cnt(); preview(); });
  cnt();
  $('#bDigest').onchange = e => { draft.emailDigest = e.target.checked ? 'true' : 'false'; preview(); };
  $('#bLogoPick').onclick = () => pickLogo(data => { draft.logo = data; $('#bLogoPrev').innerHTML = logoHTML(draft); preview(); });
  if ($('#bLogoDel')) $('#bLogoDel').onclick = () => { draft.logo = ''; $('#bLogoPrev').innerHTML = logoHTML(draft); preview(); };
  $('#bReset').onclick = () => { applyThemeColor(st.themeColor); setBranding(); };
  $('#bSave').onclick = () => saveSettingsUI(draft, $('#bSave'));
  preview();
}
function pickLogo(cb) {
  const fp = $('#filePicker'); fp.value = ''; fp.removeAttribute('capture');
  fp.onchange = () => {
    const file = fp.files && fp.files[0]; if (!file) return;
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const make = (size, type, q) => { const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d'); const s = Math.min(img.width, img.height); ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size); return c.toDataURL(type, q); };
      let data = make(256, 'image/png');
      if (data.length > 46000) data = make(200, 'image/jpeg', 0.88);
      if (data.length > 46000) data = make(140, 'image/jpeg', 0.8);
      URL.revokeObjectURL(url); cb(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('warning', 'Gambar tidak valid', 'Pilih file PNG, JPG, atau SVG.'); };
    img.src = url;
  };
  fp.click();
}
function saveSettingsUI(obj, btn) {
  const old = Object.assign({}, S.settings);
  Object.assign(S.settings, obj); applyBranding(S.settings); // optimistic
  btnBusy(btn, true, 'Menyimpan…');
  api('saveSettings', S.token, obj).then(r => { S.settings = r.data; applyBranding(S.settings); saveCache(); lsSet(LS.login, JSON.stringify(['appName', 'logo', 'themeColor', 'companyName'].concat(LOGIN_TEXT_KEYS).reduce((o, k) => (o[k] = S.settings[k], o), {}))); ok(r.message); renderPengaturan(); })
    .catch(err => { S.settings = old; applyBranding(old); fail(err, 'Pengaturan gagal disimpan'); }).finally(() => btnBusy(btn, false));
}
function setKop() {
  const st = S.settings;
  const d = { companyName: st.companyName, companyAddress: st.companyAddress, companyPhone: st.companyPhone, companyEmail: st.companyEmail, companyNPWP: st.companyNPWP, showLogo: st.showLogo, kopAccent: st.kopAccent };
  $('#setBody').innerHTML = `<div class="set-grid">
    <div class="card">
      <div class="alert alert-info"><i class="bi bi-info-circle"></i><div>Kop ini dipakai di semua surat jalan, tanda terima, form inspeksi, dan invoice.</div></div>
      <label class="field"><span class="label req">Nama badan usaha / perusahaan</span><input class="input" data-k="companyName" value="${esc(d.companyName)}"></label>
      <label class="field"><span class="label">Alamat lengkap</span><textarea class="input" data-k="companyAddress" rows="3">${esc(d.companyAddress)}</textarea></label>
      <div class="row-2"><label class="field"><span class="label">Nomor telepon / hotline</span><input class="input" data-k="companyPhone" value="${esc(d.companyPhone)}"></label>
      <label class="field"><span class="label">Email <small class="muted">(opsional)</small></span><input class="input" data-k="companyEmail" value="${esc(d.companyEmail)}"></label></div>
      <label class="field"><span class="label">NPWP perusahaan <small class="muted">(opsional, tampil di invoice &amp; cetak dengan nominal)</small></span><input class="input mono" data-k="companyNPWP" value="${esc(d.companyNPWP)}"></label>
      <div class="readonly" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><span><b>Tampilkan logo</b><br><small class="muted">Sisi kiri atas dokumen cetak.</small></span><label class="switch"><input type="checkbox" id="kLogo" ${d.showLogo === 'true' ? 'checked' : ''}><span></span></label></div>
      <span class="label">Aksen garis kop</span>
      <div class="radio-cards" style="grid-template-columns:1fr 1fr;margin-top:6px"><label><input type="radio" name="kAcc" value="primary" ${d.kopAccent !== 'mono' ? 'checked' : ''}><span><b>Warna tema</b><small>Mengikuti warna aplikasi</small></span></label><label><input type="radio" name="kAcc" value="mono" ${d.kopAccent === 'mono' ? 'checked' : ''}><span><b>Monokrom</b><small>Hemat tinta</small></span></label></div>
      <div class="action-bar" style="position:static;box-shadow:none"><button class="btn btn-ghost" id="kReset"><i class="bi bi-arrow-counterclockwise"></i> Reset</button><button class="btn btn-primary" id="kSave"><i class="bi bi-check2-circle"></i> Simpan kop</button></div>
    </div>
    <div class="card" style="position:sticky;top:84px"><div class="card-title-row"><div><h3>Pratinjau kop dokumen</h3><p class="muted">Diperbarui saat Anda mengetik.</p></div></div><div class="kop-preview" id="kPrev"></div></div>
  </div>`;
  const prev = () => {
    const sx = Object.assign({}, S.settings, d);
    $('#kPrev').innerHTML = kopHTML(sx, true) + `<div style="margin-top:14px;text-align:center;padding:10px;background:#F1F5F9;border-radius:6px;font-weight:700;letter-spacing:.06em">SURAT JALAN SEWA KENDARAAN</div><div style="display:flex;justify-content:space-between;font-size:11px;color:#475569;margin-top:6px"><span>No. ${today().slice(2).replace(/-/g, '')}-1</span><span>${tgl(today(), true)}</span></div>`;
  };
  $$('#setBody [data-k]').forEach(i => i.oninput = e => { d[e.target.dataset.k] = e.target.value; prev(); });
  $('#kLogo').onchange = e => { d.showLogo = e.target.checked ? 'true' : 'false'; prev(); };
  $$('[name=kAcc]').forEach(r => r.onchange = e => { d.kopAccent = e.target.value; prev(); });
  $('#kReset').onclick = setKop;
  $('#kSave').onclick = () => { if (!d.companyName.trim()) { toast('warning', 'Nama perusahaan wajib diisi'); return; } saveSettingsUI(d, $('#kSave')); };
  prev();
}
function setRekening() {
  const list = S.d.rekening.slice().sort((a, b) => (String(b.Aktif) === 'true') - (String(a.Aktif) === 'true'));
  $('#setBody').innerHTML = `<div class="table-card">
    <div class="card-title-row" style="padding:18px 20px 0"><div><h3>Master rekening bank</h3><p class="muted">Dibaca otomatis oleh cetak dengan nominal, invoice, Tandai lunas, dan Finance.</p></div><button class="btn btn-primary" id="rAdd"><i class="bi bi-plus-lg"></i> Tambah rekening</button></div>
    ${list.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Bank / unit kas</th><th>Nomor rekening</th><th>Atas nama</th><th>Alias</th><th>Kategori</th><th>Aktif</th><th class="t-actions"></th></tr></thead><tbody>
    ${list.map(r => `<tr class="${String(r.Aktif) !== 'true' ? 'row-muted' : ''}"><td class="card-title" data-label="Bank"><span class="rek" style="display:inline-flex;border:0;padding:0;background:none"><span class="bank">${esc(r.Bank)}</span></span>${r.Cabang ? `<span class="t-sub">${esc(r.Cabang)}</span>` : ''}</td>
      <td data-label="Nomor" class="mono t-strong">${esc(r.NoRekening)} <button class="icon-btn sm" data-copyrek="${esc(r.NoRekening)}"><i class="bi bi-copy"></i></button></td><td data-label="Atas nama">${esc(r.AtasNama)}</td><td data-label="Alias">${esc(r.Alias)}</td>
      <td data-label="Kategori"><span class="badge ${r.Kategori === 'Penerima Pembayaran' ? 'b-green' : r.Kategori === 'Operasional' ? 'b-indigo' : 'b-amber'}">${esc(r.Kategori)}</span></td>
      <td data-label="Aktif"><label class="switch"><input type="checkbox" data-rt="${esc(r.ID)}" ${String(r.Aktif) === 'true' ? 'checked' : ''}><span></span></label></td>
      <td class="t-actions"><button class="icon-btn" data-re="${esc(r.ID)}"><i class="bi bi-pencil"></i></button></td></tr>`).join('')}</tbody></table></div>`
    : emptyHTML('bi-bank', 'Belum ada rekening', 'Tambahkan rekening penerima pembayaran agar tercetak di invoice dan surat jalan dengan nominal.')}</div>`;
  $('#rAdd').onclick = () => openMasterModal('rekening', null, { onSaved: () => setRekening() });
  $('#setBody').onclick = e => {
    const ed = e.target.closest('[data-re]'); if (ed) openMasterModal('rekening', byId('rekening', ed.dataset.re), { onSaved: () => setRekening() });
    const cp = e.target.closest('[data-copyrek]'); if (cp) copyText(cp.dataset.copyrek, 'Nomor rekening disalin');
  };
  $('#setBody').onchange = e => {
    const t = e.target.closest('[data-rt]'); if (!t) return;
    const r = byId('rekening', t.dataset.rt), old = r.Aktif;
    r.Aktif = t.checked ? 'true' : 'false'; setRekening();
    api('saveMaster', S.token, 'rekening', Object.assign({}, r)).then(x => { upsert('rekening', x.data); saveCache(); ok(t.checked ? 'Rekening diaktifkan' : 'Rekening dinonaktifkan'); })
      .catch(err => { r.Aktif = old; setRekening(); fail(err); });
  };
}
function setSistem() {
  const body = $('#setBody');
  body.innerHTML = `<div class="status-cards">${[1, 2, 3, 4, 5, 6].map(() => '<div class="card"><div class="sk" style="width:50%;margin-bottom:12px"></div><div class="sk" style="width:80%;margin-bottom:8px"></div><div class="sk" style="width:65%"></div></div>').join('')}</div>`;
  Promise.all([api('getSystemStatus', S.token), api('getLogs', S.token, 150)]).then(([s, l]) => {
    const d = s.data, logs = l.data;
    const card = (ic, title, sub, okFlag, rows, btn) => `<div class="card"><div class="card-h"><span class="num"><i class="bi ${ic}"></i></span><div class="grow"><h3>${esc(title)}</h3><p>${esc(sub)}</p></div><span class="badge ${okFlag ? 'b-green' : 'b-amber'}">${okFlag ? 'Aktif' : 'Perlu cek'}</span></div>${rows.map(([k, v]) => `<div class="st-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}${btn || ''}</div>`;
    const totalRows = Object.values(d.counts).reduce((a, b) => a + b, 0);
    body.innerHTML = `<div class="status-cards">
      ${card('bi-table', 'Database', 'Google Sheets', d.database, [['Order sewa', fnum(d.counts.Order_Sewa)], ['Order kirim', fnum(d.counts.Order_Kirim)], ['Invoice', fnum(d.counts.Invoice)], ['Total baris data', fnum(totalRows)]])}
      ${card('bi-folder2-open', 'Penyimpanan berkas', 'Google Drive', Object.values(d.drive).every(Boolean), Object.keys(d.drive).map(k => ['KAGUMI/' + k, d.drive[k] ? 'Tersedia' : 'Belum ada']))}
      ${card('bi-alarm', 'Pengecekan harian', 'Setiap 06.00 WIB', d.dailyCheck, [['Terakhir dijalankan', d.lastDaily ? tglJam(d.lastDaily) : 'Belum pernah'], ['Hasil', d.lastDailyInfo || '—']], d.dailyCheck ? '' : '<button class="btn btn-secondary btn-sm mt" id="sTrig"><i class="bi bi-lightning"></i> Aktifkan pengecekan &amp; cadangan</button>')}
      ${card('bi-cloud-arrow-up', 'Cadangan otomatis', 'Setiap Minggu 23.00 WIB · 8 salinan terakhir', d.weeklyBackup, [['Cadangan terakhir', d.lastBackup ? tglJam(d.lastBackup) : 'Belum pernah']], '<button class="btn btn-secondary btn-sm mt" id="sBackup"><i class="bi bi-arrow-repeat"></i> Jalankan cadangan sekarang</button>')}
      ${card('bi-envelope-check', 'Notifikasi', 'Email (Gmail) & tautan WhatsApp', d.emailQuota !== null, [['Sisa kuota email hari ini', d.emailQuota === null ? 'Belum diizinkan' : fnum(d.emailQuota)], ['WhatsApp', 'Tautan siap (kirim manual)']], '<button class="btn btn-secondary btn-sm mt" id="sMail"><i class="bi bi-send"></i> Uji kirim email</button>')}
      ${card('bi-shield-lock', 'Keamanan & audit', 'Sesi bertanda tangan · LockService', true, [['Sesi berlaku', '12 jam'], ['Nomor surat jalan', 'Dikunci saat dibuat'], ['Waktu server', tglJam(d.serverTime)]])}
    </div>
    <div class="table-card mt"><div class="card-title-row" style="padding:18px 20px 0"><div><h3>Log aktivitas</h3><p class="muted">${logs.length} aktivitas terakhir</p></div></div>
      <div class="table-wrap" style="max-height:480px;overflow:auto"><table class="table cards"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Aksi</th><th>Target</th><th>Detail</th></tr></thead><tbody>
      ${logs.map(x => `<tr><td data-label="Waktu" class="mono">${tglJam(x.Waktu)}</td><td data-label="Pengguna">${esc(x.Nama)}<span class="t-sub">${esc(x.Email)}</span></td><td data-label="Aksi" class="t-strong">${esc(x.Aksi)}</td><td data-label="Target" class="mono">${esc(x.Target)}</td><td data-label="Detail" class="muted">${esc(x.Detail)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    const bind = (id, fn, msg) => { const b = $(id); if (b) b.onclick = () => { btnBusy(b, true); api(fn, S.token).then(r => { ok(r.message || msg); setSistem(); }).catch(fail).finally(() => btnBusy(b, false)); }; };
    bind('#sBackup', 'runBackupNow'); bind('#sMail', 'testEmail'); bind('#sTrig', 'installTriggersFromApp');
  }).catch(err => { body.innerHTML = `<div class="card">${emptyHTML('bi-wifi-off', 'Gagal memuat status sistem', err.message, '<br><button class="btn btn-secondary" id="sRetry">Coba lagi</button>')}</div>`; $('#sRetry').onclick = setSistem; });
}
function openPasswordModal() {
  openModal({ title: 'Ubah kata sandi', sub: S.me.email, icon: 'bi-key',
    body: `<form id="pwForm" novalidate><label class="field"><span class="label req">Kata sandi lama</span><input class="input" type="password" name="lama" autocomplete="current-password"></label>
      <label class="field"><span class="label req">Kata sandi baru</span><input class="input" type="password" name="baru" autocomplete="new-password"><small class="muted">Minimal 8 karakter, memuat huruf dan angka.</small></label>
      <label class="field"><span class="label req">Ulangi kata sandi baru</span><input class="input" type="password" name="ulang" autocomplete="new-password"></label></form>`,
    foot: '<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="pwSave"><i class="bi bi-check2"></i> Simpan kata sandi</button>' });
  $('#pwSave').onclick = () => {
    const v = formValues($('#pwForm'));
    if (v.baru.length < 8 || !/\d/.test(v.baru) || !/[A-Za-z]/.test(v.baru)) { toast('warning', 'Kata sandi terlalu lemah', 'Minimal 8 karakter dengan huruf dan angka.'); return; }
    if (v.baru !== v.ulang) { toast('warning', 'Kata sandi tidak sama', 'Ulangi kata sandi baru dengan benar.'); return; }
    const b = $('#pwSave'); btnBusy(b, true, 'Menyimpan…');
    api('changePassword', S.token, v.lama, v.baru).then(r => { closeModal(); ok(r.message); }).catch(fail).finally(() => btnBusy(b, false));
  };
}

// ============================================================
// DOKUMEN CETAK (satu templat untuk pratinjau, cetak, dan arsip PDF Drive)
// ============================================================
function kopHTML(st, withNPWP) {
  st = st || S.settings;
  const acc = st.kopAccent === 'mono' ? '#0F172A' : (st.themeColor || '#006C49');
  const logo = st.showLogo !== 'false' ? (st.logo ? `<img src="${esc(st.logo)}" style="width:54px;height:54px;border-radius:10px;object-fit:cover">` : `<div style="width:54px;height:54px;border-radius:10px;background:${acc};color:#fff;font:700 24px Arial;text-align:center;line-height:54px">${esc(initials(st.companyName || st.appName).slice(0, 1))}</div>`) : '';
  return `<table style="width:100%;border-collapse:collapse;border-bottom:2.5px solid ${acc}"><tr>
    ${logo ? `<td style="width:64px;padding:0 10px 10px 0;vertical-align:middle">${logo}</td>` : ''}
    <td style="padding:0 0 10px;vertical-align:middle"><div style="font:700 17px Arial;color:#0F172A;letter-spacing:.01em">${esc(st.companyName || st.appName || '')}</div>
      <div style="font-size:10.5px;color:#475569;line-height:1.45">${esc(st.companyAddress || '')}</div>
      <div style="font-size:10.5px;color:#475569">${[st.companyPhone ? 'Telp. ' + esc(st.companyPhone) : '', st.companyEmail ? esc(st.companyEmail) : '', withNPWP && st.companyNPWP ? 'NPWP ' + esc(st.companyNPWP) : ''].filter(Boolean).join(' &nbsp;•&nbsp; ')}</div></td>
  </tr></table>`;
}
function docShell(title, body, page, forPdf) {
  const screen = forPdf ? '' : `@media screen{body{background:#E2E8F0;padding:18px}.sheet{background:#fff;box-shadow:0 4px 18px rgba(15,23,42,.15);margin:0 auto 18px;padding:9mm 10mm}.sheet.a5{width:210mm;min-height:148mm}.sheet.a4{width:210mm;min-height:297mm}}`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    @page{size:${page};margin:8mm}
    *{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#0F172A;font-size:10.5px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    ${screen}
    @media print{.sheet{padding:0;box-shadow:none;margin:0}.sheet+.sheet{page-break-before:always}}
    table{border-collapse:collapse;width:100%} .t td,.t th{border:1px solid #CBD5E1;padding:5px 7px;vertical-align:top;text-align:left} .t th{background:#F1F5F9;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#475569}
    .box{border:1px solid #CBD5E1;border-radius:6px;padding:7px 9px} .lbl{font-size:8.5px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;font-weight:700;margin-bottom:2px}
    .val{font-weight:700;font-size:11px} .muted{color:#64748B} .num{text-align:right;white-space:nowrap} .title{font:700 15px Arial;letter-spacing:.04em}
    .sign{table-layout:fixed;width:100%} .sign td{border:1px solid #CBD5E1;text-align:center;vertical-align:bottom;height:78px;padding:6px;font-size:10px} .sign .who{border-top:1px solid #94A3B8;padding-top:3px;font-weight:700;margin:0 12px}
    .foot{display:flex;justify-content:space-between;font-size:8.5px;color:#64748B;margin-top:8px;border-top:1px dashed #CBD5E1;padding-top:4px}
    .stamp{display:inline-block;border:2px solid #16A34A;color:#16A34A;font:700 13px Arial;padding:3px 10px;border-radius:6px;transform:rotate(-6deg);letter-spacing:.1em}
  </style></head><body>${body}</body></html>`;
}
function docFooter(extra) {
  return `<table style="margin-top:8px;border-top:1px dashed #CBD5E1"><tr><td style="font-size:8.5px;color:#64748B;padding-top:4px">${extra || ''}</td><td style="font-size:8.5px;color:#64748B;padding-top:4px;text-align:right">Dicetak ${esc(nowJkt().slice(8, 10) + '/' + nowJkt().slice(5, 7) + '/' + nowJkt().slice(0, 4) + ' ' + nowJkt().slice(11))} WIB · Operator: ${esc(S.me.nama || S.me.email)}</td></tr></table>`;
}
function payAccountsFor(o) {
  const r = o && o.RekeningID ? byId('rekening', o.RekeningID) : null;
  return r ? [r] : payAccounts();
}
function bankBox(list) {
  if (!list.length) return '';
  return `<div class="box" style="margin-top:7px;background:#F8FAFC"><div class="lbl">Instruksi pembayaran resmi</div><table><tr>${list.slice(0, 3).map(r => `<td style="padding:3px 8px 0 0;vertical-align:top"><b>${esc(r.Bank)}${r.Cabang ? ' (' + esc(r.Cabang) + ')' : ''}</b><br><span style="font:700 12px Arial;color:#0F172A">${esc(r.NoRekening)}</span><br><span class="muted">a.n. ${esc(r.AtasNama)}</span></td>`).join('')}</tr></table></div>`;
}
function priceTable(o) {
  return `<table class="t" style="margin-top:7px"><tr><th>Rincian biaya</th><th class="num">Jumlah</th></tr>
    <tr><td>${o.Layanan === 'paket' ? 'Ongkos kirim' + (basisText(o) ? ' (' + esc(basisText(o)) + ')' : '') : 'Harga dasar ' + (o.Layanan === 'sewa' ? 'sewa' : 'pengiriman')}</td><td class="num">${rp(o.Harga)}</td></tr>
    ${num(o.Pajak) ? `<tr><td>${esc(labelPajak(o))}</td><td class="num">${rp(o.Pajak)}</td></tr>` : ''}
    ${num(o.Penyesuaian) ? `<tr><td>Penyesuaian tarif</td><td class="num">${rp(o.Penyesuaian)}</td></tr>` : ''}
    <tr><td style="font-weight:700">TOTAL · ${esc(o.Pembayaran === 'Termin' ? 'Pembayaran termin' : o.Pembayaran)}</td><td class="num" style="font-weight:700;font-size:12px">${rp(o.Total)}</td></tr>
    ${o.Pembayaran === 'DP' ? `<tr><td>DP diterima</td><td class="num">${rp(o.DP)}</td></tr><tr><td>Sisa tagihan</td><td class="num">${rp(o.Sisa)}</td></tr>` : ''}</table>`;
}
function docSuratJalan(o, nominal, forPdf) {
  if (o.Layanan === 'paket') return docResiPaket(o, nominal, forPdf);
  const st = S.settings, acc = st.kopAccent === 'mono' ? '#0F172A' : st.themeColor;
  const head = `${kopHTML(st, nominal)}
    <table style="margin:8px 0 7px"><tr><td><div class="title">SURAT JALAN ${o.Layanan === 'sewa' ? 'SEWA KENDARAAN' : 'PENGIRIMAN KENDARAAN'}</div><div class="muted">${o.Layanan === 'sewa' ? 'Sewa kendaraan dengan pengemudi' : esc(o.JenisLayanan || '')}${nominal ? ' · Lembar dengan nominal' : ''}</div></td>
    <td style="text-align:right;width:44%"><div class="box" style="display:inline-block;text-align:left;min-width:220px;border-color:${acc}"><table><tr><td><div class="lbl">No. surat jalan</div><div style="font:700 15px Arial;color:${acc}">${esc(o.NoSJ)}</div></td><td style="padding-left:14px"><div class="lbl">Tanggal</div><div class="val">${tgl(o.Tanggal, true)}</div></td></tr></table></div></td></tr></table>`;
  let main = '';
  if (o.Layanan === 'sewa') {
    main = `<table style="margin-bottom:7px"><tr>
      <td style="width:34%;padding-right:6px;vertical-align:top"><div class="box"><div class="lbl">Pelanggan</div><div class="val">${esc(o.NamaPelanggan)}</div></div></td>
      <td style="width:33%;padding-right:6px;vertical-align:top"><div class="box"><div class="lbl">Kendaraan</div><div class="val">${esc(o.NoPol)}</div><div class="muted">${esc(o.JenisKendaraan || '')}</div></div></td>
      <td style="vertical-align:top"><div class="box"><div class="lbl">Pengemudi</div><div class="val">${esc(o.PengemudiNama)}</div></div></td></tr></table>
    <table style="margin-bottom:7px"><tr>
      <td style="width:50%;padding-right:6px;vertical-align:top"><div class="box"><div class="lbl">▲ Lokasi muat</div><div class="val">${esc(o.MuatPIC)} · ${esc(o.MuatHP)}</div><div>${esc(o.MuatAlamat)}</div></div></td>
      <td style="vertical-align:top"><div class="box"><div class="lbl">▼ Lokasi bongkar</div><div class="val">${esc(o.BongkarPIC)} · ${esc(o.BongkarHP)}</div><div>${esc(o.BongkarAlamat)}</div></div></td></tr></table>
    <table class="t"><tr><th>Deskripsi muatan</th><th style="width:16%">Jumlah</th><th style="width:18%">Berat / volume</th><th style="width:16%">No. segel</th></tr>
      <tr><td>${esc(o.JenisMuatan)}</td><td>${esc([o.Kuantitas, o.Satuan].filter(Boolean).join(' ') || '—')}</td><td>${esc(o.Berat || '—')}</td><td>${esc(o.NoSegel || '—')}</td></tr></table>`;
  } else {
    const insp = o.InspeksiID ? byId('inspeksi', o.InspeksiID) : null;
    main = `<table style="margin-bottom:7px"><tr>
      <td style="width:42%;padding-right:6px;vertical-align:top"><div class="box"><div class="lbl">Pengirim / pelanggan</div><div class="val">${esc(o.NamaPelanggan)}</div>${o.AsalAlamat ? `<div class="muted">Jemput: ${esc(o.AsalAlamat)}</div>` : ''}</div></td>
      <td style="vertical-align:top"><div class="box"><div class="lbl">Penerima &amp; lokasi tujuan</div><div class="val">${esc(o.PenerimaNama)}</div><div>${esc(o.PenerimaAlamat)}</div><div class="muted">Telp. ${esc(o.PenerimaHP)}</div></div></td></tr></table>
    <table class="t" style="margin-bottom:7px"><tr><th>No. polisi</th><th>Merk / tipe / jenis / model</th><th>Warna</th><th>Tahun</th><th>No. rangka</th></tr>
      <tr><td style="font-weight:700">${esc(o.NoPolMobil)}</td><td>${esc([o.Merk, o.Tipe, o.JenisMobil, o.Model].filter(Boolean).join(' / '))}</td><td>${esc(o.Warna)}</td><td>${esc(o.Tahun)}</td><td>${esc(o.NoRangka || '—')}</td></tr></table>
    <table><tr><td style="width:50%;padding-right:6px;vertical-align:top"><div class="box"><div class="lbl">Cara pengiriman</div><div class="val">${esc(modaCetak(o))}</div></div></td>
      <td style="vertical-align:top"><div class="box"><div class="lbl">Form inspeksi body</div><div class="val">${insp && insp.Status === 'Disahkan' ? 'Disahkan · kondisi ' + esc(insp.KondisiRingkas) + ' (terlampir)' : insp ? 'Draf (belum disahkan)' : 'Belum diisi'}</div></div></td></tr></table>`;
  }
  const money = nominal ? priceTable(o) + bankBox(payAccountsFor(o)) : '';
  const signs = o.Layanan === 'sewa'
    ? [['PIC pengirim / muat', o.MuatPIC], ['Pengemudi', o.PengemudiNama], ['PIC penerima / bongkar', o.BongkarPIC]]
    : [['Pengirim', o.NamaPelanggan], ['Penerima', o.PenerimaNama]];
  const sign = `<table class="sign" style="margin-top:8px"><tr>${signs.map(([l, n]) => `<td><div style="text-align:left;font-weight:700;font-size:9.5px;color:#475569;margin-bottom:46px">${esc(l)}</div><div class="who">( ${esc(n || '............................')} )</div></td>`).join('')}${petugasCell('Surat Jalan ' + o.NoSJ, 'Petugas KAGUMI')}</tr></table>`;
  const klausul = `<div class="muted" style="font-size:8.5px;margin-top:6px">Barang/kendaraan telah diperiksa sesuai rincian di atas. Penerima wajib memeriksa kondisi sebelum menandatangani surat jalan ini.</div>`;
  let pages = `<div class="sheet a5">${head}${main}${money}${sign}${klausul}${docFooter('Lembar 1 · ' + esc(st.companyName || ''))}</div>`;
  if (o.Layanan === 'kirim' && o.InspeksiID) {
    const insp = byId('inspeksi', o.InspeksiID);
    if (insp && insp.Status === 'Disahkan') pages += `<div class="sheet a5">${inspeksiBody(insp, o, true)}${docFooter('Lampiran form inspeksi · ' + esc(o.NoSJ))}</div>`;
  }
  return docShell('Surat Jalan ' + o.NoSJ, pages, 'A5 landscape', forPdf);
}
/**
 * Tanda tangan petugas berupa QR (barcode 2D) berisi siapa yang mencetak dan kapan.
 * Muncul di semua dokumen yang dicetak / diunduh PDF.
 */
function waktuCetakTeks() {
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(/\./g, ':').replace(',', '') + ' WIB';
}
function peranTeks(r) { return r === 'SUPER_ADMIN' ? 'Super Admin' : r === 'ADMIN' ? 'Admin' : r === 'SALES' ? 'Sales' : r === 'CS' ? 'Customer Service' : (r || '-'); }
function petugasQR(docName) {
  const me = S.me || {}, st = S.settings || {};
  const txt = [st.companyName || st.appName || 'KAGUMI Transport', 'Dokumen: ' + docName, 'Dicetak oleh: ' + (me.nama || me.email || '-') + ' (' + peranTeks(me.role) + ')', 'Waktu cetak: ' + waktuCetakTeks()].join('\n');
  try { return KgmQR.dataUrl(txt, 260, 'M'); } catch (e) { return ''; }
}
function petugasCell(docName, label, compact) {
  const me = S.me || {}, img = petugasQR(docName), sz = compact ? 50 : 58;
  return `<td><div style="text-align:left;font-weight:700;font-size:9.5px;color:#475569;margin-bottom:3px">${esc(label || 'Petugas')}</div>
    ${img ? `<img src="${img}" alt="QR petugas" width="${sz}" height="${sz}" style="width:${sz}px;height:${sz}px;display:block;margin:0 auto 2px">` : '<div style="height:44px"></div>'}
    <div class="who">( ${esc(me.nama || '............................')} )</div><div style="font-size:7.5px;color:#64748B;text-align:center">${esc(peranTeks(me.role))} · ${esc(waktuCetakTeks())}</div></td>`;
}
function docResiPaket(o, nominal, forPdf) {
  const st = S.settings, acc = st.kopAccent === 'mono' ? '#0F172A' : st.themeColor;
  const b = barangOf(o), t = { koli: num(o.TotalKoli), kg: Number(o.TotalBerat) || 0, m3: Number(o.TotalVolume) || 0 };
  const head = `${kopHTML(st, nominal)}
    <table style="margin:8px 0 7px"><tr><td><div class="title">RESI PENGIRIMAN PAKET</div><div class="muted">Jalur ${esc(o.Jalur || 'Darat')} · Ongkos ditanggung ${o.Pembayar === 'penerima' ? 'penerima' : 'pengirim'}${nominal ? ' · Lembar dengan nominal' : ''}</div></td>
    <td style="text-align:right;width:44%"><div class="box" style="display:inline-block;text-align:left;min-width:220px;border-color:${acc}"><table><tr><td><div class="lbl">No. resi</div><div style="font:700 15px Arial;color:${acc}">${esc(o.NoSJ)}</div></td><td style="padding-left:14px"><div class="lbl">Tanggal</div><div class="val">${tgl(o.Tanggal, true)}</div></td></tr></table></div></td></tr></table>`;
  const parties = `<table style="margin-bottom:7px"><tr>
      <td style="width:50%;padding-right:6px;vertical-align:top"><div class="box"><div class="lbl">▲ Pengirim</div><div class="val">${esc(o.PengirimNama)}</div><div>${esc(o.PengirimAlamat)}</div><div class="muted">Telp. ${esc(o.PengirimHP)}</div></div></td>
      <td style="vertical-align:top"><div class="box"><div class="lbl">▼ Penerima${o.KotaTujuan ? ' · ' + esc(String(o.KotaTujuan).toUpperCase()) : ''}</div><div class="val">${esc(o.PenerimaNama)}</div><div>${esc(o.PenerimaAlamat)}</div><div class="muted">Telp. ${esc(o.PenerimaHP)}</div></div></td></tr></table>`;
  const items = `<table class="t"><tr><th style="width:4%">No</th><th>Detail kiriman</th><th class="num" style="width:9%">Qty</th><th class="num" style="width:11%">Kg/koli</th><th style="width:17%">P × L × T (cm)</th><th class="num" style="width:11%">Total kg</th><th class="num" style="width:11%">Volume m³</th></tr>
    ${b.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.d)}</td><td class="num">${fnumDec(x.q)}</td><td class="num">${x.kg ? fnumDec(x.kg) : '—'}</td><td>${x.p && x.l && x.t ? fnumDec(x.p) + ' × ' + fnumDec(x.l) + ' × ' + fnumDec(x.t) : '—'}</td><td class="num">${fnumDec(x.q * x.kg)}</td><td class="num">${fnumDec(x.q * x.p * x.l * x.t / 1e6, 4)}</td></tr>`).join('')}
    <tr><td colspan="2" style="font-weight:700">TOTAL</td><td class="num" style="font-weight:700">${fnumDec(t.koli)}</td><td></td><td></td><td class="num" style="font-weight:700">${fnumDec(t.kg)}</td><td class="num" style="font-weight:700">${fnumDec(t.m3, 4)}</td></tr></table>`;
  const money = nominal ? priceTable(o) + bankBox(payAccountsFor(o)) : '';
  const cell = ([l, n]) => `<td><div style="text-align:left;font-weight:700;font-size:9.5px;color:#475569;margin-bottom:46px">${esc(l)}</div><div class="who">( ${esc(n || '............................')} )</div></td>`;
  const sign = `<table class="sign" style="margin-top:8px"><tr>${cell(['Pengirim', o.PengirimNama])}${petugasCell('Resi ' + o.NoSJ, 'Petugas')}${cell(['Penerima', o.PenerimaNama])}</tr></table>`;
  const klausul = `<div class="muted" style="font-size:8.5px;margin-top:6px">Isi kiriman dinyatakan oleh pengirim. Penerima wajib memeriksa jumlah koli dan kondisi kemasan sebelum menandatangani resi ini.</div>`;
  return docShell('Resi ' + o.NoSJ, `<div class="sheet a5">${head}${parties}${items}${money}${sign}${klausul}${docFooter('Resi paket · ' + esc(st.companyName || ''))}</div>`, 'A5 landscape', forPdf);
}
function inspeksiBody(insp, o, compact) {
  let cl = []; try { cl = JSON.parse(insp.Checklist || '[]'); } catch (e) { cl = []; }
  let foto = []; try { foto = JSON.parse(insp.Foto || '[]'); } catch (e) { foto = []; }
  let temuan = []; try { temuan = JSON.parse(insp.Temuan || '[]'); } catch (e) { temuan = []; }
  const half = Math.ceil(cl.length / 2);
  const rows = i => cl.slice(i, i + half).map((c, j) => `<tr><td style="width:24px">${i + j + 1}</td><td>${esc(c.p)}</td><td style="color:${c.k === 'Baik' ? '#166534' : '#B91C1C'};font-weight:700">${esc(c.k)}</td><td class="muted">${esc(c.c || '')}</td></tr>`).join('');
  const photos = foto.filter(f => S.thumbs[f.id]);
  return `${kopHTML(S.settings, false)}
  <table style="margin:8px 0"><tr><td><div class="title">FORM INSPEKSI BODY KENDARAAN</div><div class="muted">Serah terima kondisi body eksterior</div></td><td style="text-align:right"><div class="lbl">No. surat jalan</div><div class="val">${esc(o.NoSJ || '—')}</div><div class="muted">${tgl(String(insp.DisahkanPada || insp.Tanggal || '').slice(0, 10), true)}</div></td></tr></table>
  <table class="t" style="margin-bottom:6px"><tr><th>No. polisi</th><th>Kendaraan</th><th>Warna / tahun</th><th>No. rangka</th><th>KM</th><th>Kondisi ringkas</th></tr>
    <tr><td><b>${esc(o.NoPolMobil)}</b></td><td>${esc([o.Merk, o.Tipe, o.Model].filter(Boolean).join(' '))}</td><td>${esc([o.Warna, o.Tahun].filter(Boolean).join(' / '))}</td><td>${esc(o.NoRangka || '—')}</td><td>${fnum(insp.KM)}</td><td><b>${esc(insp.KondisiRingkas)}</b></td></tr></table>
  <table><tr><td style="width:50%;padding-right:4px;vertical-align:top"><table class="t"><tr><th>#</th><th>Bagian</th><th>Kondisi</th><th>Catatan</th></tr>${rows(0)}</table></td>
    <td style="vertical-align:top"><table class="t"><tr><th>#</th><th>Bagian</th><th>Kondisi</th><th>Catatan</th></tr>${rows(half)}</table></td></tr></table>
  <div class="box" style="margin-top:6px"><div class="lbl">Catatan detail temuan</div>${temuan.length ? temuan.map((t, i) => `${i + 1}. ${esc(t)}`).join('<br>') : 'Tidak ada temuan.'}${insp.Catatan ? `<br><span class="muted">Keterangan: ${esc(insp.Catatan)}</span>` : ''}</div>
  ${photos.length ? `<table style="margin-top:6px"><tr>${photos.slice(0, 6).map(f => `<td style="padding:2px;text-align:center;font-size:8.5px"><img src="${S.thumbs[f.id]}" style="width:100%;max-width:${compact ? 95 : 160}px;height:${compact ? 62 : 110}px;object-fit:cover;border-radius:4px;border:1px solid #CBD5E1"><br>${esc(f.slot)}</td>`).join('')}</tr></table>` : ''}
  <table class="sign" style="margin-top:6px"><tr>${[['Diserahkan (pengirim)', insp.NamaPengirim], ['Diperiksa (inspektur)', insp.NamaInspektur], ['Diterima (pengemudi)', insp.NamaPenerimaUnit]].map(([l, n]) => `<td style="height:${compact ? 60 : 80}px"><div style="text-align:left;font-weight:700;font-size:9.5px;color:#475569;margin-bottom:${compact ? 28 : 44}px">${esc(l)}</div><div class="who">( ${esc(n || '..................')} )</div></td>`).join('')}${petugasCell('Inspeksi ' + (o.NoSJ || insp.ID || ''), 'Petugas cetak', compact)}</tr></table>`;
}
function docTandaTerima(o, forPdf) {
  const st = S.settings, acc = st.kopAccent === 'mono' ? '#0F172A' : st.themeColor;
  const insp = o.InspeksiID ? byId('inspeksi', o.InspeksiID) : null;
  const body = `<div class="sheet a5">${kopHTML(st, false)}
    <table style="margin:8px 0"><tr><td><div class="title">TANDA TERIMA PENGIRIMAN KENDARAAN</div><div class="muted">Bukti serah terima unit mobil</div></td>
    <td style="text-align:right"><div class="box" style="display:inline-block;text-align:left;border-color:${acc}"><table><tr><td><div class="lbl">No. surat jalan</div><div style="font:700 15px Arial;color:${acc}">${esc(o.NoSJ)}</div></td><td style="padding-left:14px"><div class="lbl">Tanggal</div><div class="val">${tgl(o.Tanggal, true)}</div></td></tr></table></div></td></tr></table>
    <table style="margin-bottom:7px"><tr><td style="width:25%;padding-right:6px"><div class="box"><div class="lbl">Jenis layanan</div><div class="val">${esc(o.JenisLayanan)}</div></div></td>
      <td style="width:30%;padding-right:6px"><div class="box"><div class="lbl">Nama penerima</div><div class="val">${esc(o.PenerimaNama)}</div></div></td>
      <td><div class="box"><div class="lbl">Alamat serah terima</div><div>${esc(o.PenerimaAlamat)} <span class="muted">(${esc(o.PenerimaHP)})</span></div></div></td></tr></table>
    <table class="t" style="margin-bottom:7px"><tr><th>No. polisi</th><th>Merk / tipe</th><th>Warna</th><th>No. rangka</th><th>Tahun</th></tr>
      <tr><td style="font-weight:700">${esc(o.NoPolMobil)}</td><td>${esc([o.Merk, o.Tipe, o.Model].filter(Boolean).join(' '))}</td><td>${esc(o.Warna)}</td><td>${esc(o.NoRangka || '—')}</td><td>${esc(o.Tahun)}</td></tr></table>
    <div class="box" style="background:#F0FDF4;border-color:#BBF7D0"><div class="lbl">Status kondisi</div><b>${insp && insp.Status === 'Disahkan' ? esc(insp.KondisiRingkas.toUpperCase()) + ' — sesuai Form Inspeksi Body Kendaraan terlampir' : 'Form inspeksi belum disahkan'}</b></div>
    <table class="sign" style="margin-top:9px"><tr><td style="width:50%"><div style="text-align:left;font-weight:700;font-size:9.5px;color:#475569;margin-bottom:46px">Penerima / pemilik unit</div><div class="who">( ${esc(o.PenerimaNama)} )</div><div class="muted" style="font-size:9px">Tanggal: ____ / ____ / ${today().slice(0, 4)}</div></td>
      <td><div style="text-align:left;font-weight:700;font-size:9.5px;color:#475569;margin-bottom:46px">Pengemudi / petugas pengirim</div><div class="who">( ${esc(o.PengemudiNama || '..................')} )</div></td>${petugasCell('Tanda Terima ' + o.NoSJ, 'Petugas KAGUMI')}</tr></table>
    <div class="muted" style="font-size:8.5px;margin-top:6px">Dokumen ini merupakan bukti penerimaan fisik kendaraan dalam keadaan sesuai catatan inspeksi.</div>
    ${docFooter('Tanda terima · ' + esc(st.companyName || ''))}</div>`;
  return docShell('Tanda Terima ' + o.NoSJ, body, 'A5 landscape', forPdf);
}
function docInvoice(i, forPdf) {
  const st = S.settings, acc = st.kopAccent === 'mono' ? '#0F172A' : st.themeColor;
  const o = byId('orders', i.OrderID) || {};
  const pel = pihakTagihan(i.PelangganID) || {};
  const desc = o.Layanan === 'paket' ? `Pengiriman paket ${esc(paketRingkas(o))}${basisText(o) ? '<br>Tarif: ' + esc(basisText(o)) : ''}<br><span class="muted">${esc(orderRoute(o).filter(Boolean).join(' → '))} · ke ${esc(o.PenerimaNama || '')}</span>` : o.Layanan === 'sewa' ? `Sewa ${esc(o.JenisKendaraan || '')} ${esc(o.NoPol || '')}<br><span class="muted">${esc(orderRoute(o).filter(Boolean).join(' → '))}${o.JenisMuatan ? ' · ' + esc(o.JenisMuatan) : ''}</span>`
    : `Pengiriman ${esc([o.Merk, o.Tipe].filter(Boolean).join(' '))} (${esc(o.NoPolMobil || '')})<br><span class="muted">${esc(o.JenisLayanan || '')} · ${esc(orderRoute(o).filter(Boolean).join(' → '))}</span>`;
  const body = `<div class="sheet a4">${kopHTML(st, true)}
    <table style="margin:18px 0 12px"><tr><td style="vertical-align:top"><div style="font:800 30px Arial;color:${acc};letter-spacing:.02em">INVOICE</div><div style="font:700 13px Arial;color:${acc}">${esc(i.NoInvoice)}</div><div class="muted" style="margin-top:2px">Tagihan jasa angkutan &amp; sewa armada</div>
      <div class="box" style="margin-top:12px;max-width:330px"><div class="lbl">Kepada yth.</div><div class="val" style="font-size:13px">${esc(i.NamaPelanggan)}</div>${pel.Alamat ? `<div>${esc(pel.Alamat)}</div>` : ''}${pel.NPWP ? `<div class="muted">NPWP ${esc(pel.NPWP)}</div>` : ''}</div></td>
      <td style="width:42%;vertical-align:top"><table class="t"><tr><td class="muted">Tanggal terbit</td><td class="num"><b>${tgl(i.Tanggal, true)}</b></td></tr><tr><td class="muted">Jatuh tempo</td><td class="num"><b>${tgl(i.JatuhTempo, true)}</b></td></tr><tr><td class="muted">Metode</td><td class="num">${esc(i.Pembayaran)}</td></tr><tr><td class="muted">Status</td><td class="num"><b>${esc(i.Status)}</b></td></tr></table>
      ${i.Status === 'Lunas' ? `<div style="text-align:right;margin-top:12px"><span class="stamp">LUNAS ${tglPendek(i.TglBayar)}</span></div>` : ''}</td></tr></table>
    <table class="t"><tr><th style="width:4%">No</th><th style="width:13%">${o.Layanan === 'paket' ? 'No. resi' : 'No. SJ'}</th><th style="width:12%">Tanggal</th><th>Layanan / rute &amp; keterangan</th><th class="num">Harga</th><th class="num">Pajak</th><th class="num">Penyesuaian</th><th class="num">Total</th></tr>
      <tr><td>1</td><td><b>${esc(i.NoSJ)}</b></td><td>${tglPendek(o.Tanggal || i.Tanggal)}</td><td>${desc}</td><td class="num">${fnum(o.Harga)}</td><td class="num">${fnum(o.Pajak)}</td><td class="num">${fnum(o.Penyesuaian)}</td><td class="num"><b>${fnum(i.Total)}</b></td></tr></table>
    <table style="margin-top:10px"><tr><td style="vertical-align:top;padding-right:16px"><div class="box"><div class="lbl">Terbilang</div><i>${esc(terbilang(i.Tagihan))}</i></div>${bankBox(payAccountsFor(o))}</td>
      <td style="width:40%;vertical-align:top"><table class="t"><tr><td>Subtotal</td><td class="num">${rp(o.Harga)}</td></tr><tr><td>${esc(labelPajak(o))}</td><td class="num">${rp(o.Pajak)}</td></tr><tr><td>Penyesuaian tarif</td><td class="num">${rp(o.Penyesuaian)}</td></tr><tr><td>Total</td><td class="num">${rp(i.Total)}</td></tr>
        ${num(i.DP) ? `<tr><td>DP diterima</td><td class="num">− ${rp(i.DP)}</td></tr>` : ''}<tr><td style="font-weight:800;color:${acc}">TOTAL TAGIHAN</td><td class="num" style="font:800 14px Arial;color:${acc}">${rp(i.Tagihan)}</td></tr></table></td></tr></table>
    <table style="margin-top:28px"><tr><td></td><td style="width:34%;text-align:center"><div>Hormat kami,</div>${(q => q ? `<img src="${q}" alt="QR petugas" width="64" height="64" style="width:64px;height:64px;display:block;margin:4px auto">` : '<div style="height:64px"></div>')(petugasQR('Invoice ' + i.NoInvoice))}<div style="border-top:1px solid #94A3B8;padding-top:4px;font-weight:700">${esc(st.companyName || '')}</div><div style="font-size:8px;color:#64748B">Dicetak oleh ${esc((S.me || {}).nama || '')} · ${esc(waktuCetakTeks())}</div></td></tr></table>
    ${docFooter('Mohon cantumkan nomor invoice pada berita transfer.')}</div>`;
  return docShell('Invoice ' + i.NoInvoice, body, 'A4 portrait', forPdf);
}
function docReport(R, forPdf) {
  const body = `<div class="sheet a4">${kopHTML(S.settings, false)}<div style="margin:12px 0 8px"><div class="title">${esc(R.title.toUpperCase())}</div><div class="muted">${esc(periodText())}</div></div>
    <table class="t" style="margin-bottom:8px"><tr>${R.kpi.map(k => `<td><div class="lbl">${esc(k[0])}</div><div class="val">${esc(k[1])}</div></td>`).join('')}</tr></table>
    <table class="t" style="font-size:9px"><tr>${R.head.map((h, i) => `<th class="${R.money.includes(i) ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr>
    ${R.rows.slice(0, 1500).map(r => `<tr>${r.map((c, i) => `<td class="${R.money.includes(i) ? 'num' : ''}">${R.money.includes(i) ? fnum(c) : esc(c)}</td>`).join('')}</tr>`).join('')}</table>
    ${R.rows.length > 1500 ? '<p class="muted">Ditampilkan 1.500 baris pertama. Gunakan Excel untuk data lengkap.</p>' : ''}${docFooter(esc(S.settings.companyName || ''))}</div>`;
  return docShell(R.title, body, R.head.length > 7 ? 'A4 landscape' : 'A4 portrait', forPdf);
}

/** Modal pratinjau cetak. variants: [{k,l}]; build(k) → HTML; onPrint(k, pdfHtml). */
function openPrint(o) {
  const modal = $('#printModal'), frame = $('#printFrame');
  let cur = o.current || (o.variants ? o.variants[0].k : '');
  const draw = () => { frame.srcdoc = o.build(cur); };
  $('#printTitle').textContent = o.title; $('#printSub').textContent = o.sub || '';
  $('#printActions').innerHTML = (o.variants ? `<div class="tabs" style="margin:0;padding:3px;box-shadow:none">${o.variants.map(v => `<button class="tab ${v.k === cur ? 'active' : ''}" data-v="${v.k}" style="height:32px">${esc(v.l)}</button>`).join('')}</div>` : '') +
    (o.onPrint ? `<button class="btn btn-secondary" id="printPdf"><i class="bi bi-filetype-pdf"></i> Unduh PDF</button>` : '') +
    `<button class="btn btn-primary" id="printGo"><i class="bi bi-printer"></i> Cetak</button>`;
  $$('#printActions [data-v]').forEach(b => b.onclick = () => { cur = b.dataset.v; $$('#printActions [data-v]').forEach(x => x.classList.toggle('active', x === b)); draw(); });
  // Dua pilihan: Cetak (printer browser) atau Unduh PDF (dibuat server, sekaligus diarsipkan ke Drive)
  const run = pdf => {
    const html = o.pdfBuild ? o.pdfBuild(cur) : o.build(cur);
    if (!pdf) {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { fail(new Error('Browser memblokir jendela cetak. Coba lagi.')); return; }
      if (o.onPrint) Promise.resolve(o.onPrint(cur, html, false)).catch(() => {});
      return;
    }
    const btn = $('#printPdf'); btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Menyiapkan PDF…';
    Promise.resolve(o.onPrint(cur, html, true))
      .then(r => { if (!r || !r.data || !r.data.base64) throw new Error('PDF gagal dibuat.'); downloadBase64(r.data.base64, r.data.name, 'application/pdf'); toast('success', 'PDF diunduh', r.data.name); })
      .catch(err => fail(err, 'PDF gagal dibuat'))
      .finally(() => { btn.disabled = false; btn.innerHTML = '<i class="bi bi-filetype-pdf"></i> Unduh PDF'; });
  };
  const ask = pdf => {
    if (cur === 'nominal') confirmDialog({ title: (pdf ? 'Unduh PDF' : 'Cetak') + ' dengan nominal harga?', icon: 'bi-cash-stack', variant: 'warn', ok: pdf ? 'Lanjutkan unduh PDF' : 'Lanjutkan cetak nominal', okIcon: pdf ? 'bi-filetype-pdf' : 'bi-printer',
      html: 'Dokumen akan memuat harga, pajak, penyesuaian tarif, total, dan rekening transfer. Tindakan ini dicatat di Log Aktivitas.' }).then(v => { if (v === true) run(pdf); });
    else run(pdf);
  };
  $('#printGo').onclick = () => ask(false);
  if ($('#printPdf')) $('#printPdf').onclick = () => ask(true);
  modal.hidden = false; draw();
}
function printOrder(id, mode) {
  const o = byId('orders', id);
  if (!o || o.StatusDok !== 'Terkonfirmasi') { toast('warning', 'Belum dikonfirmasi', 'Konfirmasi order dulu sebelum mencetak.'); return; }
  const insp = o.InspeksiID ? byId('inspeksi', o.InspeksiID) : null;
  let missing = [];
  if (insp && insp.Status === 'Disahkan') { try { missing = JSON.parse(insp.Foto || '[]').filter(f => f.id && S.thumbs[f.id] === undefined); } catch (e) { missing = []; } }
  if (missing.length) {
    toast('info', 'Menyiapkan foto inspeksi…', missing.length + ' foto');
    Promise.all(missing.map(f => api('getFotoThumb', S.token, f.id).then(r => { S.thumbs[f.id] = r.data; }).catch(() => { S.thumbs[f.id] = ''; }))).then(() => printOrder(id, mode));
    return;
  }
  openPrint({
    title: (o.Layanan === 'paket' ? 'Resi ' : 'Surat Jalan ') + o.NoSJ, sub: o.NamaPelanggan + ' · A5 landscape', current: mode === 'nominal' ? 'nominal' : 'tanpa',
    variants: [{ k: 'tanpa', l: 'Tanpa nominal' }, { k: 'nominal', l: 'Dengan nominal' }],
    build: v => docSuratJalan(byId('orders', id), v === 'nominal', false), pdfBuild: v => docSuratJalan(byId('orders', id), v === 'nominal', true),
    onPrint: (v, html, pdf) => {
      const ord = byId('orders', id);
      ord.Dicetak = 'true'; ord.WaktuCetak = nowJkt(); ord.ModeCetak = v === 'nominal' ? 'Dengan nominal' : 'Tanpa nominal';
      saveCache(); if (FORMS[ord.Layanan] && FORMS[ord.Layanan].rec && FORMS[ord.Layanan].rec.ID === id && !FORMS[ord.Layanan].dirty) fillForm(ord.Layanan, ord);
      if (S.page === 'rekap') renderRekapTable();
      const p = api('markPrinted', S.token, ord.Layanan, id, v, html, 'sj', !!pdf).then(r => { if (r.data.order) { upsert('orders', r.data.order); saveCache(); } if (!pdf) toast('success', 'Dicatat & diarsipkan', r.message); return r; });
      if (!pdf) p.catch(err => fail(err, 'Arsip cetak gagal'));
      return p;
    }
  });
}
function printTandaTerima(id) {
  const o = byId('orders', id); if (!o || o.StatusDok !== 'Terkonfirmasi') { toast('warning', 'Belum dikonfirmasi'); return; }
  openPrint({ title: 'Tanda Terima ' + o.NoSJ, sub: o.PenerimaNama + ' · A5 landscape', build: () => docTandaTerima(o, false), pdfBuild: () => docTandaTerima(o, true),
    onPrint: (v, html, pdf) => api('markPrinted', S.token, 'kirim', id, 'tanpa', html, 'tt', !!pdf).then(r => { if (!pdf) toast('success', 'Tanda terima diarsipkan', r.message); return r; }) });
}
function printInvoice(id) {
  const i = byId('invoices', id); if (!i) return;
  openPrint({ title: 'Invoice ' + i.NoInvoice, sub: i.NamaPelanggan + ' · A4 portrait', build: () => docInvoice(i, false), pdfBuild: () => docInvoice(i, true),
    onPrint: (v, html, pdf) => api('markPrinted', S.token, '', id, 'nominal', html, 'inv', !!pdf).then(r => { if (!pdf) toast('success', 'Invoice diarsipkan', r.message); return r; }) });
}
function printInspeksi() {
  const ui = S.ui.insp, o = byId('orders', ui.rec.OrderID);
  const form = $('#formInspeksi');
  const tmp = Object.assign({}, ui.rec, { KM: num(form.querySelector('[name=KM]').value), KondisiRingkas: (form.querySelector('[name=KondisiRingkas]:checked') || {}).value || 'Baik',
    Checklist: JSON.stringify(collectChecklist()), Temuan: JSON.stringify(temuanList()), Foto: JSON.stringify(ui.photos.filter(p => p.id).map(p => ({ slot: p.slot, id: p.id }))),
    Catatan: form.querySelector('[name=Catatan]').value, NamaPengirim: form.querySelector('[name=NamaPengirim]').value, NamaInspektur: form.querySelector('[name=NamaInspektur]').value, NamaPenerimaUnit: form.querySelector('[name=NamaPenerimaUnit]').value });
  const build = pdf => docShell('Inspeksi ' + (o.NoSJ || ''), `<div class="sheet a4">${inspeksiBody(tmp, o, false)}${docFooter('Form inspeksi body kendaraan')}</div>`, 'A4 portrait', pdf);
  openPrint({ title: 'Form Inspeksi ' + (o.NoSJ || 'draf'), sub: (o.NoPolMobil || '') + ' · A4 portrait', build: () => build(false), pdfBuild: () => build(true),
    onPrint: (v, html, pdf) => api('markPrinted', S.token, 'kirim', ui.rec.ID || o.ID, 'tanpa', html, 'insp', !!pdf) });
}

// ============================================================
// WEBSITE PERUSAHAAN: Pertanyaan Masuk (semua staf) & Kelola Website (Super Admin)
// ============================================================
const PTY_STATUS = { Baru: 'b-red', Diproses: 'b-amber', Selesai: 'b-green' };
function renderPertanyaan() {
  const el = $('#page-pertanyaan'), st = S.ui.pty, rows = S.d.pertanyaan || [];
  const chips = [['aktif', 'Perlu ditindak', q => q.Status !== 'Selesai'], ['Baru', 'Baru', q => q.Status === 'Baru'],
    ['Diproses', 'Diproses', q => q.Status === 'Diproses'], ['Selesai', 'Selesai', q => q.Status === 'Selesai'], ['semua', 'Semua', null]];
  el.innerHTML = `
  <div class="page-head">
    <div class="ph-icon"><i class="bi bi-chat-left-text"></i></div>
    <div><h1>Pertanyaan Masuk</h1><p class="muted">Pesan dari formulir "Hubungi Kami" di website. Salinan juga dikirim ke email perusahaan.</p></div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="toolbar"><div class="search grow"><i class="bi bi-search"></i><input class="input" id="ptyQ" placeholder="Cari nama, no. HP, perusahaan, isi pesan…" value="${esc(st.q)}"></div>
      <button class="btn btn-secondary" id="ptyRefresh"><i class="bi bi-arrow-clockwise"></i> Muat ulang</button></div>
    <div class="chips-row">${chips.map(c => `<button class="fchip ${st.f === c[0] ? 'active' : ''}" data-pf="${c[0]}">${c[1]}<span class="cnt">${c[2] ? rows.filter(c[2]).length : rows.length}</span></button>`).join('')}</div>
  </div>
  <div id="ptyList"></div>`;
  const draw = () => {
    const chip = chips.find(c => c[0] === st.f), q = st.q.trim().toLowerCase();
    const list = rows.filter(r => (!chip || !chip[2] || chip[2](r)) && (!q || [r.Nama, r.NoHP, r.Email, r.Perusahaan, r.Pesan, r.Layanan].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => String(b.Waktu).localeCompare(String(a.Waktu)));
    $('#ptyList').innerHTML = list.length ? list.map(ptyCard).join('') : `<div class="card">${emptyHTML('bi-inbox', st.f === 'aktif' ? 'Tidak ada pertanyaan yang perlu ditindak' : 'Belum ada pertanyaan', 'Pertanyaan dari website akan muncul di sini.')}</div>`;
  };
  $('#ptyQ').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }, 120));
  el.querySelectorAll('[data-pf]').forEach(b => b.onclick = () => { st.f = b.dataset.pf; renderPertanyaan(); });
  $('#ptyRefresh').onclick = e => { const b = e.currentTarget; btnBusy(b, true); refreshData(true).catch(fail).finally(() => btnBusy(b, false)); };
  $('#ptyList').onclick = e => {
    const pl = e.target.closest('[data-pty-lead]'); if (pl) return ptyKeLead(byId('pertanyaan', pl.dataset.ptyLead), pl);
    const b = e.target.closest('[data-ps]'); if (!b) return;
    const r = byId('pertanyaan', b.dataset.id); if (!r) return;
    if (b.dataset.ps === 'Selesai') return ptySelesai(r);
    ptySet(r, b.dataset.ps, undefined, b);
  };
  draw();
}
function ptyCard(r) {
  const st = S.settings || {};
  const wa = `https://wa.me/${waNumber(r.NoHP)}?text=${encodeURIComponent('Halo ' + r.Nama + ', terima kasih telah menghubungi ' + (st.companyName || st.appName || '') + '. ')}`;
  return `<div class="card pty-card ${r.Status === 'Baru' ? 'is-new' : ''}">
    <div class="pty-top"><div><b class="t-strong">${esc(r.Nama)}</b>${r.Perusahaan ? ` <span class="muted">· ${esc(r.Perusahaan)}</span>` : ''}
      <div class="t-sub">${tglJam(r.Waktu)}${r.Layanan ? ' · ' + esc(r.Layanan) : ''}</div></div>
      <span class="badge ${PTY_STATUS[r.Status] || 'b-slate'}">${esc(r.Status)}</span></div>
    <p class="pty-msg">${esc(r.Pesan)}</p>
    <div class="pty-contact"><a href="${wa}" target="_blank" rel="noopener" class="mono"><i class="bi bi-whatsapp"></i> ${esc(r.NoHP)}</a>${r.Email ? `<a href="mailto:${esc(r.Email)}"><i class="bi bi-envelope"></i> ${esc(r.Email)}</a>` : ''}</div>
    ${r.Catatan || r.DitanganiOleh ? `<div class="pty-note"><i class="bi bi-journal-check"></i><div>${r.Catatan ? esc(r.Catatan) : ''}<small class="muted">${r.DitanganiOleh ? (r.Catatan ? ' — ' : '') + 'ditangani ' + esc(r.DitanganiOleh) + ', ' + tglJam(r.DiubahPada) : ''}</small></div></div>` : ''}
    <div class="chips-row pty-act">
      <a class="btn btn-secondary btn-sm" href="${wa}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> Balas WA</a>
      ${(() => { if (isCS()) return ''; const ld = (S.d.crmLeads || []).find(l => l.PertanyaanID === r.ID); return ld ? `<button class="btn btn-ghost btn-sm" data-lead="${esc(ld.ID)}"><i class="bi bi-funnel"></i> Lead ${esc(ld.Kode)}</button>` : `<button class="btn btn-secondary btn-sm" data-pty-lead="${esc(r.ID)}"><i class="bi bi-funnel"></i> Jadikan lead</button>`; })()}
      ${r.Status !== 'Diproses' && r.Status !== 'Selesai' ? `<button class="btn btn-secondary btn-sm" data-ps="Diproses" data-id="${esc(r.ID)}"><i class="bi bi-hourglass-split"></i> Tandai diproses</button>` : ''}
      ${r.Status !== 'Selesai' ? `<button class="btn btn-primary btn-sm" data-ps="Selesai" data-id="${esc(r.ID)}"><i class="bi bi-check2"></i> Selesai</button>` : `<button class="btn btn-ghost btn-sm" data-ps="Baru" data-id="${esc(r.ID)}"><i class="bi bi-arrow-counterclockwise"></i> Buka lagi</button>`}
    </div></div>`;
}
function ptySet(r, status, catatan, btn) {
  btnBusy(btn, true);
  return api('setPertanyaan', S.token, r.ID, status, catatan).then(res => {
    upsert('pertanyaan', res.data); saveCache(); updateBadges(); ok(res.message); closeModal(); renderPertanyaan();
  }).catch(fail).finally(() => btnBusy(btn, false));
}
function ptySelesai(r) {
  openModal({ title: 'Tandai selesai', sub: r.Nama + ' · ' + r.NoHP, icon: 'bi-check2-circle',
    body: `<label class="field"><span class="label">Catatan tindak lanjut (opsional)</span><textarea class="input" id="ptyNote" rows="3" maxlength="1000" placeholder="mis. Sudah dikirim penawaran via WA, harga Rp…">${esc(r.Catatan || '')}</textarea></label>`,
    foot: '<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="ptyOk"><i class="bi bi-check2"></i> Simpan &amp; selesai</button>' });
  $('#ptyOk').onclick = e => ptySet(r, 'Selesai', $('#ptyNote').value, e.currentTarget);
}

// ── Kelola Website (Super Admin) ──
const WEB_TABS = [['beranda', 'bi-house', 'Beranda'], ['tentang', 'bi-building', 'Tentang kami'], ['layanan', 'bi-truck', 'Produk & layanan'],
  ['kontak', 'bi-telephone', 'Hubungi kami'], ['berita', 'bi-megaphone', 'Informasi terbaru']];
function renderWebsite() {
  const el = $('#page-website'), ui = S.ui.web;
  if (!S.web) {
    el.innerHTML = `<div class="card">${emptyHTML('bi-hourglass-split', 'Memuat isi website…', 'Sebentar, data sedang diambil dari server.')}</div>`;
    refreshData(true).catch(fail);
    return;
  }
  if (!ui.draft) ui.draft = JSON.parse(JSON.stringify(S.web));
  const d = ui.draft, t = ui.tab;
  el.innerHTML = `
  <div class="page-head">
    <div class="ph-icon"><i class="bi bi-globe2"></i></div>
    <div><h1>Kelola Website</h1><p class="muted">Isi halaman website perusahaan. Nama, logo, warna, alamat, telepon, dan email diambil dari Pengaturan → Branding &amp; Kop dokumen.</p></div>
  </div>
  <div class="tabs">${WEB_TABS.map(([k, i, l]) => `<button class="tab ${t === k ? 'active' : ''}" data-wt="${k}"><i class="bi ${i}"></i> ${l}</button>`).join('')}</div>
  <div id="webBody"></div>
  ${t !== 'berita' ? `<div class="web-save card"><span class="muted" id="webDirty">${ui.dirty ? 'Ada perubahan yang belum disimpan.' : 'Semua perubahan sudah tersimpan.'}</span>
    <div class="chips-row"><button class="btn btn-ghost" id="webReset" ${ui.dirty ? '' : 'disabled'}>Batalkan perubahan</button><button class="btn btn-primary" id="webSave"><i class="bi bi-check2"></i> Simpan isi website</button></div></div>` : ''}`;
  el.querySelectorAll('[data-wt]').forEach(b => b.onclick = () => { ui.tab = b.dataset.wt; renderWebsite(); });
  const body = $('#webBody');
  const fld = (key, label, val, o) => {
    o = o || {};
    const input = o.rows ? `<textarea class="input" data-wk="${key}" rows="${o.rows}" maxlength="${o.max || 1000}">${esc(val)}</textarea>`
      : `<input class="input" data-wk="${key}" maxlength="${o.max || 200}" value="${esc(val)}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>`;
    return `<label class="field"><span class="label">${label}</span>${input}${o.help ? `<small class="muted">${o.help}</small>` : ''}</label>`;
  };
  const card = (icon, title, sub, inner) => `<div class="card"><div class="card-h"><span class="num"><i class="bi ${icon}"></i></span><div><h3>${title}</h3><p>${sub}</p></div></div>${inner}</div>`;
  const pairRows = (key, a, b, labels) => `<div class="web-rows" data-rows="${key}">${(d[key] || []).map((x, i) => `<div class="web-row">
      <input class="input" data-rk="${key}" data-i="${i}" data-f="${a}" maxlength="100" placeholder="${labels[0]}" value="${esc(x[a])}">
      ${key === 'keunggulan' ? `<textarea class="input" data-rk="${key}" data-i="${i}" data-f="${b}" rows="2" maxlength="300" placeholder="${labels[1]}">${esc(x[b])}</textarea>`
        : `<input class="input" data-rk="${key}" data-i="${i}" data-f="${b}" maxlength="100" placeholder="${labels[1]}" value="${esc(x[b])}">`}
      <button class="icon-btn" data-rdel="${key}" data-i="${i}" title="Hapus baris"><i class="bi bi-trash"></i></button></div>`).join('')}
    <button class="btn btn-secondary btn-sm" data-radd="${key}"><i class="bi bi-plus-lg"></i> Tambah baris</button></div>`;
  const perBaris = '<small class="muted">Satu poin per baris.</small>';

  if (t === 'beranda') {
    body.innerHTML = `<div class="set-grid"><div class="stack">
      ${card('bi-type-h1', 'Judul utama', 'Tulisan besar di bagian paling atas beranda.', fld('heroJudul', 'Judul', d.heroJudul, { max: 120 }) + fld('heroTeks', 'Keterangan di bawah judul', d.heroTeks, { rows: 3, max: 500 }))}
      ${card('bi-building', 'Profil singkat perusahaan', 'Satu paragraf pengenalan di beranda.', fld('profilSingkat', 'Profil singkat', d.profilSingkat, { rows: 5, max: 1200 }))}
      ${card('bi-bullseye', 'Visi & misi', '', fld('visi', 'Visi', d.visi, { rows: 2, max: 500 }) + `<label class="field"><span class="label">Misi</span><textarea class="input" data-wl="misi" rows="5">${esc((d.misi || []).join('\n'))}</textarea>${perBaris}</label>`)}
    </div><div class="stack">
      ${logoWebCard()}
      ${fotoCard('hero', 'Foto latar beranda', 'Tampil di belakang judul utama. Cocok: armada, gudang, atau kegiatan bongkar muat.')}
      ${card('bi-briefcase', 'Bidang usaha', 'Daftar singkat bidang usaha.', `<label class="field"><span class="label">Bidang usaha</span><textarea class="input" data-wl="bidangUsaha" rows="4">${esc((d.bidangUsaha || []).join('\n'))}</textarea>${perBaris}</label>`)}
      ${card('bi-award', 'Keunggulan perusahaan', 'Ditampilkan sebagai kartu di beranda (maks. 8).', pairRows('keunggulan', 'judul', 'teks', ['Judul keunggulan', 'Keterangan singkat']))}
      <div class="alert alert-info"><i class="bi bi-megaphone"></i><div><b>Informasi terbaru</b> di beranda diatur di tab <a href="javascript:void(0)" data-wt-go="berita">Informasi terbaru</a>.</div></div>
    </div></div>`;
  } else if (t === 'tentang') {
    body.innerHTML = `<div class="set-grid"><div class="stack">
      ${card('bi-clock-history', 'Sejarah perusahaan', 'Pisahkan paragraf dengan satu baris kosong.', fld('sejarah', 'Sejarah', d.sejarah, { rows: 9, max: 5000 }))}
      ${card('bi-building', 'Profil perusahaan', 'Uraian lengkap di halaman Tentang Kami.', fld('profil', 'Profil', d.profil, { rows: 9, max: 5000 }))}
    </div><div class="stack">
      ${fotoCard('tentang', 'Foto latar Tentang Kami', 'Tampil di bagian atas halaman Tentang Kami. Cocok: foto tim atau kantor.')}
      ${card('bi-patch-check', 'Legalitas perusahaan', 'Dokumen tanpa nomor tidak ditampilkan di website.', pairRows('legalitas', 'nama', 'nomor', ['Nama dokumen, mis. NIB', 'Nomor dokumen']))}
      <div class="alert alert-warning"><i class="bi bi-shield-exclamation"></i><div>Cukup tampilkan <b>nomor</b> dokumen. Jangan unggah foto akta/NPWP ke website publik.</div></div>
    </div></div>`;
  } else if (t === 'layanan') {
    body.innerHTML = `<div class="stack">${(d.layanan || []).map((l, i) => card(['bi-box-seam', 'bi-truck-front', 'bi-car-front'][i] || 'bi-truck', (i + 1) + '. ' + esc(l.judul), 'Tampil di halaman Produk & Layanan dan ringkasannya di beranda.',
      `<div class="row-2"><label class="field"><span class="label">Nama layanan</span><input class="input" data-lk="${i}" data-f="judul" maxlength="80" value="${esc(l.judul)}"></label><div></div></div>
       <label class="field"><span class="label">Keterangan</span><textarea class="input" data-lk="${i}" data-f="teks" rows="3" maxlength="1000">${esc(l.teks)}</textarea></label>
       <label class="field"><span class="label">Poin keunggulan layanan</span><textarea class="input" data-lk="${i}" data-f="poin" rows="4">${esc((l.poin || []).join('\n'))}</textarea>${perBaris}</label>
       ${fotoBox(l.kunci, 'Foto layanan', 'Tampil di halaman Produk & Layanan dan kartu layanan di beranda.')}`)).join('')}</div>`;
  } else if (t === 'kontak') {
    const st = S.settings || {}, k = d.kontak || {};
    body.innerHTML = `<div class="set-grid"><div class="stack">
      ${card('bi-whatsapp', 'WhatsApp & jam kerja', '', `<label class="field"><span class="label">No. WhatsApp kantor</span><input class="input mono" data-kk="wa" inputmode="tel" maxlength="20" placeholder="6281234567890" value="${esc(k.wa)}"><small class="muted">Kosongkan untuk memakai Telepon di Kop dokumen (hanya bila nomor seluler 08…).</small></label>
        <label class="field"><span class="label">Jam kerja</span><input class="input" data-kk="jamKerja" maxlength="120" value="${esc(k.jamKerja)}"></label>`)}
      ${card('bi-geo-alt', 'Google Maps', 'Peta di halaman Hubungi Kami.', `<label class="field"><span class="label">Lokasi untuk peta</span><input class="input" data-kk="maps" maxlength="300" placeholder="Nama tempat, alamat, atau koordinat (-6.2,106.8)" value="${esc(k.maps)}"><small class="muted">Kosongkan untuk memakai alamat kantor. Tip: buka Google Maps → klik kanan titik kantor → salin koordinat.</small></label>
        <div class="web-map">${mapsEmbed(k.maps || st.companyAddress)}</div>`)}
    </div><div class="stack">
      ${fotoCard('kontak', 'Foto latar Hubungi Kami', 'Tampil di bagian atas halaman Hubungi Kami. Cocok: foto depan kantor.')}
      ${card('bi-building', 'Alamat, telepon & email', 'Diambil dari Pengaturan → Kop dokumen cetak.', `<dl class="dl"><dt>Alamat</dt><dd>${esc(st.companyAddress || '—')}</dd><dt>Telepon</dt><dd>${esc(st.companyPhone || '—')}</dd><dt>Email</dt><dd>${esc(st.companyEmail || '—')}</dd></dl>
        <button class="btn btn-secondary btn-sm mt" data-go="pengaturan" id="webToKop"><i class="bi bi-pencil"></i> Ubah di Pengaturan</button>`)}
      <div class="alert alert-info"><i class="bi bi-envelope"></i><div>Formulir pertanyaan disimpan di menu <b>Pertanyaan Masuk</b> dan dikirim ke <b>${esc(st.companyEmail || 'email Super Admin')}</b>.</div></div>
    </div></div>`;
    const kb = $('#webToKop'); if (kb) kb.addEventListener('click', () => { S.ui.set.tab = 'kop'; });
  } else renderBeritaAdmin(body);

  const dirty = () => { ui.dirty = true; const m = $('#webDirty'); if (m) m.textContent = 'Ada perubahan yang belum disimpan.'; const r = $('#webReset'); if (r) r.disabled = false; };
  body.addEventListener('input', e => {
    const x = e.target;
    if (x.dataset.wk) d[x.dataset.wk] = x.value;
    else if (x.dataset.wl) d[x.dataset.wl] = x.value.split('\n').map(s => s.trim()).filter(Boolean);
    else if (x.dataset.rk) d[x.dataset.rk][+x.dataset.i][x.dataset.f] = x.value;
    else if (x.dataset.lk) d.layanan[+x.dataset.lk][x.dataset.f] = x.dataset.f === 'poin' ? x.value.split('\n').map(s => s.trim()).filter(Boolean) : x.value;
    else if (x.dataset.kk) { d.kontak = d.kontak || {}; d.kontak[x.dataset.kk] = x.value; if (x.dataset.kk === 'maps') { const m = $('.web-map'); clearTimeout(renderWebsite.t); renderWebsite.t = setTimeout(() => { m.innerHTML = mapsEmbed(x.value || (S.settings || {}).companyAddress); }, 700); } }
    else return;
    dirty();
  });
  body.addEventListener('click', e => {
    const add = e.target.closest('[data-radd]'), del = e.target.closest('[data-rdel]'), go = e.target.closest('[data-wt-go]');
    if (go) { ui.tab = go.dataset.wtGo; renderWebsite(); return; }
    const fp = e.target.closest('[data-fpick]'), fd = e.target.closest('[data-fdel]');
    if (fp) { pilihFotoWeb(fp.dataset.fpick, fp); return; }
    const lg = e.target.closest('[data-wlogo]');
    if (lg) { logoWebAksi(lg.dataset.wlogo, lg); return; }
    if (fd) { hapusFotoWebUI(fd.dataset.fdel, fd); return; }
    if (add) { const k = add.dataset.radd; d[k] = d[k] || []; if (d[k].length >= (k === 'keunggulan' ? 8 : 15)) return toast('warning', 'Batas tercapai'); d[k].push(k === 'keunggulan' ? { judul: '', teks: '' } : { nama: '', nomor: '' }); dirty(); renderWebsite(); }
    if (del) { d[del.dataset.rdel].splice(+del.dataset.i, 1); dirty(); renderWebsite(); }
  });
  const save = $('#webSave');
  if (save) save.onclick = () => {
    btnBusy(save, true, 'Menyimpan…');
    api('saveWebsite', S.token, d).then(r => { S.web = r.data; ui.draft = null; ui.dirty = false; ok('Website diperbarui', r.message); renderWebsite(); }).catch(fail).finally(() => btnBusy(save, false));
  };
  muatPreviewFotoWeb();
  const reset = $('#webReset');
  if (reset) reset.onclick = () => { ui.draft = null; ui.dirty = false; renderWebsite(); };
}
// Logo website: disimpan apa adanya (tidak dipotong persegi), cocok untuk logo mendatar berisi tulisan
function logoWebCard() {
  const lg = S.web.logo || { data: '', nama: true }, st = S.settings || {};
  const src = lg.data || st.logo || '';
  return `<div class="card"><div class="card-h"><span class="num"><i class="bi bi-badge-tm"></i></span><div><h3>Logo website</h3><p>${lg.data ? 'Logo khusus website' : 'Saat ini memakai logo aplikasi (Pengaturan → Branding)'}</p></div></div>
    <div class="web-logo-prev">${src ? `<img alt="" src="${esc(src)}">` : '<i class="bi bi-truck"></i>'}${lg.nama ? `<b>${esc(st.companyName || st.appName || '')}</b>` : ''}</div>
    <div class="chips-row"><button type="button" class="btn btn-secondary btn-sm" data-wlogo="pick"><i class="bi bi-upload"></i> ${lg.data ? 'Ganti logo' : 'Unggah logo website'}</button>
      ${lg.data ? '<button type="button" class="btn btn-ghost btn-sm" data-wlogo="del"><i class="bi bi-trash"></i> Pakai logo aplikasi</button>' : ''}</div>
    <label class="check-row" style="display:flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" data-wlogo="nama" ${lg.nama ? 'checked' : ''}><span>Tampilkan nama perusahaan di samping logo</span></label>
    <small class="muted">PNG transparan atau SVG paling bagus. Logo mendatar (berisi tulisan) tidak dipotong. Matikan nama perusahaan bila tulisannya sudah ada di logo.</small></div>`;
}
function bacaLogoWeb(file) {
  return new Promise((res, rej) => {
    if (file.type === 'image/svg+xml') {
      const fr = new FileReader();
      fr.onload = () => (fr.result.length <= 45000 ? res(fr.result) : rej(new Error('Berkas SVG terlalu besar (maks. sekitar 30 KB).')));
      fr.onerror = () => rej(new Error('Berkas tidak bisa dibaca.'));
      return fr.readAsDataURL(file);
    }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const buat = (maxH, type, q) => {
        const sc = Math.min(1, maxH / img.height, (maxH * 5) / img.width);
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL(type, q);
      };
      const coba = [[160, 'image/png'], [160, 'image/webp', .9], [120, 'image/webp', .85], [96, 'image/png'], [96, 'image/webp', .8], [72, 'image/webp', .75]];
      for (const [h, t, q] of coba) { const d = buat(h, t, q); if (d.startsWith('data:' + t) && d.length <= 45000) return res(d); }
      rej(new Error('Logo terlalu rumit untuk diperkecil. Coba gambar yang lebih sederhana.'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('File bukan gambar yang valid.')); };
    img.src = url;
  });
}
function logoWebAksi(aksi, el) {
  const lg = S.web.logo || { data: '', nama: true };
  const simpan = (data, nama, btn) => {
    if (btn && btn.tagName === 'BUTTON') btnBusy(btn, true, 'Menyimpan…');
    return api('saveWebLogo', S.token, data, nama).then(r => {
      S.web.logo = r.data; if (S.ui.web.draft) S.ui.web.draft.logo = r.data; ok(r.message, 'Tampil di website saat halaman dibuka ulang.'); renderWebsite();
    }).catch(fail).finally(() => { if (btn && btn.tagName === 'BUTTON') btnBusy(btn, false); });
  };
  if (aksi === 'nama') return simpan(null, el.checked, null);
  if (aksi === 'del') return simpan('', lg.nama, el);
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp,image/svg+xml';
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) bacaLogoWeb(f).then(d => simpan(d, lg.nama, el)).catch(fail); };
  inp.click();
}

// Foto website: unggah (dikompres di browser), pratinjau, hapus
function fotoBox(slot, label, hint) {
  const f = (S.web.foto || {})[slot];
  return `<div class="field web-foto"><span class="label">${label}</span>
    <div class="web-foto-prev ${f ? '' : 'empty'}" data-fprev="${slot}">${f ? '<span class="muted">Memuat foto…</span>' : '<i class="bi bi-image"></i><span>Belum ada foto</span>'}</div>
    <div class="chips-row"><button type="button" class="btn btn-secondary btn-sm" data-fpick="${slot}"><i class="bi bi-upload"></i> ${f ? 'Ganti foto' : 'Pilih foto'}</button>
    ${f ? `<button type="button" class="btn btn-ghost btn-sm" data-fdel="${slot}"><i class="bi bi-trash"></i> Hapus</button>` : ''}</div>
    <small class="muted">${hint} Foto mendatar (landscape) lebih baik; otomatis dikecilkan sebelum diunggah.</small></div>`;
}
function fotoCard(slot, title, hint) {
  return `<div class="card"><div class="card-h"><span class="num"><i class="bi bi-image"></i></span><div><h3>${title}</h3><p>Opsional</p></div></div>${fotoBox(slot, 'Foto', hint)}</div>`;
}
S.webFotoData = S.webFotoData || {};
function muatPreviewFotoWeb() {
  document.querySelectorAll('[data-fprev]').forEach(el => {
    const slot = el.dataset.fprev, f = (S.web.foto || {})[slot]; if (!f) return;
    const key = slot + ':' + f.v;
    const tampil = src => { el.innerHTML = `<img alt="" src="${esc(src)}">`; };
    if (S.webFotoData[key]) return tampil(S.webFotoData[key]);
    const lewatApi = () => api('getWebFoto', slot).then(r => { S.webFotoData[key] = r.data; tampil(r.data); }).catch(() => { el.innerHTML = '<span class="muted">Pratinjau tidak dapat dimuat.</span>'; });
    if (!f.url) return lewatApi();
    const img = new Image();
    img.onload = () => { S.webFotoData[key] = f.url; tampil(f.url); };
    img.onerror = lewatApi;
    img.src = f.url;
  });
}
function pilihFotoWeb(slot, btn) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
  inp.onchange = () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    btnBusy(btn, true, 'Mengunggah…');
    compressImage(file, 1920, .82).then(data => api('uploadFotoWeb', S.token, slot, data).then(r => {
      S.web.foto = r.data.foto; if (S.ui.web.draft) S.ui.web.draft.foto = r.data.foto;
      S.webFotoData[slot + ':' + r.data.foto[slot].v] = data;
      ok(r.message, r.data.publik ? 'Tampil di website saat halaman dibuka ulang.' : 'Berbagi publik Google Drive dibatasi, jadi foto dikirim lewat server (sedikit lebih lambat).');
      renderWebsite();
    })).catch(fail).finally(() => btnBusy(btn, false));
  };
  inp.click();
}
function hapusFotoWebUI(slot, btn) {
  confirmDialog({ title: 'Hapus foto?', text: 'Bagian ini kembali memakai latar warna polos.', variant: 'danger', icon: 'bi-trash', ok: 'Hapus' }).then(v => {
    if (v !== true) return;
    btnBusy(btn, true);
    api('hapusFotoWeb', S.token, slot).then(r => { S.web.foto = r.data.foto; if (S.ui.web.draft) S.ui.web.draft.foto = r.data.foto; ok(r.message); renderWebsite(); }).catch(fail).finally(() => btnBusy(btn, false));
  });
}
function mapsEmbed(q) {
  q = String(q || '').trim();
  if (!q) return '<div class="muted" style="padding:24px;text-align:center">Isi alamat kantor atau lokasi untuk menampilkan peta.</div>';
  return `<iframe title="Peta" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=16&output=embed"></iframe>`;
}
function renderBeritaAdmin(body) {
  const list = (S.d.berita || []).slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
  body.innerHTML = `<div class="table-card">
    <div class="card-title-row" style="padding:18px 20px 0"><div><h3>Informasi terbaru</h3><p class="muted">Pengumuman, promo, rute baru, atau libur operasional. Tampil di beranda website, terbaru di atas.</p></div><button class="btn btn-primary" id="bAdd"><i class="bi bi-plus-lg"></i> Tambah informasi</button></div>
    ${list.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Tanggal</th><th>Judul</th><th>Tampil</th><th class="t-actions">Aksi</th></tr></thead><tbody>
    ${list.map(b => `<tr class="${String(b.Tampil) === 'false' ? 'row-muted' : ''}"><td data-label="Tanggal">${tgl(b.Tanggal)}</td><td class="card-title" data-label="Judul"><span class="t-strong">${esc(b.Judul)}</span><span class="t-sub">${esc(String(b.Isi).slice(0, 110))}${String(b.Isi).length > 110 ? '…' : ''}</span></td>
      <td data-label="Tampil"><span class="badge ${String(b.Tampil) === 'false' ? 'b-slate' : 'b-green'}">${String(b.Tampil) === 'false' ? 'Disembunyikan' : 'Tampil'}</span></td>
      <td class="t-actions"><button class="icon-btn" data-be="${esc(b.ID)}" title="Ubah"><i class="bi bi-pencil"></i></button><button class="icon-btn" data-bd="${esc(b.ID)}" title="Hapus"><i class="bi bi-trash"></i></button></td></tr>`).join('')}
    </tbody></table></div>` : `<div style="padding:8px 20px 20px">${emptyHTML('bi-megaphone', 'Belum ada informasi', 'Bagian "Informasi terbaru" di beranda website disembunyikan sampai ada informasi yang ditampilkan.')}</div>`}</div>`;
  $('#bAdd').onclick = () => openBeritaModal(null);
  body.onclick = e => {
    const b = e.target.closest('[data-be],[data-bd]'); if (!b) return;
    const rec = byId('berita', b.dataset.be || b.dataset.bd);
    if (b.dataset.be) return openBeritaModal(rec);
    confirmDialog({ title: 'Hapus informasi?', text: rec.Judul, variant: 'danger', icon: 'bi-trash', ok: 'Hapus' }).then(v => {
      if (v !== true) return;
      api('deleteBerita', S.token, rec.ID).then(() => { removeFrom('berita', rec.ID); ok('Informasi dihapus'); renderWebsite(); }).catch(fail);
    });
  };
}
function openBeritaModal(b) {
  const d = Object.assign({ Tanggal: today(), Tampil: 'true' }, b || {});
  openModal({ title: b ? 'Ubah informasi' : 'Tambah informasi', sub: 'Tampil di bagian "Informasi terbaru" pada beranda website.', icon: 'bi-megaphone', size: 'lg',
    body: `<form id="bForm" novalidate>
      <div class="row-2"><label class="field"><span class="label req">Tanggal</span><input class="input" type="date" name="Tanggal" value="${esc(String(d.Tanggal).slice(0, 10))}"></label>
        <label class="field"><span class="label">Tampilkan di website</span><select class="input" name="Tampil"><option value="true" ${String(d.Tampil) !== 'false' ? 'selected' : ''}>Ya, tampilkan</option><option value="false" ${String(d.Tampil) === 'false' ? 'selected' : ''}>Sembunyikan dulu</option></select></label></div>
      <label class="field"><span class="label req">Judul</span><input class="input" name="Judul" maxlength="150" value="${esc(d.Judul || '')}" placeholder="mis. Rute baru Jakarta – Makassar via laut"></label>
      <label class="field"><span class="label req">Isi</span><textarea class="input" name="Isi" rows="8" maxlength="5000" placeholder="Tulis informasinya. Pisahkan paragraf dengan baris kosong.">${esc(d.Isi || '')}</textarea></label>
    </form>`,
    foot: '<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="bSave"><i class="bi bi-check2"></i> Simpan informasi</button>' });
  $('#bSave').onclick = () => {
    const v = formValues($('#bForm')); if (b) v.ID = b.ID;
    if (!v.Judul || !v.Isi) { toast('warning', 'Lengkapi data', 'Judul dan isi wajib diisi.'); return; }
    const btn = $('#bSave'); btnBusy(btn, true, 'Menyimpan…');
    api('saveBerita', S.token, v).then(r => { upsert('berita', r.data); closeModal(); ok(r.message); renderWebsite(); }).catch(fail).finally(() => btnBusy(btn, false));
  };
}

// ============================================================
// CRM: Dashboard CRM · Database Perusahaan · Sales Leads · Riwayat Aktivitas
// ============================================================
const CRM_TAHAP = ['Lead Baru', 'Dihubungi', 'Berminat', 'Penawaran Dikirim', 'Negosiasi', 'Deal', 'Gagal'];
const CRM_AKTIF = CRM_TAHAP.slice(0, 5);
const CRM_TAHAP_CLS = { 'Lead Baru': 'b-slate', Dihubungi: 'b-primary', Berminat: 'b-indigo', 'Penawaran Dikirim': 'b-amber', Negosiasi: 'b-amber', Deal: 'b-green', Gagal: 'b-red' };
const CRM_LAYANAN = ['Pengiriman Barang', 'Pengiriman Mobil & Alat Berat', 'Sewa Kendaraan'];
const CRM_LAYANAN_IC = { 'Pengiriman Barang': 'bi-box-seam', 'Pengiriman Mobil & Alat Berat': 'bi-car-front', 'Sewa Kendaraan': 'bi-truck-front' };
const CRM_STATUS_PT = ['Prospek', 'Customer', 'Mitra', 'Tidak Aktif'];
const CRM_STATUS_CLS = { Prospek: 'b-primary', Customer: 'b-green', Mitra: 'b-indigo', 'Tidak Aktif': 'b-slate' };
const CRM_PRIORITAS = ['Tinggi', 'Sedang', 'Rendah'];
const CRM_FREKUENSI = ['Sekali', 'Harian', 'Mingguan', 'Bulanan', 'Tidak tentu'];
const CRM_JENIS = ['Telepon', 'WhatsApp', 'Email', 'Meeting', 'Kunjungan', 'Kirim Penawaran', 'Follow-up', 'Lainnya'];
const CRM_JENIS_IC = { Telepon: 'bi-telephone', WhatsApp: 'bi-whatsapp', Email: 'bi-envelope', Meeting: 'bi-people', Kunjungan: 'bi-geo-alt', 'Kirim Penawaran': 'bi-file-earmark-text', 'Follow-up': 'bi-arrow-repeat', Website: 'bi-globe2', 'Perubahan tahap': 'bi-signpost-split', Lainnya: 'bi-chat-dots' };
const CRM_SUMBER = ['Website', 'Referensi', 'Kunjungan langsung', 'Telepon masuk', 'Media sosial', 'Pameran', 'Database / riset', 'Lainnya'];
const CRM_INDUSTRI = ['Otomotif', 'Dealer kendaraan', 'Distributor', 'Manufaktur', 'Logistik', 'Konstruksi', 'Pertambangan', 'Perkebunan', 'Retail', 'E-commerce', 'Pemerintahan', 'Lainnya'];

const crmPT = id => (S.d.crmCompany || []).find(c => c.ID === id) || null;
const crmLead = id => (S.d.crmLeads || []).find(l => l.ID === id) || null;
const crmAktifLead = l => CRM_AKTIF.includes(l.Tahap);
const crmBolehUbah = l => !isSales() || !l.PICEmail || l.PICEmail === S.me.email;
const crmTahapBadge = t => `<span class="badge ${CRM_TAHAP_CLS[t] || 'b-slate'}">${esc(t || '-')}</span>`;
const crmNama = l => { const p = crmPT(l.CompanyID); return p ? p.Nama : '(perusahaan dihapus)'; };
function crmFollowBadge(d) {
  if (!d) return '';
  const t = today();
  if (d < t) return `<span class="badge b-red plain"><i class="bi bi-alarm"></i> ${tglPendek(d)}</span>`;
  if (d === t) return `<span class="badge b-amber plain"><i class="bi bi-alarm"></i> Hari ini</span>`;
  return `<span class="badge b-slate plain"><i class="bi bi-calendar-event"></i> ${tglPendek(d)}</span>`;
}
function crmUserOpts(sel, kosong) {
  return (kosong ? `<option value="">${kosong}</option>` : '') + (S.d.crmUsers || []).map(u => `<option value="${esc(u.email)}" ${u.email === sel ? 'selected' : ''}>${esc(u.nama)}${u.peran === 'SALES' ? '' : u.peran === 'SUPER_ADMIN' ? ' (Super Admin)' : ' (Admin)'}</option>`).join('');
}
const crmOpts = (list, sel, kosong) => (kosong !== undefined ? `<option value="">${kosong}</option>` : '') + list.map(v => `<option ${v === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
function crmApplyResult(d) {
  if (!d) return;
  if (d.lead) upsert('crmLeads', d.lead);
  if (d.perusahaan) upsert('crmCompany', d.perusahaan);
  if (d.pelanggan) upsert('pelanggan', d.pelanggan);
  (d.harga || []).forEach(h => upsert('harga', h));
  if (d.pertanyaan) upsert('pertanyaan', d.pertanyaan);
  [].concat(d.aktivitas || [], d.ubahTahap || []).filter(Boolean).forEach(a => upsert('crmActivity', a));
  saveCache(); updateBadges();
}
function crmRerender() { if (CRM_PAGES.includes(S.page) || S.page === 'pertanyaan') renderPage(S.page); }

// ── Dashboard CRM ───────────────────────────────────────────
function renderCrm() {
  const el = $('#page-crm'), st = S.ui.crm = S.ui.crm || { pic: isSales() ? S.me.email : '' };
  const leads = (S.d.crmLeads || []).filter(l => !st.pic || l.PICEmail === st.pic);
  const akt = (S.d.crmActivity || []).filter(a => !st.pic || a.PICEmail === st.pic);
  const aktif = leads.filter(crmAktifLead), t = today(), bln = t.slice(0, 7);
  const nilaiAktif = aktif.reduce((s, l) => s + num(l.EstimasiNilai), 0);
  const dealBln = leads.filter(l => l.Tahap === 'Deal' && String(l.TanggalTutup).slice(0, 7) === bln);
  const deal = leads.filter(l => l.Tahap === 'Deal').length, gagal = leads.filter(l => l.Tahap === 'Gagal').length;
  const winRate = deal + gagal ? Math.round(deal / (deal + gagal) * 100) : null;
  const follow = aktif.filter(l => l.NextFollowup && l.NextFollowup <= t).sort((a, b) => String(a.NextFollowup).localeCompare(String(b.NextFollowup)));
  const tanpaJadwal = aktif.filter(l => !l.NextFollowup).length;
  const maxCnt = Math.max(1, ...CRM_TAHAP.map(tp => leads.filter(l => l.Tahap === tp).length));
  const funnel = CRM_TAHAP.map(tp => {
    const ls = leads.filter(l => l.Tahap === tp), n = ls.reduce((s, l) => s + num(l.EstimasiNilai), 0);
    return `<button class="fn-row" data-crm-tahap="${esc(tp)}"><span class="fn-l">${esc(tp)}</span><span class="fn-bar"><i class="${CRM_TAHAP_CLS[tp]}" style="width:${Math.max(ls.length ? 4 : 0, ls.length / maxCnt * 100)}%"></i></span><b class="fn-n">${ls.length}</b><span class="fn-v mono">${n ? rp(n) : '—'}</span></button>`;
  }).join('');
  const per30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const sales = (S.d.crmUsers || []).filter(u => !isSales() || u.email === S.me.email).map(u => {
    const ls = (S.d.crmLeads || []).filter(l => l.PICEmail === u.email);
    return { u, aktif: ls.filter(crmAktifLead).length, nilai: ls.filter(crmAktifLead).reduce((s, l) => s + num(l.EstimasiNilai), 0),
      akt: (S.d.crmActivity || []).filter(a => a.PICEmail === u.email && a.Jenis !== 'Perubahan tahap' && String(a.Tanggal) >= per30).length,
      deal: ls.filter(l => l.Tahap === 'Deal' && String(l.TanggalTutup).slice(0, 7) === bln), telat: ls.filter(l => crmAktifLead(l) && l.NextFollowup && l.NextFollowup < t).length };
  }).filter(x => x.aktif || x.akt || x.deal.length || x.u.peran === 'SALES').sort((a, b) => b.deal.length - a.deal.length || b.aktif - a.aktif);
  const recent = akt.slice().sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal))).slice(0, 8);
  const perLay = CRM_LAYANAN.map(ly => { const ls = aktif.filter(l => l.Layanan === ly); return { ly, n: ls.length, v: ls.reduce((s, l) => s + num(l.EstimasiNilai), 0) }; });

  el.innerHTML = `
  <div class="hero">
    <div class="grow"><h1>Dashboard CRM</h1><p>Pantau peluang penjualan, jadwal follow-up, dan kinerja tim sales.</p></div>
    <div class="hero-actions">
      <select class="input" id="crmPic" style="min-width:180px">${crmUserOpts(st.pic, 'Semua sales')}</select>
      <button class="btn btn-secondary" data-crm-new="pt"><i class="bi bi-building-add"></i> Perusahaan</button>
      <button class="btn btn-primary" data-crm-new="lead"><i class="bi bi-plus-lg"></i> Lead baru</button>
    </div>
  </div>
  ${kartuTargetSales()}
  <div class="kpis">
    ${kpi('Lead aktif', aktif.length + '<small>peluang</small>', 'bi-funnel', 'ic-indigo', `${tanpaJadwal ? `<span class="badge b-amber plain">${tanpaJadwal} tanpa jadwal follow-up</span>` : 'Semua punya jadwal follow-up'}`)}
    ${kpi('Nilai pipeline', `<span class="mono" style="font-size:.8em">${rp(nilaiAktif)}</span>`, 'bi-cash-stack', 'ic-primary', 'Estimasi nilai lead aktif')}
    ${kpi('Deal bulan ini', dealBln.length + '<small>deal</small>', 'bi-trophy', 'ic-green', dealBln.length ? rp(dealBln.reduce((s, l) => s + num(l.EstimasiNilai), 0)) : 'Belum ada deal bulan ini')}
    ${kpi('Win rate', winRate === null ? '—' : winRate + '<small>%</small>', 'bi-bullseye', 'ic-amber', `${deal} deal · ${gagal} gagal`)}
  </div>
  <div class="dash-grid">
    <div class="stack">
      <div class="card"><div class="card-title-row"><div><h3>Pipeline penjualan</h3><p class="muted">Jumlah lead & estimasi nilai per tahap. Klik untuk membuka daftar.</p></div></div><div class="funnel">${funnel}</div></div>
      <div class="card"><div class="card-title-row"><div><h3>Lead aktif per layanan</h3></div></div>
        <div class="crm-lay">${perLay.map(x => `<div class="crm-lay-i"><i class="bi ${CRM_LAYANAN_IC[x.ly]}"></i><div><b>${x.n} lead</b><small>${esc(x.ly)}</small><span class="mono">${x.v ? rp(x.v) : '—'}</span></div></div>`).join('')}</div></div>
      <div class="table-card"><div class="card-title-row" style="padding:18px 20px 0"><div><h3>Kinerja sales</h3><p class="muted">Aktivitas 30 hari terakhir · deal bulan ini</p></div></div>
        ${sales.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Sales</th><th class="t-right">Lead aktif</th><th class="t-right">Nilai pipeline</th><th class="t-right">Aktivitas</th><th class="t-right">Deal</th><th class="t-right">Follow-up telat</th></tr></thead><tbody>
          ${sales.map(x => `<tr><td class="card-title" data-label="Sales"><b>${esc(x.u.nama)}</b></td><td class="t-right" data-label="Lead aktif">${x.aktif}</td><td class="t-right mono" data-label="Nilai">${x.nilai ? rp(x.nilai) : '—'}</td><td class="t-right" data-label="Aktivitas">${x.akt}</td><td class="t-right" data-label="Deal"><b>${x.deal.length}</b></td><td class="t-right" data-label="Telat">${x.telat ? `<span class="badge b-red plain">${x.telat}</span>` : '0'}</td></tr>`).join('')}
        </tbody></table></div>` : `<div style="padding:0 20px 20px">${emptyHTML('bi-people', 'Belum ada akun sales', 'Tambahkan pengguna berperan Sales di Pengaturan → Kelola akun.')}</div>`}</div>
    </div>
    <div class="stack">
      <div class="card list-card"><div class="card-title-row"><div><h3><i class="bi bi-alarm" style="color:var(--red)"></i> Follow-up hari ini</h3><p class="muted">Termasuk yang terlambat.</p></div>${follow.length ? `<span class="badge b-red plain">${follow.length}</span>` : ''}</div>
        ${follow.length ? follow.slice(0, 8).map(l => `<button class="li li-btn" data-lead="${esc(l.ID)}"><span class="kpi-ic ${l.NextFollowup < t ? 'ic-red' : 'ic-amber'}" style="width:36px;height:36px;font-size:16px"><i class="bi ${CRM_LAYANAN_IC[l.Layanan] || 'bi-funnel'}"></i></span><div class="grow"><b class="t-clip">${esc(crmNama(l))}</b><small>${esc(l.Tahap)} · ${esc(l.PICNama || '-')}</small></div>${crmFollowBadge(l.NextFollowup)}</button>`).join('') : emptyHTML('bi-calendar2-check', 'Tidak ada follow-up mendesak', 'Jadwal follow-up diatur saat mencatat aktivitas.')}
      </div>
      <div class="card list-card"><div class="card-title-row"><div><h3>Aktivitas terbaru</h3></div><button class="btn btn-ghost btn-sm" data-go="crm-aktivitas">Semua</button></div>
        ${recent.length ? recent.map(crmAktMini).join('') : emptyHTML('bi-chat-dots', 'Belum ada aktivitas', 'Catat telepon, WhatsApp, atau kunjungan dari detail lead.')}
      </div>
    </div>
  </div>`;
  $('#crmPic').onchange = e => { st.pic = e.target.value; renderCrm(); };
  el.querySelectorAll('[data-crm-tahap]').forEach(b => b.onclick = () => { S.ui.crmLeads = Object.assign(S.ui.crmLeads || {}, { tahap: b.dataset.crmTahap, pic: st.pic, view: 'tabel' }); navigateTo('crm-leads'); });
}
function crmAktMini(a) {
  const l = crmLead(a.LeadID);
  return `<button class="li li-btn" data-lead="${esc(a.LeadID)}"><span class="kpi-ic ic-primary" style="width:36px;height:36px;font-size:16px"><i class="bi ${CRM_JENIS_IC[a.Jenis] || 'bi-chat-dots'}"></i></span><div class="grow"><b class="t-clip">${esc(l ? crmNama(l) : '-')}</b><small class="t-clip">${esc(a.Jenis)} · ${esc(String(a.Keterangan || a.Hasil || '').split('\n')[0])}</small></div><small class="muted" style="white-space:nowrap">${tglPendek(a.Tanggal)}</small></button>`;
}

// ── Database Perusahaan ─────────────────────────────────────
function renderCrmPerusahaan() {
  const el = $('#page-crm-perusahaan'), st = S.ui.crmPt = S.ui.crmPt || { q: '', f: '' };
  const rows = S.d.crmCompany || [];
  el.innerHTML = `
  <div class="page-head"><div class="ph-icon"><i class="bi bi-buildings"></i></div><div class="grow"><h1>Database Perusahaan</h1><p class="muted">Calon customer & mitra. Satu perusahaan cukup dicatat sekali, lalu bisa punya banyak lead.</p></div>
    <button class="btn btn-primary" data-crm-new="pt"><i class="bi bi-plus-lg"></i> Tambah perusahaan</button></div>
  <div class="card" style="margin-bottom:16px"><div class="toolbar"><div class="search grow"><i class="bi bi-search"></i><input class="input" id="ptQ" placeholder="Cari nama, kota, industri, kontak…" value="${esc(st.q)}"></div></div>
    <div class="chips-row">${[['', 'Semua']].concat(CRM_STATUS_PT.map(s => [s, s])).map(([k, l]) => `<button class="fchip ${st.f === k ? 'active' : ''}" data-ptf="${esc(k)}">${l}<span class="cnt">${k ? rows.filter(r => r.Status === k).length : rows.length}</span></button>`).join('')}</div></div>
  <div class="table-card" id="ptList"></div>`;
  const draw = () => {
    const q = st.q.trim().toLowerCase();
    const list = rows.filter(r => (!st.f || r.Status === st.f) && (!q || [r.Nama, r.Kode, r.Kota, r.Provinsi, r.Industri, r.KontakNama, r.KontakHP, r.Telepon, r.Email].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => String(a.Nama).localeCompare(String(b.Nama)));
    $('#ptList').innerHTML = list.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Perusahaan</th><th>Kota</th><th>Kontak</th><th>Status</th><th class="t-right">Lead aktif</th><th class="t-actions">Aksi</th></tr></thead><tbody>
      ${list.map(r => { const ls = (S.d.crmLeads || []).filter(l => l.CompanyID === r.ID); return `<tr class="clickable" data-pt="${esc(r.ID)}"><td class="card-title" data-label="Perusahaan"><b>${esc(r.Nama)}</b><span class="t-sub">${esc(r.Kode)}${r.Industri ? ' · ' + esc(r.Industri) : ''}</span></td>
        <td data-label="Kota">${esc(r.Kota || '—')}${r.Provinsi ? `<span class="t-sub">${esc(r.Provinsi)}</span>` : ''}</td>
        <td data-label="Kontak">${r.KontakNama ? esc(r.KontakNama) : '—'}${r.KontakHP || r.Telepon ? `<span class="t-sub mono">${esc(r.KontakHP || r.Telepon)}</span>` : ''}</td>
        <td data-label="Status"><span class="badge ${CRM_STATUS_CLS[r.Status] || 'b-slate'}">${esc(r.Status || 'Prospek')}</span></td>
        <td class="t-right" data-label="Lead aktif">${ls.filter(crmAktifLead).length}<span class="t-sub">${ls.length} total</span></td>
        <td class="t-actions"><button class="icon-btn" data-pt-edit="${esc(r.ID)}" title="Ubah"><i class="bi bi-pencil"></i></button></td></tr>`; }).join('')}
      </tbody></table></div>` : `<div style="padding:20px">${emptyHTML('bi-buildings', rows.length ? 'Tidak ada yang cocok' : 'Belum ada perusahaan', rows.length ? 'Ubah kata kunci atau filter.' : 'Mulai dengan menambahkan calon customer pertama.')}</div>`;
  };
  $('#ptQ').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }, 120));
  el.querySelectorAll('[data-ptf]').forEach(b => b.onclick = () => { st.f = b.dataset.ptf; renderCrmPerusahaan(); });
  $('#ptList').onclick = e => {
    const ed = e.target.closest('[data-pt-edit]'); if (ed) { e.stopPropagation(); return openCrmPtForm(crmPT(ed.dataset.ptEdit)); }
    const tr = e.target.closest('[data-pt]'); if (tr) openCrmPtDetail(tr.dataset.pt);
  };
  draw();
}
function openCrmPtForm(r, after, isian) {
  const d = Object.assign({ Status: 'Prospek' }, isian || {}, r || {});
  const f = (k, l, o) => { o = o || {}; return `<label class="field${o.full ? ' full' : ''}"><span class="label${o.req ? ' req' : ''}">${l}</span>${o.html || `<input class="input${o.mono ? ' mono' : ''}" name="${k}" maxlength="${o.max || 120}" value="${esc(d[k] || '')}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.type ? ` type="${o.type}"` : ''}${o.list ? ` list="${o.list}"` : ''}>`}</label>`; };
  openModal({ title: r ? 'Ubah perusahaan' : 'Tambah perusahaan', sub: r ? r.Kode : 'Calon customer atau mitra baru', icon: 'bi-building-add', size: 'lg',
    body: `<form id="ptForm" novalidate><div class="form-sec"><h4>Identitas perusahaan</h4><div class="grid-2">
      ${f('Nama', 'Nama perusahaan', { req: true, ph: 'mis. PT Dealer Toyota A' })}
      ${f('Industri', 'Industri', { list: 'dlIndustri', ph: 'Otomotif, distributor, …' })}
      ${f('Alamat', 'Alamat', { full: true, max: 300 })}
      ${f('Kota', 'Kota')}${f('Provinsi', 'Provinsi')}
      ${f('Telepon', 'Telepon kantor', { mono: true, max: 30 })}${f('Email', 'Email perusahaan', { type: 'email' })}
      ${f('Website', 'Website', { ph: 'https://…', max: 150 })}
      ${f('Status', 'Status', { html: `<select class="input" name="Status">${crmOpts(CRM_STATUS_PT, d.Status)}</select>` })}
    </div></div>
    <div class="form-sec"><h4>Kontak person</h4><div class="grid-2">
      ${f('KontakNama', 'Nama kontak', { max: 80 })}${f('KontakJabatan', 'Jabatan', { max: 60, ph: 'mis. Manajer logistik' })}
      ${f('KontakHP', 'No. HP / WA kontak', { mono: true, max: 30 })}
      ${f('SumberData', 'Sumber data', { html: `<select class="input" name="SumberData">${crmOpts(CRM_SUMBER, d.SumberData, '— Pilih —')}</select>` })}
      ${f('Catatan', 'Catatan', { full: true, html: `<textarea class="input" name="Catatan" rows="3" maxlength="1000">${esc(d.Catatan || '')}</textarea>` })}
    </div></div>
    <datalist id="dlIndustri">${CRM_INDUSTRI.map(i => `<option>${esc(i)}</option>`).join('')}</datalist>
    ${d.PelangganID ? `<p class="muted" style="font-size:12.5px"><i class="bi bi-link-45deg"></i> Tertaut ke Data Pelanggan.</p>` : ''}</form>`,
    foot: `${r && isSA() ? '<button class="btn btn-ghost" id="ptDel" style="margin-right:auto;color:var(--red)"><i class="bi bi-trash"></i> Hapus</button>' : ''}<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="ptSave"><i class="bi bi-check2"></i> Simpan</button>` });
  $('#ptSave').onclick = () => {
    const v = formValues($('#ptForm')); if (r) v.ID = r.ID;
    if (!v.Nama.trim()) return toast('warning', 'Nama perusahaan wajib diisi');
    const b = $('#ptSave'); btnBusy(b, true, 'Menyimpan…');
    api('saveCrmCompany', S.token, v).then(res => { upsert('crmCompany', res.data); saveCache(); ok(res.message); closeModal(); if (after) after(res.data); else crmRerender(); }).catch(fail).finally(() => btnBusy(b, false));
  };
  if ($('#ptDel')) $('#ptDel').onclick = () => confirmDialog({ title: 'Hapus perusahaan?', text: r.Nama, variant: 'danger', icon: 'bi-trash', ok: 'Hapus' }).then(v => {
    if (v !== true) return;
    api('deleteCrmCompany', S.token, r.ID).then(res => { removeFrom('crmCompany', r.ID); saveCache(); ok(res.message); closeModal(); crmRerender(); }).catch(fail);
  });
}
function openCrmPtDetail(id) {
  const p = crmPT(id); if (!p) return;
  const ls = (S.d.crmLeads || []).filter(l => l.CompanyID === id).sort((a, b) => String(b.DiubahPada).localeCompare(String(a.DiubahPada)));
  const akt = (S.d.crmActivity || []).filter(a => a.CompanyID === id).sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal))).slice(0, 6);
  const wa = p.KontakHP || p.Telepon;
  openModal({ title: p.Nama, sub: [p.Kode, p.Industri, p.Kota].filter(Boolean).join(' · '), icon: 'bi-buildings', size: 'lg',
    body: `<div class="crm-detail">
      <div class="crm-info"><span class="badge ${CRM_STATUS_CLS[p.Status] || 'b-slate'}">${esc(p.Status)}</span>
        <dl class="dl">${[['Alamat', [p.Alamat, p.Kota, p.Provinsi].filter(Boolean).join(', ')], ['Telepon', p.Telepon], ['Email', p.Email], ['Website', p.Website],
          ['Kontak', [p.KontakNama, p.KontakJabatan].filter(Boolean).join(' · ')], ['HP kontak', p.KontakHP], ['Sumber', p.SumberData], ['Catatan', p.Catatan]].filter(x => x[1]).map(x => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl>
        ${wa ? `<a class="btn btn-secondary btn-sm" href="https://wa.me/${waNumber(wa)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WhatsApp ${esc(p.KontakNama || '')}</a>` : ''}</div>
      <div><div class="card-title-row"><h4 style="margin:0">Lead (${ls.length})</h4><button class="btn btn-primary btn-sm" id="ptNewLead"><i class="bi bi-plus-lg"></i> Buat lead</button></div>
        ${ls.length ? ls.map(l => `<button class="li li-btn" data-lead="${esc(l.ID)}"><span class="kpi-ic ic-indigo" style="width:34px;height:34px;font-size:15px"><i class="bi ${CRM_LAYANAN_IC[l.Layanan]}"></i></span><div class="grow"><b>${esc(l.Kode)} · ${esc(l.Layanan)}</b><small>${l.EstimasiNilai ? rp(l.EstimasiNilai) + ' · ' : ''}${esc(l.PICNama || 'Tanpa PIC')}</small></div>${crmTahapBadge(l.Tahap)}</button>`).join('') : '<p class="muted">Belum ada lead.</p>'}
        ${akt.length ? `<h4 style="margin:18px 0 0">Aktivitas terakhir</h4>${akt.map(crmAktMini).join('')}` : ''}</div></div>`,
    foot: `<button class="btn btn-secondary" data-close>Tutup</button><button class="btn btn-secondary" id="ptEdit"><i class="bi bi-pencil"></i> Ubah data</button>` });
  $('#ptEdit').onclick = () => openCrmPtForm(p, () => openCrmPtDetail(id));
  $('#ptNewLead').onclick = () => openCrmLeadForm(null, id);
}

// ── Sales Leads ─────────────────────────────────────────────
function renderCrmLeads() {
  const el = $('#page-crm-leads');
  const st = S.ui.crmLeads = Object.assign({ q: '', ly: '', pic: isSales() ? S.me.email : '', pr: '', tahap: '', view: window.innerWidth < 760 ? 'tabel' : 'kanban' }, S.ui.crmLeads || {});
  el.innerHTML = `
  <div class="page-head"><div class="ph-icon"><i class="bi bi-funnel"></i></div><div class="grow"><h1>Sales Leads</h1><p class="muted">Peluang penjualan per perusahaan. Klik lead untuk mencatat aktivitas atau memindah tahap.</p></div>
    <button class="btn btn-primary" data-crm-new="lead"><i class="bi bi-plus-lg"></i> Lead baru</button></div>
  <div class="card" style="margin-bottom:16px"><div class="toolbar">
    <div class="search grow"><i class="bi bi-search"></i><input class="input" id="ldQ" placeholder="Cari perusahaan, kode, kebutuhan, rute…" value="${esc(st.q)}"></div>
    <select class="input" id="ldLy" style="max-width:230px">${crmOpts(CRM_LAYANAN, st.ly, 'Semua layanan')}</select>
    <select class="input" id="ldPic" style="max-width:200px">${crmUserOpts(st.pic, 'Semua sales')}</select>
    <select class="input" id="ldPr" style="max-width:160px">${crmOpts(CRM_PRIORITAS, st.pr, 'Semua prioritas')}</select>
    <div class="seg"><button class="seg-btn ${st.view === 'kanban' ? 'active' : ''}" data-ldv="kanban"><i class="bi bi-kanban"></i> Papan</button><button class="seg-btn ${st.view === 'tabel' ? 'active' : ''}" data-ldv="tabel"><i class="bi bi-list-ul"></i> Tabel</button></div>
  </div>${st.view === 'tabel' ? `<div class="chips-row">${[['', 'Semua tahap']].concat(CRM_TAHAP.map(t => [t, t])).map(([k, l]) => `<button class="fchip ${st.tahap === k ? 'active' : ''}" data-ldt="${esc(k)}">${l}</button>`).join('')}</div>` : ''}</div>
  <div id="ldBody"></div>`;
  const filt = () => { const q = st.q.trim().toLowerCase(); return (S.d.crmLeads || []).filter(l => (!st.ly || l.Layanan === st.ly) && (!st.pic || l.PICEmail === st.pic) && (!st.pr || l.Prioritas === st.pr)
    && (!q || [crmNama(l), l.Kode, l.Kebutuhan, l.Rute, l.PICNama].join(' ').toLowerCase().includes(q))); };
  const card = l => `<button class="kb-card pr-${esc((l.Prioritas || 'Sedang').toLowerCase())}" data-lead="${esc(l.ID)}"><b class="t-clip">${esc(crmNama(l))}</b>
    <small><i class="bi ${CRM_LAYANAN_IC[l.Layanan]}"></i> ${esc(l.Layanan)}</small>${l.EstimasiNilai ? `<span class="mono kb-v">${rp(l.EstimasiNilai)}</span>` : ''}
    <span class="kb-f"><span class="avatar xs" title="${esc(l.PICNama || 'Tanpa PIC')}">${esc(initials(l.PICNama || '?'))}</span>${crmFollowBadge(crmAktifLead(l) ? l.NextFollowup : '')}<span class="muted mono" style="margin-left:auto;font-size:11px">${esc(l.Kode)}</span></span></button>`;
  const draw = () => {
    const list = filt();
    if (st.view === 'kanban') {
      $('#ldBody').innerHTML = `<div class="kanban">${CRM_TAHAP.map(t => { const ls = list.filter(l => l.Tahap === t).sort((a, b) => String(a.NextFollowup || '9').localeCompare(String(b.NextFollowup || '9')));
        return `<div class="kb-col"><div class="kb-h">${crmTahapBadge(t)}<b>${ls.length}</b><span class="muted mono">${ls.length ? rp(ls.reduce((s, l) => s + num(l.EstimasiNilai), 0)) : ''}</span></div><div class="kb-list">${ls.map(card).join('') || '<p class="muted kb-empty">Kosong</p>'}</div></div>`; }).join('')}</div>`;
    } else {
      const ls = list.filter(l => !st.tahap || l.Tahap === st.tahap).sort((a, b) => String(b.DiubahPada).localeCompare(String(a.DiubahPada)));
      $('#ldBody').innerHTML = `<div class="table-card">${ls.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Lead</th><th>Layanan</th><th>Tahap</th><th class="t-right">Estimasi nilai</th><th>PIC</th><th>Follow-up</th></tr></thead><tbody>
        ${ls.map(l => `<tr class="clickable" data-lead="${esc(l.ID)}"><td class="card-title" data-label="Lead"><b>${esc(crmNama(l))}</b><span class="t-sub">${esc(l.Kode)} · ${esc(l.Prioritas || 'Sedang')}</span></td><td data-label="Layanan">${esc(l.Layanan)}${l.Rute ? `<span class="t-sub">${esc(l.Rute)}</span>` : ''}</td>
          <td data-label="Tahap">${crmTahapBadge(l.Tahap)}</td><td class="t-right mono" data-label="Nilai">${l.EstimasiNilai ? rp(l.EstimasiNilai) : '—'}</td><td data-label="PIC">${esc(l.PICNama || '—')}</td><td data-label="Follow-up">${crmFollowBadge(crmAktifLead(l) ? l.NextFollowup : '') || '<span class="muted">—</span>'}</td></tr>`).join('')}
        </tbody></table></div>` : `<div style="padding:20px">${emptyHTML('bi-funnel', 'Belum ada lead', 'Buat lead dari Database Perusahaan atau tombol Lead baru.')}</div>`}</div>`;
    }
  };
  $('#ldQ').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }, 120));
  $('#ldLy').onchange = e => { st.ly = e.target.value; draw(); };
  $('#ldPic').onchange = e => { st.pic = e.target.value; draw(); };
  $('#ldPr').onchange = e => { st.pr = e.target.value; draw(); };
  el.querySelectorAll('[data-ldv]').forEach(b => b.onclick = () => { st.view = b.dataset.ldv; renderCrmLeads(); });
  el.querySelectorAll('[data-ldt]').forEach(b => b.onclick = () => { st.tahap = b.dataset.ldt; renderCrmLeads(); });
  draw();
}
function openCrmLeadForm(l, companyId) {
  const edit = !!(l && l.ID);
  const d = Object.assign({ Prioritas: 'Sedang', Tahap: 'Lead Baru', TanggalProspek: today(), PICEmail: S.me.email, CompanyID: companyId || '' }, l || {});
  const pts = (S.d.crmCompany || []).filter(p => p.Status !== 'Tidak Aktif' || p.ID === d.CompanyID).sort((a, b) => String(a.Nama).localeCompare(String(b.Nama)));
  const label = p => p.Nama + (p.Kota ? ' — ' + p.Kota : '') + ' (' + p.Kode + ')';
  const cur = crmPT(d.CompanyID);
  openModal({ title: edit ? 'Ubah lead' : 'Lead baru', sub: edit ? l.Kode : 'Peluang penjualan dari satu perusahaan', icon: 'bi-funnel', size: 'lg',
    body: `<form id="ldForm" novalidate><div class="grid-2">
      <label class="field full"><span class="label req">Perusahaan</span><div class="row-inline"><input class="input grow" id="ldPt" list="dlPt" placeholder="Ketik untuk mencari perusahaan…" value="${esc(cur ? label(cur) : '')}" autocomplete="off"><button type="button" class="btn btn-secondary" id="ldPtNew"><i class="bi bi-plus-lg"></i> Baru</button></div><datalist id="dlPt">${pts.map(p => `<option value="${esc(label(p))}"></option>`).join('')}</datalist><small class="err-msg" data-err="pt" hidden></small></label>
      <label class="field"><span class="label req">Jenis layanan</span><select class="input" name="Layanan">${crmOpts(CRM_LAYANAN, d.Layanan, '— Pilih —')}</select></label>
      <label class="field"><span class="label">Prioritas</span><select class="input" name="Prioritas">${crmOpts(CRM_PRIORITAS, d.Prioritas)}</select></label>
      <label class="field full"><span class="label">Kebutuhan customer</span><textarea class="input" name="Kebutuhan" rows="3" maxlength="2000" placeholder="mis. kirim 20 unit mobil per bulan Jakarta – Medan">${esc(d.Kebutuhan || '')}</textarea></label>
      <label class="field"><span class="label">Estimasi nilai (Rp)</span><input class="input t-right mono" name="EstimasiNilai" inputmode="numeric" data-money value="${num(d.EstimasiNilai) ? num(d.EstimasiNilai).toLocaleString('id-ID') : ''}" placeholder="0"></label>
      <label class="field"><span class="label">Frekuensi order</span><select class="input" name="Frekuensi">${crmOpts(CRM_FREKUENSI, d.Frekuensi, '— Pilih —')}</select></label>
      <label class="field full"><span class="label">Rute pengiriman</span><input class="input" name="Rute" maxlength="200" value="${esc(d.Rute || '')}" placeholder="mis. Jakarta → Medan, Surabaya → Makassar"></label>
      <label class="field"><span class="label">PIC sales</span>${isSales() ? `<input class="input" value="${esc(d.PICNama || S.me.nama)}" readonly>` : `<select class="input" name="PICEmail">${crmUserOpts(d.PICEmail, 'Belum ditentukan')}</select>`}</label>
      <label class="field"><span class="label">Tanggal prospek</span><input class="input" type="date" name="TanggalProspek" value="${esc(d.TanggalProspek || '')}"></label>
      <label class="field"><span class="label">Jadwal follow-up</span><input class="input" type="date" name="NextFollowup" value="${esc(d.NextFollowup || '')}"></label>
      ${edit ? '' : `<label class="field"><span class="label">Tahap awal</span><select class="input" name="Tahap">${crmOpts(CRM_AKTIF, d.Tahap)}</select></label>`}
    </div></form>`,
    foot: `${edit && isSA() ? '<button class="btn btn-ghost" id="ldDel" style="margin-right:auto;color:var(--red)"><i class="bi bi-trash"></i> Hapus</button>' : ''}<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="ldSave"><i class="bi bi-check2"></i> Simpan lead</button>` });
  const form = $('#ldForm');
  form.querySelectorAll('[data-money]').forEach(i => i.addEventListener('input', () => formatMoneyInput(i)));
  $('#ldPtNew').onclick = () => {
    const keep = formValues(form); keep.EstimasiNilai = num(keep.EstimasiNilai);
    const nama = $('#ldPt').value.trim();
    // Simpan isian lead, buat perusahaan, lalu kembali ke form lead dengan perusahaan baru terpilih
    openCrmPtForm(null, pt => openCrmLeadForm(Object.assign({}, l || {}, keep, { CompanyID: pt.ID }), pt.ID), nama && !pts.some(x => label(x) === nama) ? { Nama: nama } : null);
  };
  $('#ldSave').onclick = () => {
    const v = formValues(form);
    const ptv = $('#ldPt').value.trim(), p = pts.find(x => label(x) === ptv) || pts.find(x => x.Nama.toLowerCase() === ptv.toLowerCase());
    const e = form.querySelector('[data-err=pt]');
    if (!p) { e.textContent = ptv ? 'Perusahaan tidak ditemukan. Pilih dari daftar atau klik Baru.' : 'Pilih perusahaan.'; e.hidden = false; return; }
    if (!v.Layanan) return toast('warning', 'Pilih jenis layanan');
    v.CompanyID = p.ID; v.EstimasiNilai = num(v.EstimasiNilai); if (edit) v.ID = l.ID;
    const b = $('#ldSave'); btnBusy(b, true, 'Menyimpan…');
    api('saveCrmLead', S.token, v).then(res => { crmApplyResult(res.data); ok(res.message); closeModal(); crmRerender(); openCrmLeadDetail(res.data.lead.ID); }).catch(fail).finally(() => btnBusy(b, false));
  };
  if ($('#ldDel')) $('#ldDel').onclick = () => confirmDialog({ title: 'Hapus lead?', text: l.Kode + ' beserta seluruh riwayat aktivitasnya.', variant: 'danger', icon: 'bi-trash', ok: 'Hapus' }).then(ok2 => {
    if (ok2 !== true) return;
    api('deleteCrmLead', S.token, l.ID).then(res => { removeFrom('crmLeads', l.ID); (res.data.aktivitas || []).forEach(id => removeFrom('crmActivity', id)); saveCache(); updateBadges(); ok(res.message); closeModal(); crmRerender(); }).catch(fail);
  });
}

function openCrmLeadDetail(id) {
  const l = crmLead(id); if (!l) return;
  const p = crmPT(l.CompanyID) || {}, boleh = crmBolehUbah(l), t = today();
  const akt = (S.d.crmActivity || []).filter(a => a.LeadID === id).sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)) || String(b.DibuatPada).localeCompare(String(a.DibuatPada)));
  const idx = CRM_TAHAP.indexOf(l.Tahap);
  const now = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 16);
  const wa = p.KontakHP || p.Telepon;
  openModal({ title: (p.Nama || '-'), sub: `${l.Kode} · ${l.Layanan}`, icon: CRM_LAYANAN_IC[l.Layanan] || 'bi-funnel', size: 'lg',
    body: `<div class="stepper">${CRM_TAHAP.map((tp, i) => `<button type="button" class="st-step ${tp === l.Tahap ? 'cur' : ''} ${tp === 'Gagal' ? 'lost' : i < idx && l.Tahap !== 'Gagal' ? 'done' : ''}" data-tahap="${esc(tp)}" ${boleh ? '' : 'disabled'}>${esc(tp)}</button>`).join('')}</div>
      ${l.Tahap === 'Gagal' ? `<div class="alert alert-warning"><i class="bi bi-x-octagon"></i><div><b>Gagal:</b> ${esc(l.AlasanLost)}</div></div>` : ''}
      ${l.Tahap === 'Deal' && p.PelangganID ? `<div class="alert alert-info"><i class="bi bi-trophy"></i><div>Deal ${l.TanggalTutup ? 'pada ' + tgl(l.TanggalTutup) : ''}. Perusahaan sudah ada di <b>Data Pelanggan</b>${(() => { const pl = (S.d.pelanggan || []).find(x => x.ID === p.PelangganID); return pl ? ' (<b class="mono">' + esc(pl.IDSewa) + '</b>' + (pl.Tipe === 'Corporate' ? ' · Corporate' : '') + (pl.Marketing ? ' · marketing ' + esc(pl.Marketing) : '') + ')' : ''; })()} dan bisa dipilih di form order.</div></div>` : ''}
      ${!boleh ? `<div class="alert alert-info"><i class="bi bi-lock"></i><div>Lead milik <b>${esc(l.PICNama)}</b>. Anda hanya dapat melihat.</div></div>` : ''}
      <div class="crm-detail">
        <div class="crm-info"><dl class="dl">${[['Kebutuhan', l.Kebutuhan], ['Estimasi nilai', l.EstimasiNilai ? rp(l.EstimasiNilai) : ''], ['Frekuensi', l.Frekuensi], ['Rute', l.Rute], ['Prioritas', l.Prioritas],
          ['PIC sales', l.PICNama], ['Prospek sejak', l.TanggalProspek ? tgl(l.TanggalProspek) : ''], ['Follow-up', l.NextFollowup ? tgl(l.NextFollowup) + (crmAktifLead(l) && l.NextFollowup < t ? ' (terlambat)' : '') : ''],
          ['Kontak', [p.KontakNama, p.KontakJabatan].filter(Boolean).join(' · ')]].filter(x => x[1]).map(x => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl>
          <div class="chips-row">${wa ? `<a class="btn btn-secondary btn-sm" href="https://wa.me/${waNumber(wa)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WhatsApp</a>` : ''}<button type="button" class="btn btn-ghost btn-sm" id="ldToPt"><i class="bi bi-buildings"></i> Perusahaan</button></div>
          ${hargaSepakatHTML(l, boleh && l.Tahap !== 'Gagal')}</div>
        <div>
          ${boleh ? `<form id="akForm" class="ak-form" novalidate><h4>Catat aktivitas</h4><div class="grid-2">
            <label class="field"><span class="label">Jenis</span><select class="input" name="Jenis">${crmOpts(CRM_JENIS, 'WhatsApp')}</select></label>
            <label class="field"><span class="label">Waktu</span><input class="input" type="datetime-local" name="Tanggal" value="${now}"></label>
            <label class="field full"><span class="label">Keterangan</span><textarea class="input" name="Keterangan" rows="2" maxlength="2000" placeholder="Apa yang dilakukan / dibicarakan"></textarea></label>
            <label class="field full"><span class="label">Hasil komunikasi</span><input class="input" name="Hasil" maxlength="1000" placeholder="mis. Tertarik, minta penawaran harga"></label>
            <label class="field"><span class="label">Tindak lanjut</span><input class="input" name="TindakLanjut" maxlength="500" placeholder="mis. Kirim proposal"></label>
            <label class="field"><span class="label">Jadwal follow-up berikutnya</span><input class="input" type="date" name="NextFollowup" value="${esc(l.NextFollowup && l.NextFollowup > t ? l.NextFollowup : '')}"></label>
          </div><button type="button" class="btn btn-primary btn-sm" id="akSave"><i class="bi bi-check2"></i> Simpan aktivitas</button></form>` : ''}
          <h4 style="margin:16px 0 4px">Riwayat aktivitas (${akt.length})</h4>
          <ol class="timeline">${akt.map(a => `<li class="${a.Jenis === 'Perubahan tahap' ? 'tl-sys' : ''}"><span class="tl-ic"><i class="bi ${CRM_JENIS_IC[a.Jenis] || 'bi-chat-dots'}"></i></span><div class="grow">
            <div class="tl-h"><b>${esc(a.Jenis)}</b><small class="muted">${tglJam(a.Tanggal)} · ${esc(a.PICNama || '')}</small>${a.Jenis !== 'Perubahan tahap' && (isSA() || a.PICEmail === S.me.email) ? `<button type="button" class="icon-btn sm" data-akdel="${esc(a.ID)}" title="Hapus"><i class="bi bi-trash"></i></button>` : ''}</div>
            ${a.Keterangan ? `<p>${esc(a.Keterangan)}</p>` : ''}${a.Hasil ? `<p><span class="muted">Hasil:</span> ${esc(a.Hasil)}</p>` : ''}${a.TindakLanjut ? `<p><span class="muted">Tindak lanjut:</span> ${esc(a.TindakLanjut)}${a.NextFollowup ? ' · ' + tgl(a.NextFollowup) : ''}</p>` : ''}</div></li>`).join('') || '<p class="muted">Belum ada aktivitas.</p>'}</ol>
        </div></div>`,
    foot: `<button class="btn btn-secondary" data-close>Tutup</button>${boleh ? '<button class="btn btn-secondary" id="ldEdit"><i class="bi bi-pencil"></i> Ubah lead</button>' : ''}` });
  $('#ldToPt').onclick = () => openCrmPtDetail(l.CompanyID);
  if ($('#hsEdit')) $('#hsEdit').onclick = () => openHargaSepakat(l);
  if ($('#ldEdit')) $('#ldEdit').onclick = () => openCrmLeadForm(l);
  if ($('#akSave')) $('#akSave').onclick = () => {
    const v = formValues($('#akForm')); v.LeadID = id;
    if (!v.Keterangan.trim() && !v.Hasil.trim()) return toast('warning', 'Isi keterangan atau hasil komunikasi');
    const b = $('#akSave'); btnBusy(b, true, 'Menyimpan…');
    api('saveCrmActivity', S.token, v).then(res => { crmApplyResult(res.data); ok(res.message); crmRerender(); openCrmLeadDetail(id); }).catch(fail).finally(() => btnBusy(b, false));
  };
  $('#modalBody').querySelectorAll('[data-akdel]').forEach(b => b.onclick = () => confirmDialog({ title: 'Hapus aktivitas?', variant: 'danger', icon: 'bi-trash', ok: 'Hapus' }).then(v => {
    if (v !== true) return;
    api('deleteCrmActivity', S.token, b.dataset.akdel).then(res => { removeFrom('crmActivity', b.dataset.akdel); saveCache(); ok(res.message); crmRerender(); openCrmLeadDetail(id); }).catch(fail);
  }));
  $('#modalBody').querySelectorAll('[data-tahap]').forEach(b => b.onclick = () => crmPindahTahap(l, b.dataset.tahap));
}
function crmPindahTahap(l, tahap) {
  if (tahap === l.Tahap) return;
  const kirim = extra => api('saveCrmLead', S.token, Object.assign({ ID: l.ID, Tahap: tahap }, extra || {}))
    .then(res => { crmApplyResult(res.data); ok(res.message); crmRerender(); openCrmLeadDetail(l.ID); }).catch(fail);
  if (tahap === 'Gagal') {
    openModal({ title: 'Tandai lead gagal', sub: crmNama(l) + ' · ' + l.Kode, icon: 'bi-x-octagon', size: 'sm',
      body: `<label class="field"><span class="label req">Alasan gagal</span><select class="input" id="lostSel">${crmOpts(['Harga tidak cocok', 'Pilih kompetitor', 'Kebutuhan batal', 'Tidak ada respons', 'Rute/layanan tidak tersedia', 'Lainnya'], '')}</select></label>
        <label class="field"><span class="label">Keterangan</span><input class="input" id="lostTxt" maxlength="200" placeholder="Opsional"></label>`,
      foot: `<button class="btn btn-secondary" id="lostBack">Batal</button><button class="btn btn-danger" id="lostOk">Tandai gagal</button>` });
    $('#lostBack').onclick = () => openCrmLeadDetail(l.ID);
    $('#lostOk').onclick = () => { const a = [$('#lostSel').value, $('#lostTxt').value.trim()].filter(Boolean).join(': '); btnBusy($('#lostOk'), true); kirim({ AlasanLost: a }); };
    return;
  }
  if (tahap === 'Deal') {
    const p = crmPT(l.CompanyID) || {};
    const nh = rcParse(l.HargaSepakat).length;
    confirmDialog({ title: 'Tandai Deal?', html: `<b>${esc(p.Nama)}</b> ${p.PelangganID ? 'sudah tertaut ke Data Pelanggan dan akan ditandai <b>Corporate</b>.' : 'akan otomatis dibuatkan <b>Data Pelanggan</b> dengan kode <b>CORP-xxxx</b> (Corporate) agar bisa dipilih di form order.'} Marketing: <b>${esc(l.PICNama || S.me.nama)}</b>.<br><br>${nh ? `<i class="bi bi-tags"></i> ${nh} harga sepakat akan masuk <b>Daftar Harga</b> sebagai harga Corporate pelanggan ini.` : '<span class="muted"><i class="bi bi-info-circle"></i> Belum ada harga sepakat. Bisa diisi nanti di detail lead.</span>'}`, icon: 'bi-trophy', ok: 'Ya, Deal' })
      .then(v => { if (v === true) kirim(); });
    return;
  }
  kirim();
}

// ── Riwayat Aktivitas ───────────────────────────────────────
function renderCrmAktivitas() {
  const el = $('#page-crm-aktivitas'), st = S.ui.crmAk = S.ui.crmAk || { q: '', jenis: '', pic: isSales() ? S.me.email : '', hari: '30' };
  el.innerHTML = `
  <div class="page-head"><div class="ph-icon"><i class="bi bi-clock-history"></i></div><div class="grow"><h1>Riwayat Aktivitas</h1><p class="muted">Semua telepon, WhatsApp, meeting, dan perubahan tahap lead.</p></div></div>
  <div class="card" style="margin-bottom:16px"><div class="toolbar">
    <div class="search grow"><i class="bi bi-search"></i><input class="input" id="akQ" placeholder="Cari perusahaan, keterangan, hasil…" value="${esc(st.q)}"></div>
    <select class="input" id="akJ" style="max-width:190px">${crmOpts(CRM_JENIS.concat(['Website', 'Perubahan tahap']), st.jenis, 'Semua jenis')}</select>
    <select class="input" id="akP" style="max-width:200px">${crmUserOpts(st.pic, 'Semua sales')}</select>
    <select class="input" id="akH" style="max-width:150px">${[['7', '7 hari'], ['30', '30 hari'], ['90', '90 hari'], ['', 'Semua']].map(([k, l]) => `<option value="${k}" ${st.hari === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
  </div></div><div id="akList"></div>`;
  const draw = () => {
    const q = st.q.trim().toLowerCase(), batas = st.hari ? new Date(Date.now() - Number(st.hari) * 864e5).toISOString().slice(0, 10) : '';
    const list = (S.d.crmActivity || []).filter(a => (!st.jenis || a.Jenis === st.jenis) && (!st.pic || a.PICEmail === st.pic) && (!batas || String(a.Tanggal) >= batas)
      && (!q || [crmPT(a.CompanyID) ? crmPT(a.CompanyID).Nama : '', a.Keterangan, a.Hasil, a.TindakLanjut].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => String(b.Tanggal).localeCompare(String(a.Tanggal)));
    $('#akList').innerHTML = list.length ? `<div class="table-card"><div class="table-wrap"><table class="table cards"><thead><tr><th>Waktu</th><th>Perusahaan</th><th>Aktivitas</th><th>Hasil & tindak lanjut</th><th>Oleh</th></tr></thead><tbody>
      ${list.slice(0, 300).map(a => { const p = crmPT(a.CompanyID), l = crmLead(a.LeadID); return `<tr class="clickable" data-lead="${esc(a.LeadID)}"><td data-label="Waktu" class="mono">${tglJam(a.Tanggal)}</td>
        <td class="card-title" data-label="Perusahaan"><b>${esc(p ? p.Nama : '-')}</b><span class="t-sub">${l ? esc(l.Kode) + ' · ' + esc(l.Layanan) : ''}</span></td>
        <td data-label="Aktivitas"><span class="badge b-slate plain"><i class="bi ${CRM_JENIS_IC[a.Jenis] || 'bi-chat-dots'}"></i> ${esc(a.Jenis)}</span><span class="t-sub t-clip2">${esc(a.Keterangan || '')}</span></td>
        <td data-label="Hasil">${esc(a.Hasil || '—')}${a.TindakLanjut ? `<span class="t-sub">→ ${esc(a.TindakLanjut)}${a.NextFollowup ? ' (' + tglPendek(a.NextFollowup) + ')' : ''}</span>` : ''}</td><td data-label="Oleh">${esc(a.PICNama || '')}</td></tr>`; }).join('')}
      </tbody></table></div></div>${list.length > 300 ? '<p class="muted mt">Menampilkan 300 aktivitas terbaru. Persempit filter untuk melihat yang lain.</p>' : ''}` : `<div class="card">${emptyHTML('bi-clock-history', 'Tidak ada aktivitas', 'Ubah filter, atau catat aktivitas dari detail lead.')}</div>`;
  };
  $('#akQ').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }, 120));
  $('#akJ').onchange = e => { st.jenis = e.target.value; draw(); };
  $('#akP').onchange = e => { st.pic = e.target.value; draw(); };
  $('#akH').onchange = e => { st.hari = e.target.value; draw(); };
  draw();
}

// ── Pertanyaan website → lead ───────────────────────────────
function ptyKeLead(r, btn) {
  const pilih = isSales() ? '' : `<label class="field"><span class="label">PIC sales</span><select class="input" id="ptyPic">${crmUserOpts(S.me.email)}</select></label>`;
  openModal({ title: 'Jadikan lead CRM', sub: r.Nama + (r.Perusahaan ? ' · ' + r.Perusahaan : ''), icon: 'bi-funnel', size: 'sm',
    body: `<p class="muted" style="margin-top:0">Akan dibuat: perusahaan <b>${esc(r.Perusahaan || r.Nama)}</b> (atau memakai yang sudah ada), lead baru, dan aktivitas pertama berisi pertanyaan ini.</p>${pilih}`,
    foot: '<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="ptyLeadOk"><i class="bi bi-funnel"></i> Buat lead</button>' });
  $('#ptyLeadOk').onclick = () => {
    const b = $('#ptyLeadOk'); btnBusy(b, true, 'Membuat…');
    api('leadDariPertanyaan', S.token, r.ID, $('#ptyPic') ? $('#ptyPic').value : '').then(res => { crmApplyResult(res.data); ok(res.message); closeModal(); renderPertanyaan(); openCrmLeadDetail(res.data.lead.ID); }).catch(fail).finally(() => btnBusy(b, false));
  };
}

// Klik global: buka lead / perusahaan / form baru dari mana saja
document.addEventListener('click', e => {
  const ld = e.target.closest('[data-lead]');
  if (ld && !e.target.closest('[data-akdel]')) { e.preventDefault(); openCrmLeadDetail(ld.dataset.lead); return; }
  const nw = e.target.closest('[data-crm-new]');
  if (nw) { if (nw.dataset.crmNew === 'pt') openCrmPtForm(null); else openCrmLeadForm(null); }
});

// ============================================================
// CUSTOMER SERVICE: Keluhan Pelanggan (dashboard + daftar + detail)
// ============================================================
const KLH_STATUS = ['Baru', 'Diproses', 'Menunggu Pelanggan', 'Selesai', 'Dibatalkan'];
const KLH_TERBUKA = ['Baru', 'Diproses', 'Menunggu Pelanggan'];
const KLH_STATUS_CLS = { Baru: 'b-red', Diproses: 'b-amber', 'Menunggu Pelanggan': 'b-indigo', Selesai: 'b-green', Dibatalkan: 'b-slate' };
const KLH_KATEGORI = ['Keterlambatan', 'Barang rusak', 'Barang hilang / kurang', 'Kendaraan lecet / rusak', 'Pelayanan sopir / petugas',
  'Tagihan / pembayaran', 'Dokumen (surat jalan, resi, invoice)', 'Lainnya'];
const KLH_PRIO_BAWAAN = { 'Barang rusak': 'Tinggi', 'Barang hilang / kurang': 'Tinggi', 'Kendaraan lecet / rusak': 'Tinggi', Keterlambatan: 'Sedang', 'Pelayanan sopir / petugas': 'Sedang' };
const KLH_PRIO = { Tinggi: '1 hari', Sedang: '3 hari', Rendah: '7 hari' };
const KLH_PRIO_CLS = { Tinggi: 'b-red', Sedang: 'b-amber', Rendah: 'b-slate' };
const KLH_SUMBER = ['Telepon', 'WhatsApp', 'Email', 'Datang langsung', 'Website'];
const LAY_NAMA = { sewa: 'Sewa kendaraan', kirim: 'Kirim mobil', paket: 'Kirim paket' };

const sekarangWIB = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const klhTerbuka = k => KLH_TERBUKA.includes(k.Status);
const klhTelat = k => klhTerbuka(k) && k.BatasWaktu && String(k.BatasWaktu) < sekarangWIB();
function klhJam(a, b) { const t = s => new Date(String(s).replace(' ', 'T') + '+07:00').getTime(); return (t(b) - t(a)) / 3600e3; }
function klhSla(k) {
  if (!k.BatasWaktu) return '';
  if (!klhTerbuka(k)) {
    if (k.Status !== 'Selesai') return '<span class="muted">—</span>';
    return String(k.TanggalSelesai) <= String(k.BatasWaktu) ? '<span class="badge b-green plain"><i class="bi bi-check2"></i> Tepat waktu</span>' : '<span class="badge b-amber plain">Lewat SLA</span>';
  }
  const j = klhJam(sekarangWIB(), k.BatasWaktu), abs = Math.abs(j);
  const teks = abs >= 24 ? Math.round(abs / 24) + ' hari' : Math.max(1, Math.round(abs)) + ' jam';
  if (j < 0) return `<span class="badge b-red"><i class="bi bi-alarm"></i> Telat ${teks}</span>`;
  return `<span class="badge ${j < 12 ? 'b-amber' : 'b-slate'} plain"><i class="bi bi-hourglass-split"></i> Sisa ${teks}</span>`;
}
const klhBadge = s => `<span class="badge ${KLH_STATUS_CLS[s] || 'b-slate'}">${esc(s)}</span>`;
function csUserOpts(sel, kosong) {
  return (kosong !== undefined ? `<option value="">${kosong}</option>` : '') + (S.d.csUsers || []).map(u => `<option value="${esc(u.email)}" ${u.email === sel ? 'selected' : ''}>${esc(u.nama)}${u.peran === 'CS' ? '' : u.peran === 'SUPER_ADMIN' ? ' (Super Admin)' : ' (Admin)'}</option>`).join('');
}
function klhApply(d) {
  if (!d) return;
  if (d.keluhan) upsert('keluhan', d.keluhan);
  (d.log || []).forEach(l => upsert('keluhanLog', l));
  saveCache(); updateBadges();
}

function renderKeluhan() {
  const el = $('#page-keluhan'), st = S.ui.klh = S.ui.klh || { f: 'terbuka', q: '', kat: '', pic: '' };
  const all = S.d.keluhan || [], bln = today().slice(0, 7);
  const terbuka = all.filter(klhTerbuka), telat = all.filter(klhTelat);
  const selesai = all.filter(k => k.Status === 'Selesai'), selesaiBln = selesai.filter(k => String(k.TanggalSelesai).slice(0, 7) === bln);
  const tepat = selesai.filter(k => String(k.TanggalSelesai) <= String(k.BatasWaktu)).length;
  const rata = selesaiBln.length ? selesaiBln.reduce((s, k) => s + klhJam(k.Tanggal, k.TanggalSelesai), 0) / selesaiBln.length : null;
  const bulanIni = all.filter(k => String(k.Tanggal).slice(0, 7) === bln);
  const perKat = KLH_KATEGORI.map(c => ({ c, n: bulanIni.filter(k => k.Kategori === c).length })).filter(x => x.n).sort((a, b) => b.n - a.n);
  const maxKat = Math.max(1, ...perKat.map(x => x.n));
  const chips = [['terbuka', 'Terbuka', klhTerbuka], ['telat', 'Lewat SLA', klhTelat], ['saya', 'Tugas saya', k => klhTerbuka(k) && k.PICEmail === S.me.email]]
    .concat(KLH_STATUS.map(s => [s, s, k => k.Status === s])).concat([['semua', 'Semua', null]]);
  el.innerHTML = `
  <div class="hero">
    <div class="grow"><h1>Keluhan Pelanggan</h1><p>Catat, tangani, dan pantau batas waktu penyelesaian keluhan. Nomor keluhan dibuat otomatis.</p></div>
    <div class="hero-actions"><button class="btn btn-primary" data-klh-new><i class="bi bi-plus-lg"></i> Catat keluhan</button></div>
  </div>
  <div class="kpis">
    ${kpi('Keluhan terbuka', terbuka.length + '<small>keluhan</small>', 'bi-inbox', 'ic-indigo', `${terbuka.filter(k => k.Status === 'Baru').length} baru · ${terbuka.filter(k => k.Status === 'Menunggu Pelanggan').length} menunggu pelanggan`)}
    ${kpi('Lewat batas waktu', telat.length + '<small>keluhan</small>', 'bi-alarm', 'ic-red', telat.length ? '<span class="badge b-red">Segera tangani</span>' : 'Semua masih dalam SLA', '', telat.length ? 'danger' : '')}
    ${kpi('Selesai bulan ini', selesaiBln.length + '<small>keluhan</small>', 'bi-check2-circle', 'ic-green', rata === null ? 'Belum ada yang selesai' : 'Rata-rata ' + (rata >= 24 ? (rata / 24).toFixed(1) + ' hari' : rata.toFixed(1) + ' jam'))}
    ${kpi('Selesai tepat waktu', selesai.length ? Math.round(tepat / selesai.length * 100) + '<small>%</small>' : '—', 'bi-speedometer', 'ic-amber', `${tepat} dari ${selesai.length} keluhan selesai`)}
  </div>
  <div class="dash-grid klh-grid">
    <div>
      <div class="card" style="margin-bottom:16px"><div class="toolbar"><div class="search grow"><i class="bi bi-search"></i><input class="input" id="klhQ" placeholder="Cari no. keluhan, no. resi, pelapor, pelanggan…" value="${esc(st.q)}"></div>
        <select class="input" id="klhKat" style="max-width:240px">${'<option value="">Semua kategori</option>' + KLH_KATEGORI.map(c => `<option ${c === st.kat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <select class="input" id="klhPic" style="max-width:190px">${csUserOpts(st.pic, 'Semua petugas')}</select></div>
        <div class="chips-row">${chips.map(c => `<button class="fchip ${st.f === c[0] ? 'active' : ''}" data-kf="${esc(c[0])}">${c[1]}<span class="cnt">${c[2] ? all.filter(c[2]).length : all.length}</span></button>`).join('')}</div></div>
      <div class="table-card" id="klhList"></div>
    </div>
    <div class="stack">
      <div class="card list-card"><div class="card-title-row"><div><h3>Kategori bulan ini</h3><p class="muted">${bulanIni.length} keluhan masuk</p></div></div>
        ${perKat.length ? `<div class="funnel">${perKat.map(x => `<div class="fn-row fn-static"><span class="fn-l">${esc(x.c)}</span><span class="fn-bar"><i class="b-red" style="width:${x.n / maxKat * 100}%"></i></span><b class="fn-n">${x.n}</b></div>`).join('')}</div>` : emptyHTML('bi-emoji-smile', 'Belum ada keluhan bulan ini', '')}</div>
      <div class="card list-card"><div class="card-title-row"><div><h3><i class="bi bi-alarm" style="color:var(--red)"></i> Paling mendesak</h3><p class="muted">Terbuka, urut batas waktu</p></div></div>
        ${terbuka.length ? terbuka.slice().sort((a, b) => String(a.BatasWaktu).localeCompare(String(b.BatasWaktu))).slice(0, 6).map(k => `<button class="li li-btn" data-klh="${esc(k.ID)}"><div class="grow"><b>${esc(k.NoKeluhan)} · ${esc(k.Kategori)}</b><small>${esc(k.NamaPelanggan || k.NamaPelapor)}${k.PICNama ? ' · ' + esc(k.PICNama) : ' · belum ada PIC'}</small></div>${klhSla(k)}</button>`).join('') : emptyHTML('bi-check2-all', 'Tidak ada keluhan terbuka', '')}</div>
    </div>
  </div>`;
  const draw = () => {
    const chip = chips.find(c => c[0] === st.f), q = st.q.trim().toLowerCase();
    const list = all.filter(k => (!chip || !chip[2] || chip[2](k)) && (!st.kat || k.Kategori === st.kat) && (!st.pic || k.PICEmail === st.pic)
      && (!q || [k.NoKeluhan, k.NoResi, k.NamaPelapor, k.HPPelapor, k.NamaPelanggan, k.Ringkasan, k.Deskripsi].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (klhTerbuka(b) - klhTerbuka(a)) || String(klhTerbuka(a) ? a.BatasWaktu : b.Tanggal).localeCompare(String(klhTerbuka(a) ? b.BatasWaktu : a.Tanggal)));
    $('#klhList').innerHTML = list.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>No. keluhan</th><th>Pelanggan / pelapor</th><th>Keluhan</th><th>Status</th><th>Batas waktu</th><th>PIC</th></tr></thead><tbody>
      ${list.map(k => `<tr class="clickable ${klhTelat(k) ? 'row-alert' : ''}" data-klh="${esc(k.ID)}"><td class="card-title" data-label="No. keluhan"><span class="t-link">${esc(k.NoKeluhan)}</span><span class="t-sub">${tglJam(k.Tanggal)} · ${esc(k.Sumber)}</span></td>
        <td data-label="Pelanggan"><b class="t-clip">${esc(k.NamaPelanggan || k.NamaPelapor)}</b><span class="t-sub">${esc(k.NamaPelapor)}${k.NoResi ? ' · ' + esc(k.NoResi) : ''}</span></td>
        <td data-label="Keluhan"><span class="badge ${KLH_PRIO_CLS[k.Prioritas]} plain">${esc(k.Prioritas)}</span> ${esc(k.Kategori)}<span class="t-sub t-clip">${esc(k.Ringkasan !== k.Kategori ? k.Ringkasan : String(k.Deskripsi).slice(0, 80))}</span></td>
        <td data-label="Status">${klhBadge(k.Status)}</td><td data-label="Batas waktu">${klhSla(k)}</td><td data-label="PIC">${esc(k.PICNama || '—')}</td></tr>`).join('')}
      </tbody></table></div>` : `<div style="padding:20px">${emptyHTML('bi-inbox', 'Tidak ada keluhan', st.f === 'terbuka' ? 'Semua keluhan sudah ditangani.' : 'Ubah filter atau kata kunci.')}</div>`;
  };
  $('#klhQ').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }, 120));
  $('#klhKat').onchange = e => { st.kat = e.target.value; draw(); };
  $('#klhPic').onchange = e => { st.pic = e.target.value; draw(); };
  el.querySelectorAll('[data-kf]').forEach(b => b.onclick = () => { st.f = b.dataset.kf; renderKeluhan(); });
  draw();
}

function klhOrderCard(o) {
  if (!o) return '';
  let riw = []; try { riw = JSON.parse(o.RiwayatStatus || '[]'); } catch (e) { riw = []; }
  return `<div class="klh-order"><div class="klh-order-h"><b>${esc(o.NoSJ)}</b><span class="muted">${esc(LAY_NAMA[o.Layanan] || o.Layanan)} · ${tgl(o.Tanggal)}</span>${statusBadge(o.Status)}</div>
    <dl class="dl">${[['Pelanggan', o.NamaPelanggan], ['Dari', o.Asal], ['Ke', o.Tujuan], ['Muatan / unit', o.Detail], ['Kontak', o.Kontak], ['Pengemudi / armada', o.Pengemudi]].filter(x => x[1]).map(x => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl>
    ${riw.length ? `<div class="klh-riw">${riw.map(r => `<span><b>${esc(r.s)}</b> ${tglJam(r.w)}</span>`).join('<i class="bi bi-chevron-right"></i>')}</div>` : ''}</div>`;
}

function openKeluhanForm(k) {
  const edit = !!(k && k.ID);
  const d = Object.assign({ Sumber: 'WhatsApp', Prioritas: 'Sedang', PICEmail: isCS() ? S.me.email : '' }, k || {});
  const f = (name, label, html, o) => `<label class="field${o && o.full ? ' full' : ''}"><span class="label${o && o.req ? ' req' : ''}">${label}</span>${html}</label>`;
  openModal({ title: edit ? 'Ubah keluhan ' + k.NoKeluhan : 'Catat keluhan', sub: edit ? (k.NamaPelanggan || k.NamaPelapor) : 'Nomor keluhan dibuat otomatis saat disimpan', icon: 'bi-chat-square-text', size: 'lg',
    body: `<form id="klhForm" novalidate><div class="grid-2">
      ${edit ? '' : f('Sumber', 'Sumber keluhan', `<select class="input" name="Sumber">${KLH_SUMBER.filter(s => s !== 'Website').map(s => `<option ${s === d.Sumber ? 'selected' : ''}>${s}</option>`).join('')}</select>`)}
      ${edit ? '' : f('NoResi', 'No. resi / surat jalan', `<div class="row-inline"><input class="input mono grow" name="NoResi" id="klhResi" autocapitalize="characters" placeholder="Opsional, mis. PKT-261112-1" value="${esc(d.NoResi || '')}"><button type="button" class="btn btn-secondary" id="klhCek"><i class="bi bi-search"></i> Cek</button></div>`)}
      <div class="full" id="klhOrd"></div>
      ${f('NamaPelapor', 'Nama pelapor', `<input class="input" name="NamaPelapor" maxlength="80" value="${esc(d.NamaPelapor || '')}">`, { req: true })}
      ${f('HPPelapor', 'No. HP / WA pelapor', `<input class="input mono" name="HPPelapor" inputmode="tel" maxlength="25" value="${esc(d.HPPelapor || '')}">`, { req: true })}
      ${f('EmailPelapor', 'Email pelapor', `<input class="input" type="email" name="EmailPelapor" maxlength="120" value="${esc(d.EmailPelapor || '')}">`)}
      ${f('Kategori', 'Kategori', `<select class="input" name="Kategori"><option value="">— Pilih —</option>${KLH_KATEGORI.map(c => `<option ${c === d.Kategori ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>`, { req: true })}
      ${f('Prioritas', 'Prioritas (batas selesai)', `<select class="input" name="Prioritas">${Object.keys(KLH_PRIO).map(p => `<option value="${p}" ${p === d.Prioritas ? 'selected' : ''}>${p} — ${KLH_PRIO[p]}</option>`).join('')}</select>`)}
      ${f('PICEmail', 'Petugas (PIC)', `<select class="input" name="PICEmail">${csUserOpts(d.PICEmail, 'Belum ditentukan')}</select>`)}
      ${f('Ringkasan', 'Ringkasan', `<input class="input" name="Ringkasan" maxlength="150" placeholder="mis. Unit telat 1 hari dari jadwal" value="${esc(d.Ringkasan && d.Ringkasan !== d.Kategori ? d.Ringkasan : '')}">`, { full: true })}
      ${f('Deskripsi', 'Detail keluhan', `<textarea class="input" name="Deskripsi" rows="4" maxlength="3000" placeholder="Apa yang dikeluhkan, kapan, dan apa yang diminta pelanggan">${esc(d.Deskripsi || '')}</textarea>`, { req: true, full: true })}
    </div></form>`,
    foot: `<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="klhSave"><i class="bi bi-check2"></i> ${edit ? 'Simpan perubahan' : 'Simpan & buat nomor'}</button>` });
  const form = $('#klhForm');
  form.querySelector('[name=Kategori]').onchange = e => { if (!edit && KLH_PRIO_BAWAAN[e.target.value]) form.querySelector('[name=Prioritas]').value = KLH_PRIO_BAWAAN[e.target.value]; else if (!edit) form.querySelector('[name=Prioritas]').value = e.target.value ? 'Rendah' : 'Sedang'; };
  if ($('#klhCek')) {
    const cek = () => {
      const no = $('#klhResi').value.trim().toUpperCase(); $('#klhResi').value = no;
      if (!no) { $('#klhOrd').innerHTML = ''; return Promise.resolve(); }
      const b = $('#klhCek'); btnBusy(b, true);
      return api('cariOrderKeluhan', S.token, no).then(r => {
        $('#klhOrd').innerHTML = klhOrderCard(r.data.order);
        const p = r.data.pelanggan;
        if (p) { const n = form.querySelector('[name=NamaPelapor]'), h = form.querySelector('[name=HPPelapor]'), m = form.querySelector('[name=EmailPelapor]'); if (!n.value) n.value = p.Nama; if (!h.value) h.value = p.NoHP || ''; if (!m.value) m.value = p.Email || ''; }
      }).catch(e => { $('#klhOrd').innerHTML = `<div class="err-msg"><i class="bi bi-exclamation-triangle"></i> ${esc(e.message)}</div>`; }).finally(() => btnBusy(b, false));
    };
    $('#klhCek').onclick = cek;
    $('#klhResi').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); cek(); } });
  }
  $('#klhSave').onclick = () => {
    const v = formValues(form); if (edit) v.ID = k.ID;
    if (!v.NamaPelapor.trim() || digits(v.HPPelapor).length < 9) return toast('warning', 'Lengkapi pelapor', 'Isi nama dan no. HP/WA pelapor.');
    if (!v.Kategori) return toast('warning', 'Pilih kategori keluhan');
    if (v.Deskripsi.trim().length < 10) return toast('warning', 'Detail keluhan terlalu singkat');
    const b = $('#klhSave'); btnBusy(b, true, 'Menyimpan…');
    api('saveKeluhan', S.token, v).then(r => { klhApply(r.data); ok(r.message); closeModal(); if (S.page === 'keluhan') renderKeluhan(); openKeluhanDetail(r.data.keluhan.ID); }).catch(fail).finally(() => btnBusy(b, false));
  };
}

function openKeluhanDetail(id) {
  const k = (S.d.keluhan || []).find(x => x.ID === id); if (!k) return;
  const logs = (S.d.keluhanLog || []).filter(l => l.KeluhanID === id).sort((a, b) => String(b.Waktu).localeCompare(String(a.Waktu)));
  const o = (S.d.orderRingkas || []).find(x => x.ID === k.OrderID);
  const st = S.settings || {};
  const waTeks = `Halo ${k.NamaPelapor}, kami dari ${st.companyName || st.appName || ''} terkait keluhan no. ${k.NoKeluhan}${k.NoResi ? ' (resi ' + k.NoResi + ')' : ''}. `;
  const terbuka = klhTerbuka(k);
  openModal({ title: k.NoKeluhan + ' · ' + k.Kategori, sub: (k.NamaPelanggan || k.NamaPelapor) + ' · masuk ' + tglJam(k.Tanggal) + ' via ' + k.Sumber, icon: 'bi-chat-square-text', size: 'lg',
    body: `<div class="klh-top">${klhBadge(k.Status)} <span class="badge ${KLH_PRIO_CLS[k.Prioritas]} plain">Prioritas ${esc(k.Prioritas)}</span> ${klhSla(k)} <span class="muted">Batas: ${tglJam(k.BatasWaktu)}</span></div>
      ${k.Status === 'Selesai' ? `<div class="alert alert-info"><i class="bi bi-check2-circle"></i><div><b>Selesai ${tglJam(k.TanggalSelesai)}.</b> ${esc(k.Solusi)}</div></div>` : ''}
      <div class="crm-detail">
        <div class="crm-info">
          <dl class="dl">${[['Pelapor', k.NamaPelapor], ['HP / WA', k.HPPelapor], ['Email', k.EmailPelapor], ['Ringkasan', k.Ringkasan !== k.Kategori ? k.Ringkasan : ''], ['Detail', k.Deskripsi], ['PIC', k.PICNama || 'Belum ditentukan']].filter(x => x[1]).map(x => `<dt>${x[0]}</dt><dd>${esc(x[1])}</dd>`).join('')}</dl>
          <div class="chips-row"><a class="btn btn-secondary btn-sm" href="https://wa.me/${waNumber(k.HPPelapor)}?text=${encodeURIComponent(waTeks)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WA pelapor</a><button type="button" class="btn btn-ghost btn-sm" id="klhEdit"><i class="bi bi-pencil"></i> Ubah</button></div>
          ${o ? `<h4 style="margin:16px 0 8px">Order terkait</h4>${klhOrderCard(o)}` : k.NoResi ? `<p class="muted">Resi ${esc(k.NoResi)}</p>` : '<p class="muted mt">Tidak terkait order tertentu.</p>'}
        </div>
        <div>
          <div class="ak-form"><h4>Tindak lanjut</h4>
            ${terbuka ? `<div class="stepper">${['Diproses', 'Menunggu Pelanggan'].map(s => `<button type="button" class="st-step ${k.Status === s ? 'cur' : ''}" data-ks="${s}">${s}</button>`).join('')}<button type="button" class="st-step" data-ks="Selesai"><i class="bi bi-check2"></i> Selesai</button><button type="button" class="st-step lost" data-ks="Dibatalkan">Batalkan</button></div>`
              : `<div class="stepper"><button type="button" class="st-step" data-ks="Diproses"><i class="bi bi-arrow-counterclockwise"></i> Buka lagi</button></div>`}
            <label class="field"><span class="label">Catatan / balasan</span><textarea class="input" id="klhIsi" rows="3" maxlength="3000" placeholder="Apa yang sudah dilakukan atau disampaikan ke pelanggan"></textarea></label>
            <label class="check-row"><input type="checkbox" id="klhPub"> <span>Tampilkan ke pelanggan (cek status keluhan di website)</span></label>
            <div class="chips-row mt"><button type="button" class="btn btn-primary btn-sm" id="klhAdd"><i class="bi bi-check2"></i> Simpan catatan</button></div>
          </div>
          <h4 style="margin:16px 0 6px">Riwayat (${logs.length})</h4>
          <ol class="timeline">${logs.map(l => `<li class="${l.Jenis === 'Catatan' || l.Jenis === 'Balasan' ? '' : 'tl-sys'}"><span class="tl-ic"><i class="bi ${{ Dibuat: 'bi-flag', Status: 'bi-signpost-split', Balasan: 'bi-reply', Catatan: 'bi-journal-text', Prioritas: 'bi-exclamation-diamond', PIC: 'bi-person' }[l.Jenis] || 'bi-dot'}"></i></span><div class="grow">
            <div class="tl-h"><b>${esc(l.Jenis === 'Balasan' ? 'Balasan ke pelanggan' : l.Jenis === 'Catatan' ? 'Catatan internal' : l.Jenis)}</b><small class="muted">${tglJam(l.Waktu)} · ${esc(l.OlehNama)}</small>${String(l.Publik) === 'true' ? '<span class="badge b-primary plain" title="Terlihat pelanggan di website"><i class="bi bi-eye"></i> Publik</span>' : ''}</div>
            <p>${esc(l.Isi)}</p></div></li>`).join('')}</ol>
        </div></div>`,
    foot: '<button class="btn btn-secondary" data-close>Tutup</button>' });
  $('#klhEdit').onclick = () => openKeluhanForm(k);
  const kirim = (aksi, btn) => { btnBusy(btn, true); return api('tindakKeluhan', S.token, k.ID, aksi).then(r => { klhApply(r.data); ok(r.message); if (S.page === 'keluhan') renderKeluhan(); openKeluhanDetail(k.ID); }).catch(fail).finally(() => btnBusy(btn, false)); };
  $('#klhAdd').onclick = e => { const isi = $('#klhIsi').value.trim(); if (!isi) return toast('warning', 'Tulis catatan dulu'); kirim({ Isi: isi, Publik: $('#klhPub').checked }, e.currentTarget); };
  $('#modalBody').querySelectorAll('[data-ks]').forEach(b => b.onclick = () => {
    const s = b.dataset.ks, isi = $('#klhIsi').value.trim(), pub = $('#klhPub').checked;
    if (s === 'Selesai') {
      openModal({ title: 'Selesaikan ' + k.NoKeluhan, sub: 'Solusi tampil ke pelanggan di cek status website', icon: 'bi-check2-circle', size: 'sm',
        body: `<label class="field"><span class="label req">Solusi / penyelesaian</span><textarea class="input" id="klhSol" rows="4" maxlength="2000" placeholder="mis. Barang pengganti dikirim 13 Nov, ongkos ditanggung KAGUMI">${esc(isi)}</textarea></label>`,
        foot: '<button class="btn btn-secondary" id="klhSolBack">Batal</button><button class="btn btn-primary" id="klhSolOk"><i class="bi bi-check2"></i> Tandai selesai</button>' });
      $('#klhSolBack').onclick = () => openKeluhanDetail(k.ID);
      $('#klhSolOk').onclick = e => { const sol = $('#klhSol').value.trim(); if (!sol) return toast('warning', 'Isi solusi dulu'); kirim({ Status: 'Selesai', Solusi: sol }, e.currentTarget); };
      return;
    }
    if (s === 'Dibatalkan' && !isi) return toast('warning', 'Isi alasan pembatalan', 'Tulis alasannya di kolom catatan, lalu klik Batalkan lagi.');
    kirim({ Status: s, Isi: isi, Publik: pub }, b);
  });
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-klh]'); if (b) { e.preventDefault(); openKeluhanDetail(b.dataset.klh); return; }
  if (e.target.closest('[data-klh-new]')) openKeluhanForm(null);
});

// ============================================================
// KINERJA SALES (target bulanan) · KINERJA CS · SURAT MENYURAT · DAFTAR HARGA
// ============================================================
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const periodeLabel = p => { const [y, m] = String(p).split('-'); return BULAN_ID[Number(m) - 1] + ' ' + y; };
const periodeGeser = (p, n) => { const [y, m] = String(p).split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
function periodeOpts(sel, mundur) {
  const now = today().slice(0, 7), out = [];
  for (let i = -1; i < (mundur || 12); i++) out.push(periodeGeser(now, -i));
  return out.map(p => `<option value="${p}" ${p === sel ? 'selected' : ''}>${periodeLabel(p)}</option>`).join('');
}
function masaKerja(sejak) {
  if (!sejak) return { bln: null, teks: '—' };
  const a = new Date(sejak + 'T00:00:00'), b = new Date(today() + 'T00:00:00');
  const bln = Math.max(0, (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth());
  return { bln, teks: bln < 1 ? '< 1 bulan' : bln < 12 ? bln + ' bulan' : Math.floor(bln / 12) + ' th ' + (bln % 12 ? (bln % 12) + ' bln' : '') };
}
/** Bagian bulan yang sudah berjalan (0–1) untuk mengukur "sesuai jalur" target. */
function lajuBulan(p) {
  const now = today(); if (p < now.slice(0, 7)) return 1; if (p > now.slice(0, 7)) return 0;
  const [y, m] = p.split('-').map(Number); const hari = new Date(y, m, 0).getDate();
  return Number(now.slice(8, 10)) / hari;
}
const KONTAK_JENIS = ['Telepon', 'WhatsApp', 'Email', 'Meeting', 'Kunjungan', 'Kirim Penawaran', 'Follow-up', 'Lainnya'];
const METRIK = [
  { k: 'Nilai', t: 'TargetNilai', l: 'Nilai deal', ic: 'bi-cash-stack', uang: true },
  { k: 'Deal', t: 'TargetDeal', l: 'Jumlah deal', ic: 'bi-trophy' },
  { k: 'Perusahaan', t: 'TargetPerusahaan', l: 'Perusahaan dihubungi', ic: 'bi-buildings' },
  { k: 'Aktivitas', t: 'TargetAktivitas', l: 'Aktivitas', ic: 'bi-telephone-outbound' }
];
function capaianSales(email, p) {
  const leads = (S.d.crmLeads || []).filter(l => l.PICEmail === email);
  const deal = leads.filter(l => l.Tahap === 'Deal' && String(l.TanggalTutup).slice(0, 7) === p);
  const akt = (S.d.crmActivity || []).filter(a => a.PICEmail === email && String(a.Tanggal).slice(0, 7) === p && KONTAK_JENIS.includes(a.Jenis));
  const t = (S.d.targetSales || []).find(x => x.Email === email && x.Periode === p) || null;
  const real = { Nilai: deal.reduce((s, l) => s + num(l.EstimasiNilai), 0), Deal: deal.length, Perusahaan: new Set(akt.map(a => a.CompanyID)).size, Aktivitas: akt.length };
  const pct = {}; let tot = 0, n = 0;
  METRIK.forEach(m => { const tg = t ? num(t[m.t]) : 0; if (tg > 0) { pct[m.k] = Math.round(real[m.k] / tg * 100); tot += Math.min(100, pct[m.k]); n++; } });
  const skor = n ? Math.round(tot / n) : null, laju = lajuBulan(p);
  const status = skor === null ? 'Belum ada target' : skor >= 100 ? 'Tercapai' : skor >= laju * 100 * 0.9 ? 'Sesuai jalur' : 'Tertinggal';
  const telat = leads.filter(l => crmAktifLead(l) && l.NextFollowup && l.NextFollowup < today()).length;
  const tanpaJadwal = leads.filter(l => crmAktifLead(l) && !l.NextFollowup).length;
  const tahapAkhir = leads.filter(l => ['Penawaran Dikirim', 'Negosiasi'].includes(l.Tahap)).length;
  return { real, pct, t, skor, status, laju, telat, tanpaJadwal, tahapAkhir, aktifLead: leads.filter(crmAktifLead).length };
}
/** Berapa sales tertinggal target bulan ini (untuk Sales: 1 bila dirinya tertinggal). */
function targetTertinggal() {
  const p = today().slice(0, 7);
  if (isSales()) return capaianSales(S.me.email, p).status === 'Tertinggal' ? 1 : 0;
  if (isCS()) return 0;
  return (S.d.crmUsers || []).filter(u => u.peran === 'SALES' && capaianSales(u.email, p).status === 'Tertinggal').length;
}
function rekomSales(c, p) {
  const r = [], sisaHari = p === today().slice(0, 7) ? Math.max(1, new Date(...p.split('-').map((v, i) => i ? Number(v) : Number(v)), 0).getDate() - Number(today().slice(8, 10)) + 1) : 0;
  if (!c.t) return ['Belum ada target untuk bulan ini. Super Admin dapat mengaturnya lewat tombol "Atur target".'];
  if (c.pct.Aktivitas >= 100 && (c.pct.Deal || 0) < 60) r.push(`Aktivitas sudah banyak tetapi deal masih rendah. Fokus menutup ${c.tahapAkhir} lead di tahap Penawaran/Negosiasi.`);
  if (c.t && num(c.t.TargetPerusahaan) > c.real.Perusahaan && sisaHari) { const kurang = num(c.t.TargetPerusahaan) - c.real.Perusahaan; r.push(`Masih perlu menghubungi ${kurang} perusahaan lagi, sekitar ${Math.ceil(kurang / sisaHari)} per hari.`); }
  if (c.t && num(c.t.TargetAktivitas) > c.real.Aktivitas && sisaHari) { const kurang = num(c.t.TargetAktivitas) - c.real.Aktivitas; r.push(`Kurang ${kurang} aktivitas (telepon/WA/kunjungan), sekitar ${Math.ceil(kurang / sisaHari)} per hari.`); }
  if ((c.pct.Deal || 0) >= 100 && (c.pct.Nilai || 100) < 70) r.push('Jumlah deal tercapai tetapi nilainya kecil. Tawarkan layanan rutin/bulanan agar nilai per customer naik.');
  if (c.telat) r.push(`${c.telat} lead terlambat di-follow-up. Hubungi hari ini sebelum lead dingin.`);
  if (c.tanpaJadwal) r.push(`${c.tanpaJadwal} lead aktif belum punya jadwal follow-up.`);
  if (!r.length && c.skor >= 100) r.push('Semua target tercapai. Pertahankan, dan bagikan cara kerja ke tim.');
  if (!r.length) r.push('Sesuai jalur. Jaga ritme aktivitas harian.');
  return r;
}
function barPct(v, laju) {
  if (v === undefined) return '<span class="muted">—</span>';
  const cls = v >= 100 ? 'ok' : laju !== undefined && v < laju * 100 * 0.9 ? 'bad' : 'mid';
  return `<div class="pbar ${cls}"><i style="width:${Math.min(100, v)}%"></i>${laju !== undefined && laju < 1 ? `<s style="left:${laju * 100}%"></s>` : ''}</div><small>${v}%</small>`;
}
const STATUS_TGT_CLS = { Tercapai: 'b-green', 'Sesuai jalur': 'b-primary', Tertinggal: 'b-red', 'Belum ada target': 'b-slate' };

/** Kartu target di Dashboard CRM (untuk Sales: miliknya; untuk staf: ringkasan tim). */
function kartuTargetSales() {
  const p = today().slice(0, 7);
  if (isSales()) {
    const c = capaianSales(S.me.email, p);
    if (!c.t) return '';
    return `<div class="card tgt-card ${c.status === 'Tertinggal' ? 'is-bad' : ''}"><div class="card-title-row"><div><h3><i class="bi bi-bullseye"></i> Target ${periodeLabel(p)}</h3><p class="muted">Bulan berjalan ${Math.round(c.laju * 100)}% · skor ${c.skor}%</p></div><span class="badge ${STATUS_TGT_CLS[c.status]}">${c.status}</span></div>
      <div class="tgt-grid">${METRIK.map(m => `<div><small>${m.l}</small><b class="${m.uang ? 'mono' : ''}">${m.uang ? rp(c.real[m.k]) : c.real[m.k]} <span class="muted">/ ${m.uang ? rp(c.t[m.t]) : num(c.t[m.t])}</span></b>${barPct(c.pct[m.k], c.laju)}</div>`).join('')}</div>
      <ul class="rekom">${rekomSales(c, p).slice(0, 3).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  }
  const n = targetTertinggal();
  return n ? `<div class="alert alert-warning"><i class="bi bi-bullseye"></i><div><b>${n} sales tertinggal target bulan ini.</b> Lihat <a href="javascript:void(0)" data-go="crm-kinerja">Kinerja Sales</a>.</div></div>` : '';
}

function renderSalesKinerja() {
  const el = $('#page-crm-kinerja'), st = S.ui.kin = S.ui.kin || { p: today().slice(0, 7) };
  const p = st.p, sales = (S.d.crmUsers || []).filter(u => u.peran === 'SALES' && (!isSales() || u.email === S.me.email));
  const rows = sales.map(u => ({ u, c: capaianSales(u.email, p), mk: masaKerja(u.sejak) })).sort((a, b) => (b.c.skor ?? -1) - (a.c.skor ?? -1));
  const tim = METRIK.map(m => ({ m, real: rows.reduce((s, x) => s + x.c.real[m.k], 0), tgt: rows.reduce((s, x) => s + (x.c.t ? num(x.c.t[m.t]) : 0), 0) }));
  el.innerHTML = `
  <div class="hero"><div class="grow"><h1>Kinerja Sales</h1><p>Capaian per sales dibanding target bulanan: nilai deal, jumlah deal, perusahaan dihubungi, dan aktivitas.</p></div>
    <div class="hero-actions"><select class="input" id="kinP" style="min-width:170px">${periodeOpts(p)}</select>${isSA() ? '<button class="btn btn-primary" id="kinSet"><i class="bi bi-bullseye"></i> Atur target</button>' : ''}</div></div>
  ${isSales() ? '' : `<div class="kpis">${tim.map(x => kpi('Tim · ' + x.m.l, `<span class="${x.m.uang ? 'mono' : ''}" style="${x.m.uang ? 'font-size:.75em' : ''}">${x.m.uang ? rp(x.real) : x.real}</span>`, x.m.ic, 'ic-primary', x.tgt ? 'Target ' + (x.m.uang ? rp(x.tgt) : x.tgt) + ' · ' + Math.round(x.real / x.tgt * 100) + '%' : 'Belum ada target')).join('')}</div>`}
  ${rows.length ? `<div class="table-card"><div class="table-wrap"><table class="table cards kin-t"><thead><tr><th>Sales</th><th>Nilai deal</th><th>Jumlah deal</th><th>Perusahaan</th><th>Aktivitas</th><th>Skor</th></tr></thead><tbody>
    ${rows.map(({ u, c, mk }) => `<tr class="clickable" data-kin="${esc(u.email)}"><td class="card-title" data-label="Sales"><b>${esc(u.nama)}</b><span class="t-sub">Masa kerja ${esc(mk.teks)} · ${c.aktifLead} lead aktif</span></td>
      ${METRIK.map(m => `<td data-label="${m.l}"><span class="${m.uang ? 'mono' : ''}">${m.uang ? rp(c.real[m.k]) : c.real[m.k]}</span>${c.t && num(c.t[m.t]) ? `<span class="t-sub">/ ${m.uang ? rp(c.t[m.t]) : num(c.t[m.t])}</span>` : ''}${barPct(c.pct[m.k], c.laju)}</td>`).join('')}
      <td data-label="Skor"><b style="font-size:16px">${c.skor === null ? '—' : c.skor + '%'}</b><br><span class="badge ${STATUS_TGT_CLS[c.status]}">${c.status}</span></td></tr>`).join('')}
  </tbody></table></div></div>` : `<div class="card">${emptyHTML('bi-people', 'Belum ada akun Sales', 'Tambahkan pengguna berperan Sales di Pengaturan → Kelola akun.')}</div>`}
  <p class="muted mt" style="font-size:12.5px">Skor = rata-rata capaian keempat target (maks. 100% per target). Garis tipis pada bar = posisi hari ini dalam bulan; di bawah 90% dari posisi itu dianggap tertinggal. Perusahaan & aktivitas dihitung dari Riwayat Aktivitas (telepon, WA, email, meeting, kunjungan, penawaran, follow-up).</p>
  <div id="kinDetail"></div>`;
  $('#kinP').onchange = e => { st.p = e.target.value; renderSalesKinerja(); };
  if ($('#kinSet')) $('#kinSet').onclick = () => openTargetModal(p);
  const detail = email => {
    const u = sales.find(x => x.email === email), c = capaianSales(email, p);
    $('#kinDetail').innerHTML = `<div class="card mt"><div class="card-title-row"><div><h3>Rekomendasi untuk ${esc(u.nama)}</h3><p class="muted">${periodeLabel(p)}${c.t && c.t.Catatan ? ' · Catatan target: ' + esc(c.t.Catatan) : ''}</p></div><button class="btn btn-secondary btn-sm" id="kinLeads"><i class="bi bi-funnel"></i> Lihat lead</button></div>
      <ul class="rekom">${rekomSales(c, p).map(x => `<li>${esc(x)}</li>`).join('')}${!isSales() && masaKerja(u.sejak).bln !== null && masaKerja(u.sejak).bln < 3 ? '<li>Sales baru (&lt; 3 bulan): sebaiknya target bertahap & didampingi saat kunjungan.</li>' : ''}</ul></div>`;
    $('#kinLeads').onclick = () => { S.ui.crmLeads = Object.assign(S.ui.crmLeads || {}, { pic: email, view: 'tabel', tahap: '' }); navigateTo('crm-leads'); };
  };
  el.querySelectorAll('[data-kin]').forEach(tr => tr.onclick = () => detail(tr.dataset.kin));
  if (rows.length === 1 || isSales()) rows.length && detail(rows[0].u.email);
}
function openTargetModal(p) {
  const sales = (S.d.crmUsers || []).filter(u => u.peran === 'SALES');
  if (!sales.length) return toast('warning', 'Belum ada akun Sales');
  const tg = email => (S.d.targetSales || []).find(x => x.Email === email && x.Periode === p) || {};
  const val = v => num(v) ? num(v).toLocaleString('id-ID') : '';
  openModal({ title: 'Atur target ' + periodeLabel(p), sub: 'Target per sales bisa berbeda, misalnya sesuai masa kerja', icon: 'bi-bullseye', size: 'lg',
    body: `<div class="tgt-base"><b>Bantu isi sesuai masa kerja</b><p class="muted">Isi target untuk sales senior (≥ 12 bulan), lalu klik Terapkan: sales 3–12 bulan mendapat 75%, sales &lt; 3 bulan 50%.</p>
      <div class="tgt-row">${METRIK.map(m => `<label class="field"><span class="label">${m.l}</span><input class="input t-right ${m.uang ? 'mono' : ''}" data-base="${m.t}" inputmode="numeric" ${m.uang ? 'data-money' : ''}></label>`).join('')}</div>
      <div class="chips-row"><button type="button" class="btn btn-secondary btn-sm" id="tgtApply"><i class="bi bi-magic"></i> Terapkan sesuai masa kerja</button><button type="button" class="btn btn-ghost btn-sm" id="tgtCopy"><i class="bi bi-clipboard"></i> Salin dari ${periodeLabel(periodeGeser(p, -1))}</button></div></div>
      <div class="table-wrap"><table class="table tgt-table"><thead><tr><th>Sales</th>${METRIK.map(m => `<th>${m.l}</th>`).join('')}<th>Catatan</th></tr></thead><tbody>
      ${sales.map(u => { const t = tg(u.email), mk = masaKerja(u.sejak); return `<tr data-tgt="${esc(u.email)}" data-bln="${mk.bln === null ? 12 : mk.bln}"><td><b>${esc(u.nama)}</b><span class="t-sub">${esc(mk.teks)}</span></td>
        ${METRIK.map(m => `<td><input class="input t-right ${m.uang ? 'mono' : ''}" data-f="${m.t}" inputmode="numeric" ${m.uang ? 'data-money' : ''} value="${val(t[m.t])}"></td>`).join('')}
        <td><input class="input" data-f="Catatan" maxlength="300" value="${esc(t.Catatan || '')}"></td></tr>`; }).join('')}
      </tbody></table></div>`,
    foot: '<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="tgtSave"><i class="bi bi-check2"></i> Simpan target</button>' });
  const body = $('#modalBody');
  body.querySelectorAll('[data-money]').forEach(i => i.addEventListener('input', () => formatMoneyInput(i)));
  const isi = (tr, k, v) => { const i = tr.querySelector(`[data-f="${k}"]`); i.value = v ? Math.round(v).toLocaleString('id-ID') : ''; };
  $('#tgtApply').onclick = () => body.querySelectorAll('[data-tgt]').forEach(tr => {
    const b = Number(tr.dataset.bln), f = b >= 12 ? 1 : b >= 3 ? .75 : .5;
    METRIK.forEach(m => { const base = num(body.querySelector(`[data-base="${m.t}"]`).value); if (base) isi(tr, m.t, base * f); });
  });
  $('#tgtCopy').onclick = () => { const pp = periodeGeser(p, -1); let n = 0; body.querySelectorAll('[data-tgt]').forEach(tr => { const t = (S.d.targetSales || []).find(x => x.Email === tr.dataset.tgt && x.Periode === pp); if (t) { n++; METRIK.forEach(m => isi(tr, m.t, num(t[m.t]))); tr.querySelector('[data-f=Catatan]').value = t.Catatan || ''; } }); toast(n ? 'success' : 'info', n ? 'Target disalin' : 'Bulan lalu belum ada target'); };
  $('#tgtSave').onclick = () => {
    const list = $$('[data-tgt]', body).map(tr => { const o = { Email: tr.dataset.tgt, Catatan: tr.querySelector('[data-f=Catatan]').value }; METRIK.forEach(m => { o[m.t] = num(tr.querySelector(`[data-f="${m.t}"]`).value); }); return o; });
    const b = $('#tgtSave'); btnBusy(b, true, 'Menyimpan…');
    api('saveTargetSales', S.token, p, list).then(r => { r.data.forEach(t => upsert('targetSales', t)); saveCache(); updateBadges(); ok(r.message); closeModal(); renderPage(S.page); }).catch(fail).finally(() => btnBusy(b, false));
  };
}

// ── Kinerja Customer Service ──
function capaianCs(u, p) {
  const k = (S.d.keluhan || []).filter(x => x.PICEmail === u.email);
  const masuk = k.filter(x => String(x.Tanggal).slice(0, 7) === p);
  const selesai = k.filter(x => x.Status === 'Selesai' && String(x.TanggalSelesai).slice(0, 7) === p);
  const tepat = selesai.filter(x => String(x.TanggalSelesai) <= String(x.BatasWaktu)).length;
  const jam = selesai.length ? selesai.reduce((s, x) => s + klhJam(x.Tanggal, x.TanggalSelesai), 0) / selesai.length : null;
  const buka = k.filter(klhTerbuka), telat = k.filter(klhTelat);
  const balas = (S.d.keluhanLog || []).filter(l => l.OlehEmail === u.email && l.Jenis === 'Balasan' && String(l.Waktu).slice(0, 7) === p).length;
  const pty = (S.d.pertanyaan || []).filter(q => q.DitanganiOleh === u.nama && String(q.DiubahPada).slice(0, 7) === p).length;
  const ditangani = new Set(masuk.map(x => x.ID).concat(selesai.map(x => x.ID))).size;
  return { masuk: masuk.length, ditangani, selesai: selesai.length, tepat, pTepat: selesai.length ? Math.round(tepat / selesai.length * 100) : null,
    pSelesai: ditangani ? Math.round(selesai.length / ditangani * 100) : null, jam, buka: buka.length, telat: telat.length, balas, pty };
}
function rekomCs(rows, p) {
  const r = [], all = (S.d.keluhan || []);
  const tanpaPic = all.filter(k => klhTerbuka(k) && !k.PICEmail).length;
  if (tanpaPic) r.push(`${tanpaPic} keluhan terbuka belum punya petugas (PIC). Bagikan agar tidak terlewat.`);
  rows.filter(x => x.c.telat).forEach(x => r.push(`${x.u.nama} memegang ${x.c.telat} keluhan lewat batas waktu. Bantu atau alihkan ke petugas lain.`));
  rows.filter(x => x.c.pTepat !== null && x.c.pTepat < 80).forEach(x => r.push(`Ketepatan waktu ${x.u.nama} ${x.c.pTepat}% (di bawah 80%). Cek apakah hambatan ada di operasional atau di petugas.`));
  rows.filter(x => x.c.selesai && !x.c.balas).forEach(x => r.push(`${x.u.nama} belum pernah mengirim balasan publik bulan ini. Kabari pelanggan lewat balasan agar mereka tidak menunggu tanpa kabar.`));
  const bln = all.filter(k => String(k.Tanggal).slice(0, 7) === p);
  if (bln.length >= 3) {
    const per = {}; bln.forEach(k => { per[k.Kategori] = (per[k.Kategori] || 0) + 1; });
    const [kat, n] = Object.entries(per).sort((a, b) => b[1] - a[1])[0];
    if (n / bln.length >= .35) r.push(`${Math.round(n / bln.length * 100)}% keluhan ${periodeLabel(p)} adalah "${kat}". Sampaikan ke tim operasional untuk mencari akar masalahnya.`);
  }
  if (!r.length) r.push('Penanganan keluhan bulan ini baik. Pertahankan respons cepat dan balasan ke pelanggan.');
  return r;
}
function renderCsKinerja() {
  const el = $('#page-cs-kinerja'), st = S.ui.csk = S.ui.csk || { p: today().slice(0, 7) }, p = st.p;
  const users = (S.d.csUsers || []).filter(u => !isCS() || u.email === S.me.email);
  const rows = users.map(u => ({ u, c: capaianCs(u, p), mk: masaKerja(u.sejak) })).filter(x => x.u.peran === 'CS' || x.c.ditangani || x.c.buka || x.c.pty)
    .sort((a, b) => b.c.selesai - a.c.selesai || b.c.ditangani - a.c.ditangani);
  const tot = rows.reduce((s, x) => ({ d: s.d + x.c.ditangani, s: s.s + x.c.selesai, t: s.t + x.c.tepat, b: s.b + x.c.buka, l: s.l + x.c.telat }), { d: 0, s: 0, t: 0, b: 0, l: 0 });
  el.innerHTML = `
  <div class="hero"><div class="grow"><h1>Kinerja Customer Service</h1><p>Berapa pelanggan yang dibantu tiap petugas, dan apakah masalahnya terselesaikan tepat waktu.</p></div>
    <div class="hero-actions"><select class="input" id="cskP" style="min-width:170px">${periodeOpts(p)}</select></div></div>
  <div class="kpis">
    ${kpi('Keluhan ditangani', tot.d + '<small>keluhan</small>', 'bi-people', 'ic-indigo', periodeLabel(p))}
    ${kpi('Terselesaikan', tot.s + '<small>keluhan</small>', 'bi-check2-circle', 'ic-green', tot.d ? Math.round(tot.s / tot.d * 100) + '% dari yang ditangani' : '—')}
    ${kpi('Tepat waktu', tot.s ? Math.round(tot.t / tot.s * 100) + '<small>%</small>' : '—', 'bi-speedometer', 'ic-amber', tot.t + ' dari ' + tot.s + ' selesai')}
    ${kpi('Masih terbuka', tot.b + '<small>keluhan</small>', 'bi-alarm', 'ic-red', tot.l ? `<span class="badge b-red">${tot.l} lewat SLA</span>` : 'Tidak ada yang lewat SLA')}
  </div>
  ${rows.length ? `<div class="table-card"><div class="table-wrap"><table class="table cards"><thead><tr><th>Petugas</th><th class="t-right">Dibantu</th><th class="t-right">Selesai</th><th>Terselesaikan</th><th>Tepat waktu</th><th class="t-right">Rata-rata selesai</th><th class="t-right">Terbuka / lewat SLA</th><th class="t-right">Balasan · Pertanyaan web</th></tr></thead><tbody>
    ${rows.map(({ u, c, mk }) => `<tr class="clickable" data-csk="${esc(u.email)}"><td class="card-title" data-label="Petugas"><b>${esc(u.nama)}</b><span class="t-sub">${u.peran === 'CS' ? 'Customer Service' : peranTeks(u.peran)} · ${esc(mk.teks)}</span></td>
      <td class="t-right" data-label="Dibantu"><b>${c.ditangani}</b></td><td class="t-right" data-label="Selesai">${c.selesai}</td>
      <td data-label="Terselesaikan">${c.pSelesai === null ? '<span class="muted">—</span>' : barPct(c.pSelesai)}</td><td data-label="Tepat waktu">${c.pTepat === null ? '<span class="muted">—</span>' : barPct(c.pTepat)}</td>
      <td class="t-right" data-label="Rata-rata">${c.jam === null ? '—' : c.jam >= 24 ? (c.jam / 24).toFixed(1) + ' hari' : c.jam.toFixed(1) + ' jam'}</td>
      <td class="t-right" data-label="Terbuka">${c.buka}${c.telat ? ` <span class="badge b-red plain">${c.telat}</span>` : ''}</td><td class="t-right" data-label="Balasan">${c.balas} · ${c.pty}</td></tr>`).join('')}
  </tbody></table></div></div>` : `<div class="card">${emptyHTML('bi-person-check', 'Belum ada data', 'Tambahkan akun Customer Service di Pengaturan → Kelola akun.')}</div>`}
  <div class="card mt"><div class="card-title-row"><div><h3><i class="bi bi-lightbulb"></i> Rekomendasi</h3><p class="muted">${periodeLabel(p)}</p></div></div><ul class="rekom">${rekomCs(rows, p).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;
  $('#cskP').onchange = e => { st.p = e.target.value; renderCsKinerja(); };
  el.querySelectorAll('[data-csk]').forEach(tr => tr.onclick = () => { S.ui.klh = Object.assign(S.ui.klh || {}, { pic: tr.dataset.csk, f: 'semua', q: '', kat: '' }); navigateTo('keluhan'); });
}

// ── Daftar Harga ──
const HARGA_LAYANAN = ['Pengiriman Barang', 'Pengiriman Mobil & Alat Berat', 'Sewa Kendaraan', 'Lainnya'];
const HARGA_SATUAN = ['per trip', 'per unit', 'per kg', 'per m³', 'per koli', 'per hari', 'per bulan'];
/** Teks harga: paket → per kg / per m³ / minimal; lainnya → harga + satuan. */
function hargaTeks(h, html) {
  const kg = num(h.HargaKg !== undefined ? h.HargaKg : h.kg), m3 = num(h.HargaM3 !== undefined ? h.HargaM3 : h.m3), mn = num(h.HargaMin !== undefined ? h.HargaMin : h.min);
  const br = html ? '<br>' : ' · ';
  if (kg || m3) return [kg ? rp(kg) + ' /kg' : '', m3 ? rp(m3) + ' /m³' : '', mn ? 'Min. ' + rp(mn) : ''].filter(Boolean).join(br);
  return rp(h.Harga !== undefined ? h.Harga : h.harga) + (html ? '<br><span class="muted">' + esc(h.Satuan !== undefined ? h.Satuan : h.satuan || '') + '</span>' : ' ' + (h.Satuan || h.satuan || ''));
}
function renderHarga() {
  const el = $('#page-harga'), st = S.ui.hrg = S.ui.hrg || { ly: '', q: '', k: '' }, list = S.d.harga || [];
  el.innerHTML = `<div class="page-head"><div class="ph-icon"><i class="bi bi-tags"></i></div><div class="grow"><h1>Daftar Harga</h1><p class="muted"><b>Reguler</b>: harga umum, bisa ditambah dari form order (centang "Simpan ke daftar harga"). <b>Corporate</b>: harga khusus pelanggan hasil negosiasi CRM. Dipakai di form order, Rate Card, dan Surat Penawaran${isSA() ? '' : ' (hanya Super Admin yang dapat mengubah di sini)'}.</p></div>
    ${isSA() ? '<button class="btn btn-primary" id="hrgAdd"><i class="bi bi-plus-lg"></i> Tambah harga</button>' : ''}</div>
  <div class="card" style="margin-bottom:16px"><div class="toolbar"><div class="search grow"><i class="bi bi-search"></i><input class="input" id="hrgQ" placeholder="Cari rute, kota, armada…" value="${esc(st.q)}"></div>
    <select class="input" id="hrgLy" style="max-width:260px">${crmOpts(HARGA_LAYANAN, st.ly, 'Semua layanan')}</select>
    <select class="input" id="hrgK" style="max-width:180px">${crmOpts(['Reguler', 'Corporate'], st.k, 'Semua kategori')}</select>
    <button class="btn btn-secondary" data-surat-new="RC"><i class="bi bi-file-earmark-spreadsheet"></i> Buat rate card</button></div></div>
  <div class="table-card" id="hrgList"></div>`;
  const draw = () => {
    const q = st.q.trim().toLowerCase();
    const ls = list.filter(h => (!st.ly || h.Layanan === st.ly) && (!st.k || (h.Kategori || 'Reguler') === st.k) && (!q || [h.Asal, h.Tujuan, h.Armada, h.Keterangan, h.PelangganNama, h.Marketing].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => String(a.Kategori === 'Corporate' ? 1 : 0).localeCompare(String(b.Kategori === 'Corporate' ? 1 : 0)) || String(a.PelangganNama || '').localeCompare(String(b.PelangganNama || '')) || String(a.Layanan + a.Tujuan + a.Armada).localeCompare(String(b.Layanan + b.Tujuan + b.Armada)));
    $('#hrgList').innerHTML = ls.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Layanan</th><th>Rute</th><th>Armada / jenis</th><th class="t-right">Harga</th><th>Kategori</th><th>Keterangan</th>${isSA() ? '<th class="t-actions">Aksi</th>' : ''}</tr></thead><tbody>
      ${ls.map(h => `<tr class="${String(h.Aktif) === 'false' ? 'row-muted' : ''}"><td data-label="Layanan">${esc(h.Layanan)}</td><td class="card-title" data-label="Rute"><b>${esc([h.Asal, h.Tujuan].filter(Boolean).join(' → ') || '—')}</b></td><td data-label="Armada">${esc(h.Armada || '—')}</td>
        <td class="t-right mono" data-label="Harga"><b>${hargaTeks(h, true)}</b></td>
        <td data-label="Kategori">${hargaBadge(h, true)}${h.Kategori === 'Corporate' ? `<span class="t-sub">${esc(h.PelangganNama || '')}</span>${h.Marketing ? `<span class="t-sub"><i class="bi bi-person-badge"></i> Marketing ${esc(h.Marketing)}</span>` : ''}` : ''}</td><td data-label="Keterangan">${esc(h.Keterangan || '')}${String(h.Aktif) === 'false' ? ' <span class="badge b-slate">Nonaktif</span>' : ''}${h.Sumber && h.Sumber !== 'Manual' ? `<span class="t-sub">Dari ${esc(h.Sumber)}</span>` : ''}</td>
        ${isSA() ? `<td class="t-actions"><button class="icon-btn" data-hrg="${esc(h.ID)}" title="Ubah"><i class="bi bi-pencil"></i></button></td>` : ''}</tr>`).join('')}
    </tbody></table></div>` : `<div style="padding:20px">${emptyHTML('bi-tags', 'Belum ada daftar harga', isSA() ? 'Tambahkan harga standar per rute dan armada.' : 'Super Admin belum mengisi daftar harga.')}</div>`;
  };
  $('#hrgQ').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }, 120));
  $('#hrgLy').onchange = e => { st.ly = e.target.value; draw(); };
  $('#hrgK').onchange = e => { st.k = e.target.value; draw(); };
  if ($('#hrgAdd')) $('#hrgAdd').onclick = () => openHargaForm(null);
  $('#hrgList').onclick = e => { const b = e.target.closest('[data-hrg]'); if (b) openHargaForm((S.d.harga || []).find(h => h.ID === b.dataset.hrg)); };
  draw();
}
function openHargaForm(h) {
  const d = Object.assign({ Layanan: 'Pengiriman Barang', Satuan: 'per trip', Aktif: 'true', Kategori: 'Reguler' }, h || {});
  const pels = (S.d.pelanggan || []).slice().sort((a, b) => (a.Tipe === 'Corporate' ? 0 : 1) - (b.Tipe === 'Corporate' ? 0 : 1) || String(a.Nama).localeCompare(String(b.Nama)));
  const m = v => (num(v) ? num(v).toLocaleString('id-ID') : '');
  openModal({ title: h ? 'Ubah harga' : 'Tambah harga', icon: 'bi-tags', size: 'lg',
    body: `<form id="hrgForm" novalidate><div class="grid-2">
      <label class="field"><span class="label req">Layanan</span><select class="input" name="Layanan">${crmOpts(HARGA_LAYANAN, d.Layanan)}</select></label>
      <label class="field"><span class="label">Armada / jenis</span><input class="input" name="Armada" maxlength="80" value="${esc(d.Armada || '')}" placeholder="mis. CDD Box, Car carrier, Paket reguler"></label>
      <label class="field"><span class="label">Asal</span><input class="input" name="Asal" maxlength="80" value="${esc(d.Asal || '')}" placeholder="mis. Jakarta"></label>
      <label class="field"><span class="label">Tujuan</span><input class="input" name="Tujuan" maxlength="80" value="${esc(d.Tujuan || '')}" placeholder="mis. Medan"></label>
      <label class="field hb-umum"><span class="label req">Harga (Rp)</span><input class="input t-right mono" name="Harga" inputmode="numeric" data-money value="${m(d.Harga)}"></label>
      <label class="field hb-umum"><span class="label">Satuan</span><select class="input" name="Satuan">${HARGA_SATUAN.concat(d.Satuan && !HARGA_SATUAN.includes(d.Satuan) ? [d.Satuan] : []).map(x => `<option ${x === d.Satuan ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
      <label class="field hb-paket"><span class="label">Harga per kg (Rp)</span><input class="input t-right mono" name="HargaKg" inputmode="numeric" data-money value="${m(d.HargaKg)}"></label>
      <label class="field hb-paket"><span class="label">Harga per m³ / kubik (Rp)</span><input class="input t-right mono" name="HargaM3" inputmode="numeric" data-money value="${m(d.HargaM3)}"></label>
      <label class="field hb-paket"><span class="label">Harga minimal (Rp)</span><input class="input t-right mono" name="HargaMin" inputmode="numeric" data-money value="${m(d.HargaMin)}"><small class="muted">Ongkos paling rendah per kiriman.</small></label>
      <label class="field full"><span class="label">Keterangan</span><input class="input" name="Keterangan" maxlength="300" value="${esc(d.Keterangan || '')}" placeholder="mis. Min. 100 kg, belum termasuk asuransi"></label>
      <label class="field"><span class="label">Kategori</span><select class="input" name="Kategori">${crmOpts(['Reguler', 'Corporate'], d.Kategori || 'Reguler')}</select></label>
      <label class="field hb-corp"><span class="label req">Pelanggan</span><select class="input" name="PelangganID"><option value="">— Pilih pelanggan —</option>${pels.map(p => `<option value="${esc(p.ID)}" ${p.ID === d.PelangganID ? 'selected' : ''}>${esc(p.Nama)} · ${esc(p.IDSewa)}${p.Tipe === 'Corporate' ? ' (Corporate)' : ''}</option>`).join('')}</select></label>
      <label class="field hb-corp"><span class="label">Marketing</span><input class="input" name="Marketing" maxlength="80" value="${esc(d.Marketing || '')}" placeholder="mis. Budi"></label>
      <label class="field"><span class="label">Status</span><select class="input" name="Aktif"><option value="true" ${String(d.Aktif) !== 'false' ? 'selected' : ''}>Aktif</option><option value="false" ${String(d.Aktif) === 'false' ? 'selected' : ''}>Nonaktif</option></select></label>
    </div></form>`,
    foot: `${h ? '<button class="btn btn-ghost" id="hrgDel" style="margin-right:auto;color:var(--red)"><i class="bi bi-trash"></i> Hapus</button>' : ''}<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="hrgSave"><i class="bi bi-check2"></i> Simpan</button>` });
  const form = $('#hrgForm');
  form.querySelectorAll('[data-money]').forEach(i => i.addEventListener('input', () => formatMoneyInput(i)));
  // Pengiriman Barang memakai harga per kg / per m³ / minimal; layanan lain memakai harga + satuan
  const mode = () => { const paket = form.querySelector('[name=Layanan]').value === 'Pengiriman Barang'; form.querySelectorAll('.hb-paket').forEach(x => { x.hidden = !paket; }); form.querySelectorAll('.hb-umum').forEach(x => { x.hidden = paket; }); };
  form.querySelector('[name=Layanan]').addEventListener('change', mode); mode();
  const kat = () => { const c = form.querySelector('[name=Kategori]').value === 'Corporate'; form.querySelectorAll('.hb-corp').forEach(x => { x.hidden = !c; }); };
  form.querySelector('[name=Kategori]').addEventListener('change', kat); kat();
  form.querySelector('[name=PelangganID]').addEventListener('change', e => { const p = (S.d.pelanggan || []).find(x => x.ID === e.target.value), mk = form.querySelector('[name=Marketing]'); if (p && p.Marketing && !mk.value.trim()) mk.value = p.Marketing; });
  $('#hrgSave').onclick = () => {
    const v = formValues($('#hrgForm')); ['Harga', 'HargaKg', 'HargaM3', 'HargaMin'].forEach(k => { v[k] = num(v[k]); }); if (h) v.ID = h.ID;
    if (v.Kategori === 'Corporate' && !v.PelangganID) return toast('warning', 'Pilih pelanggan', 'Harga Corporate berlaku khusus untuk satu pelanggan.');
    if (v.Layanan === 'Pengiriman Barang' ? !(v.HargaKg || v.HargaM3) : !v.Harga) return toast('warning', 'Isi harga', v.Layanan === 'Pengiriman Barang' ? 'Isi harga per kg atau per m³.' : 'Harga wajib diisi.');
    const b = $('#hrgSave'); btnBusy(b, true, 'Menyimpan…');
    api('saveHarga', S.token, v).then(r => { upsert('harga', r.data); saveCache(); ok(r.message); closeModal(); renderHarga(); }).catch(fail).finally(() => btnBusy(b, false));
  };
  if ($('#hrgDel')) $('#hrgDel').onclick = () => confirmDialog({ title: 'Hapus harga ini?', variant: 'danger', icon: 'bi-trash', ok: 'Hapus' }).then(v => {
    if (v !== true) return;
    api('deleteHarga', S.token, h.ID).then(r => { removeFrom('harga', h.ID); saveCache(); ok(r.message); closeModal(); renderHarga(); }).catch(fail);
  });
}

// ── Surat menyurat ──
const SURAT_JENIS = { SPH: 'Surat Penawaran Harga', RC: 'Rate Card / Daftar Harga', SP: 'Surat Pemberitahuan', SK: 'Surat Keterangan', SU: 'Surat Undangan', ST: 'Surat Tagihan', UM: 'Surat Umum' };
const SURAT_STATUS_CLS = { Draft: 'b-slate', 'Menunggu Persetujuan': 'b-amber', Disetujui: 'b-green', Ditolak: 'b-red', Diarsipkan: 'b-slate' };
function suratTemplate(j, kepada) {
  const st = S.settings || {}, nm = st.companyName || st.appName || 'kami';
  const salam = 'Dengan hormat,\n\n';
  const t = {
    SPH: ['Penawaran Harga Jasa Pengiriman', salam + `Bersama surat ini, ${nm} bermaksud mengajukan penawaran harga jasa pengiriman/transportasi untuk kebutuhan ${kepada || 'Bapak/Ibu'}. Rincian harga terlampir pada tabel di bawah ini.\n\nHarga belum termasuk asuransi dan biaya bongkar muat, kecuali disebutkan lain. Penawaran ini berlaku 30 hari sejak tanggal surat.`],
    RC: ['Daftar Harga (Rate Card)', salam + `Berikut kami sampaikan daftar harga layanan ${nm} yang berlaku saat ini.`],
    SP: ['Pemberitahuan', salam + 'Melalui surat ini kami memberitahukan bahwa …'],
    SK: ['Surat Keterangan', 'Yang bertanda tangan di bawah ini menerangkan bahwa …'],
    SU: ['Undangan', salam + 'Dengan ini kami mengundang Bapak/Ibu untuk hadir pada:\n\nHari/tanggal : …\nWaktu : …\nTempat : …\nAcara : …'],
    ST: ['Pemberitahuan Tagihan', salam + 'Bersama surat ini kami sampaikan tagihan atas layanan yang telah kami berikan dengan rincian sebagai berikut: …'],
    UM: ['', salam]
  }[j] || ['', salam];
  return { Perihal: t[0], Isi: t[1], Penutup: 'Demikian surat ini kami sampaikan. Atas perhatian dan kerja samanya, kami ucapkan terima kasih.' };
}
function renderSurat() {
  const el = $('#page-surat'), st = S.ui.srt = S.ui.srt || { f: isSA() ? 'Menunggu Persetujuan' : 'aktif', q: '', j: '' };
  const all = S.d.surat || [];
  const chips = [['aktif', 'Semua aktif', x => x.Status !== 'Diarsipkan'], ['Draft', 'Draft'], ['Menunggu Persetujuan', 'Menunggu persetujuan'], ['Disetujui', 'Disetujui'], ['Ditolak', 'Ditolak'], ['Diarsipkan', 'Arsip']]
    .map(c => [c[0], c[1], c[2] || (x => x.Status === c[0])]);
  if (st.f === 'Menunggu Persetujuan' && !all.some(x => x.Status === st.f)) st.f = 'aktif';
  el.innerHTML = `
  <div class="page-head"><div class="ph-icon"><i class="bi bi-envelope-paper"></i></div><div class="grow"><h1>Surat Menyurat</h1><p class="muted">Nomor otomatis saat dikonfirmasi. Semua surat perlu persetujuan Super Admin sebelum dicetak, dengan tanda tangan QR.</p></div>
    <div class="chips-row">${isSA() ? '<button class="btn btn-ghost" id="srtSet"><i class="bi bi-gear"></i> Pengaturan</button>' : ''}<button class="btn btn-secondary" data-surat-new="RC"><i class="bi bi-file-earmark-spreadsheet"></i> Rate card</button><button class="btn btn-primary" data-surat-new="SPH"><i class="bi bi-plus-lg"></i> Buat surat</button></div></div>
  <div class="card" style="margin-bottom:16px"><div class="toolbar"><div class="search grow"><i class="bi bi-search"></i><input class="input" id="srtQ" placeholder="Cari nomor, perihal, tujuan…" value="${esc(st.q)}"></div>
    <select class="input" id="srtJ" style="max-width:240px"><option value="">Semua jenis</option>${Object.entries(SURAT_JENIS).map(([k, v]) => `<option value="${k}" ${st.j === k ? 'selected' : ''}>${k} · ${v}</option>`).join('')}</select></div>
    <div class="chips-row">${chips.map(c => `<button class="fchip ${st.f === c[0] ? 'active' : ''}" data-sf="${esc(c[0])}">${c[1]}<span class="cnt">${all.filter(c[2]).length}</span></button>`).join('')}</div></div>
  <div class="table-card" id="srtList"></div>`;
  const draw = () => {
    const chip = chips.find(c => c[0] === st.f), q = st.q.trim().toLowerCase();
    const ls = all.filter(x => chip[2](x) && (!st.j || x.Jenis === st.j) && (!q || [x.NoSurat, x.Perihal, x.KepadaNama, x.DibuatNama].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => String(b.DiubahPada).localeCompare(String(a.DiubahPada)));
    $('#srtList').innerHTML = ls.length ? `<div class="table-wrap"><table class="table cards"><thead><tr><th>Nomor</th><th>Perihal</th><th>Kepada</th><th>Status</th><th>Dibuat</th></tr></thead><tbody>
      ${ls.map(x => `<tr class="clickable" data-srt="${esc(x.ID)}"><td class="card-title" data-label="Nomor"><span class="${x.NoSurat ? 't-link mono' : 'muted'}">${esc(x.NoSurat || 'Belum bernomor')}</span><span class="t-sub">${esc(x.Jenis)} · ${tgl(x.Tanggal)}</span></td>
        <td data-label="Perihal"><b>${esc(x.Perihal)}</b></td><td data-label="Kepada">${esc(x.KepadaNama)}${x.KepadaUP ? `<span class="t-sub">u.p. ${esc(x.KepadaUP)}</span>` : ''}</td>
        <td data-label="Status"><span class="badge ${SURAT_STATUS_CLS[x.Status]}">${esc(x.Status)}</span></td><td data-label="Dibuat">${esc(x.DibuatNama || '')}<span class="t-sub">${tglPendek(x.DibuatPada)}</span></td></tr>`).join('')}
    </tbody></table></div>` : `<div style="padding:20px">${emptyHTML('bi-envelope-paper', 'Belum ada surat', 'Klik Buat surat untuk memulai.')}</div>`;
  };
  $('#srtQ').addEventListener('input', debounce(e => { st.q = e.target.value; draw(); }, 120));
  $('#srtJ').onchange = e => { st.j = e.target.value; draw(); };
  el.querySelectorAll('[data-sf]').forEach(b => b.onclick = () => { st.f = b.dataset.sf; renderSurat(); });
  if ($('#srtSet')) $('#srtSet').onclick = openSuratSetting;
  draw();
}
function openSuratSetting() {
  const st = S.settings || {};
  openModal({ title: 'Pengaturan surat', icon: 'bi-gear', size: 'sm',
    body: `<label class="field"><span class="label">Kode perusahaan di nomor surat</span><input class="input mono" id="ssKode" maxlength="10" value="${esc(st.kodeSurat || 'KGM')}"><small class="muted">Contoh nomor: 001/<b>${esc(st.kodeSurat || 'KGM')}</b>/SPH/XI/2026</small></label>
      <label class="field"><span class="label">Kota di tanggal surat</span><input class="input" id="ssKota" maxlength="40" value="${esc(st.kotaSurat || '')}"></label>
      <label class="field"><span class="label">Jabatan penandatangan (bawaan)</span><input class="input" id="ssJab" maxlength="60" value="${esc(st.jabatanTtd || 'Direktur')}"><small class="muted">Dipakai bila kolom Divisi akun Super Admin kosong.</small></label>`,
    foot: '<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-primary" id="ssOk"><i class="bi bi-check2"></i> Simpan</button>' });
  $('#ssOk').onclick = () => {
    const b = $('#ssOk'); btnBusy(b, true);
    api('saveSettings', S.token, { kodeSurat: $('#ssKode').value.trim().toUpperCase(), kotaSurat: $('#ssKota').value.trim(), jabatanTtd: $('#ssJab').value.trim() })
      .then(r => { S.settings = r.data; saveCache(); ok('Pengaturan surat tersimpan'); closeModal(); }).catch(fail).finally(() => btnBusy(b, false));
  };
}
function rcParse(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function rcRowHTML(r) {
  const m = v => (num(v) ? num(v).toLocaleString('id-ID') : '');
  return `<tr data-rc><td><input class="input" data-rf="layanan" maxlength="40" value="${esc(r.layanan || '')}"></td><td><input class="input" data-rf="asal" maxlength="80" value="${esc(r.asal || '')}"></td><td><input class="input" data-rf="tujuan" maxlength="80" value="${esc(r.tujuan || '')}"></td>
    <td><input class="input" data-rf="armada" maxlength="80" value="${esc(r.armada || '')}"></td><td><input class="input t-right mono" data-rf="harga" inputmode="numeric" value="${m(r.harga)}"></td><td><select class="input" data-rf="satuan"><option value=""></option>${HARGA_SATUAN.concat(r.satuan && !HARGA_SATUAN.includes(r.satuan) ? [r.satuan] : []).map(x => `<option ${x === r.satuan ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>
    <td><input class="input t-right mono" data-rf="kg" inputmode="numeric" value="${m(r.kg)}"></td><td><input class="input t-right mono" data-rf="m3" inputmode="numeric" value="${m(r.m3)}"></td><td><input class="input t-right mono" data-rf="min" inputmode="numeric" value="${m(r.min)}"></td>
    <td><input class="input" data-rf="ket" maxlength="200" value="${esc(r.ket || '')}"></td><td><button type="button" class="icon-btn" data-rcdel title="Hapus"><i class="bi bi-x-lg"></i></button></td></tr>`;
}
function openSuratForm(x, jenisBaru) {
  const edit = !!(x && x.ID);
  const jenis = edit ? x.Jenis : (jenisBaru || 'SPH');
  const d = Object.assign({ Tanggal: today(), Jenis: jenis, KepadaTipe: 'manual' }, edit ? {} : suratTemplate(jenis), x || {});
  const kontak = S.d.kontakSurat || [];
  const lbl = k => k.nama + (k.tipe === 'crm' ? ' (prospek CRM)' : ' (pelanggan)');
  let tplAwal = edit ? null : suratTemplate(jenis);
  openModal({ title: edit ? 'Ubah surat' : 'Buat surat', sub: edit && x.NoSurat ? x.NoSurat : 'Nomor dibuat otomatis saat dikonfirmasi', icon: 'bi-envelope-paper', size: 'lg',
    body: `<form id="srtForm" novalidate>
      ${x && x.Status === 'Ditolak' ? `<div class="alert alert-warning"><i class="bi bi-arrow-return-left"></i><div><b>Dikembalikan Super Admin:</b> ${esc(x.CatatanTolak)}</div></div>` : ''}
      <div class="grid-2">
        <label class="field"><span class="label req">Jenis surat</span><select class="input" name="Jenis" ${edit && x.NoSurat ? 'disabled' : ''}>${Object.entries(SURAT_JENIS).map(([k, v]) => `<option value="${k}" ${k === d.Jenis ? 'selected' : ''}>${k} · ${v}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Tanggal</span><input class="input" type="date" name="Tanggal" value="${esc(String(d.Tanggal).slice(0, 10))}"></label>
        <label class="field full"><span class="label req">Kepada Yth.</span><input class="input" id="srtKe" list="dlKontak" autocomplete="off" placeholder="Ketik nama pelanggan / perusahaan, atau tulis manual" value="${esc(d.KepadaNama || '')}"><datalist id="dlKontak">${kontak.map(k => `<option value="${esc(lbl(k))}"></option>`).join('')}</datalist></label>
        <label class="field"><span class="label">U.p. (nama penerima)</span><input class="input" name="KepadaUP" maxlength="100" value="${esc(d.KepadaUP || '')}" placeholder="mis. Bapak Budi, Manajer Logistik"></label>
        <label class="field"><span class="label">Lampiran</span><input class="input" name="Lampiran" maxlength="60" value="${esc(d.Lampiran || '')}" placeholder="mis. 1 berkas / -"></label>
        <label class="field full"><span class="label">Alamat tujuan</span><textarea class="input" name="KepadaAlamat" rows="2" maxlength="300">${esc(d.KepadaAlamat || '')}</textarea></label>
        <label class="field full"><span class="label req">Perihal</span><input class="input" name="Perihal" maxlength="200" value="${esc(d.Perihal || '')}"></label>
        <label class="field full"><span class="label">Isi surat</span><textarea class="input" name="Isi" rows="9" maxlength="20000">${esc(d.Isi || '')}</textarea><small class="muted">Pisahkan paragraf dengan baris kosong. Isi bebas diubah sesuai kebutuhan.</small></label>
      </div>
      <div id="rcBox" ${['SPH', 'RC'].includes(d.Jenis) ? '' : 'hidden'}><div class="card-title-row"><h4 style="margin:6px 0">Tabel harga</h4><div class="chips-row"><button type="button" class="btn btn-secondary btn-sm" id="rcPick"><i class="bi bi-list-check"></i> Ambil dari daftar harga</button><button type="button" class="btn btn-ghost btn-sm" id="rcAdd"><i class="bi bi-plus-lg"></i> Baris</button></div></div>
        <div class="table-wrap rc-wrap"><table class="table rc-table"><thead><tr><th>Layanan</th><th>Asal</th><th>Tujuan</th><th>Armada / jenis</th><th>Harga (Rp)</th><th>Satuan</th><th>Per kg</th><th>Per m³</th><th>Minimal</th><th>Keterangan</th><th></th></tr></thead><tbody id="rcBody">${rcParse(d.RateCard).map(rcRowHTML).join('')}</tbody></table></div>
        <small class="muted">Harga bisa diubah khusus untuk surat ini tanpa mengubah Daftar Harga. Kirim paket: isi per kg / per m³ / minimal; layanan lain: harga + satuan.</small></div>
      <div class="grid-2 mt">
        <label class="field full"><span class="label">Penutup</span><textarea class="input" name="Penutup" rows="2" maxlength="2000">${esc(d.Penutup || '')}</textarea></label>
        <label class="field full"><span class="label">Tembusan</span><input class="input" name="Tembusan" maxlength="300" value="${esc(d.Tembusan || '')}" placeholder="Opsional, pisahkan dengan koma"></label>
      </div></form>`,
    foot: `<button class="btn btn-secondary" data-close>Batal</button><button class="btn btn-secondary" id="srtDraft"><i class="bi bi-save"></i> Simpan draft</button><button class="btn btn-primary" id="srtAjukan"><i class="bi bi-send"></i> Konfirmasi & ajukan</button>` });
  const form = $('#srtForm');
  let ke = { tipe: d.KepadaTipe, id: d.KepadaID };
  $('#srtKe').addEventListener('change', e => {
    const k = kontak.find(c => lbl(c) === e.target.value);
    if (k) { e.target.value = k.nama; ke = { tipe: k.tipe, id: k.id }; form.querySelector('[name=KepadaAlamat]').value = k.alamat || ''; if (k.up && !form.querySelector('[name=KepadaUP]').value) form.querySelector('[name=KepadaUP]').value = k.up; }
    else ke = { tipe: 'manual', id: '' };
  });
  form.querySelector('[name=Jenis]').addEventListener('change', e => {
    const j = e.target.value, tpl = suratTemplate(j, $('#srtKe').value);
    ['Perihal', 'Isi'].forEach(f => { const i = form.querySelector(`[name=${f}]`); if (!i.value.trim() || (tplAwal && i.value === tplAwal[f])) i.value = tpl[f]; });
    tplAwal = tpl; $('#rcBox').hidden = !['SPH', 'RC'].includes(j);
  });
  const rcBody = $('#rcBody');
  rcBody.addEventListener('input', e => { if (['harga', 'kg', 'm3', 'min'].includes(e.target.dataset.rf)) formatMoneyInput(e.target); });
  rcBody.addEventListener('click', e => { const b = e.target.closest('[data-rcdel]'); if (b) b.closest('tr').remove(); });
  $('#rcAdd').onclick = () => rcBody.insertAdjacentHTML('beforeend', rcRowHTML({ satuan: 'per trip' }));
  $('#rcPick').onclick = () => pilihHarga(rows => rows.forEach(h => rcBody.insertAdjacentHTML('beforeend', rcRowHTML({ layanan: h.Layanan, asal: h.Asal, tujuan: h.Tujuan, armada: h.Armada, harga: h.Harga, satuan: h.Satuan, kg: h.HargaKg, m3: h.HargaM3, min: h.HargaMin, ket: h.Keterangan }))));
  const kumpul = () => {
    const v = formValues(form); if (edit) v.ID = x.ID; if (edit && x.NoSurat) v.Jenis = x.Jenis;
    v.KepadaNama = $('#srtKe').value.trim(); v.KepadaTipe = ke.tipe; v.KepadaID = ke.id;
    v.RateCard = $$('[data-rc]', rcBody).map(tr => { const o = {}; tr.querySelectorAll('[data-rf]').forEach(i => { o[i.dataset.rf] = ['harga', 'kg', 'm3', 'min'].includes(i.dataset.rf) ? num(i.value) : i.value.trim(); }); return o; }).filter(r => r.harga || r.kg || r.m3);
    if (!v.KepadaNama) { toast('warning', 'Isi tujuan surat (Kepada Yth.)'); return null; }
    if (!v.Perihal.trim()) { toast('warning', 'Isi perihal surat'); return null; }
    return v;
  };
  const simpan = (ajukan, btn) => {
    const v = kumpul(); if (!v) return;
    const go = () => { btnBusy(btn, true, 'Menyimpan…');
      api('saveSurat', S.token, v).then(r => { upsert('surat', r.data); saveCache(); return ajukan ? api('ajukanSurat', S.token, r.data.ID) : r; })
        .then(r => { upsert('surat', r.data); saveCache(); updateBadges(); ok(r.message); closeModal(); if (S.page === 'surat') renderSurat(); openSuratDetail(r.data.ID); }).catch(fail).finally(() => btnBusy(btn, false)); };
    if (!ajukan) return go();
    confirmDialog({ title: 'Konfirmasi & ajukan surat?', html: 'Surat akan mendapat <b>nomor resmi</b> dan dikirim ke Super Admin untuk disetujui. Setelah ini surat <b>tidak bisa dihapus</b>, hanya diarsipkan.', icon: 'bi-send', ok: 'Ya, ajukan' }).then(ok2 => { if (ok2 === true) go(); });
  };
  $('#srtDraft').onclick = e => simpan(false, e.currentTarget);
  $('#srtAjukan').onclick = e => simpan(true, e.currentTarget);
}
/** Pilih dari daftar harga. opt: { single, layanan, pelangganID } — di form order: harga Corporate pelanggan itu tampil paling atas, Corporate pelanggan lain disembunyikan. */
function pilihHarga(cb, opt) {
  opt = opt || {};
  const ctxPel = opt.pelangganID !== undefined;
  const list = (S.d.harga || []).filter(h => String(h.Aktif) !== 'false' && (!ctxPel || h.Kategori !== 'Corporate' || h.PelangganID === opt.pelangganID))
    .sort((a, b) => (hrgKorp(b, opt.pelangganID) - hrgKorp(a, opt.pelangganID)) || String(a.Layanan + a.Tujuan + a.Armada).localeCompare(String(b.Layanan + b.Tujuan + b.Armada)));
  if (!list.length) return toast('info', 'Daftar harga masih kosong', isSA() ? 'Isi dulu di menu Daftar Harga, atau centang "Simpan ke daftar harga" di form order.' : 'Centang "Simpan ke daftar harga" saat membuat order, atau minta Super Admin mengisi Daftar Harga.');
  const nKorp = ctxPel && opt.pelangganID ? list.filter(h => hrgKorp(h, opt.pelangganID)).length : 0;
  const box = document.createElement('div'); box.className = 'pick-overlay';
  box.innerHTML = `<div class="pick-box"><div class="card-title-row"><h3 style="margin:0">Pilih dari daftar harga</h3><button type="button" class="icon-btn" data-pclose aria-label="Tutup"><i class="bi bi-x-lg"></i></button></div>
    ${nKorp ? `<p class="muted" style="margin:6px 0 0"><i class="bi bi-building-check"></i> ${nKorp} harga khusus (Corporate) untuk pelanggan ini ditampilkan paling atas.</p>` : ''}
    <div class="pick-tools"><input class="input" id="pkQ" placeholder="Cari kota, armada, pelanggan…"><select class="input" id="pkLy">${crmOpts(HARGA_LAYANAN, opt.layanan || '', 'Semua layanan')}</select></div>
    <div class="pick-list">${list.map(h => `<label class="check-row pick-i${opt.single ? ' single' : ''}" data-ly="${esc(h.Layanan)}" data-k="${esc([h.Asal, h.Tujuan, h.Armada, h.Keterangan, h.PelangganNama, h.Marketing, h.Kategori].join(' ').toLowerCase())}">${opt.single ? `<input type="radio" name="pkOne" value="${esc(h.ID)}">` : `<input type="checkbox" value="${esc(h.ID)}">`}<span><b>${esc([h.Asal, h.Tujuan].filter(Boolean).join(' → ') || h.Armada)}</b> <span class="muted">${esc(h.Armada && (h.Asal || h.Tujuan) ? h.Armada + ' · ' : '')}${esc(h.Layanan)}</span><br>${hargaBadge(h)}</span><span class="mono" style="margin-left:auto;text-align:right">${hargaTeks(h, true)}</span></label>`).join('')}</div>
    <div class="pick-empty muted" hidden style="padding:14px 4px">Tidak ada harga yang cocok.</div>
    <div class="chips-row" style="justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-secondary" data-pclose>Batal</button><button type="button" class="btn btn-primary" id="pkOk">${opt.single ? 'Pakai harga ini' : 'Tambahkan'}</button></div></div>`;
  document.body.appendChild(box);
  const tutup = () => box.remove();
  box.querySelectorAll('[data-pclose]').forEach(b => b.onclick = tutup);
  box.addEventListener('click', e => { if (e.target === box) tutup(); });
  const saring = () => {
    const ly = box.querySelector('#pkLy').value, q = box.querySelector('#pkQ').value.trim().toLowerCase();
    let n = 0; box.querySelectorAll('.pick-i').forEach(i => { i.hidden = (!!ly && i.dataset.ly !== ly) || (!!q && !i.dataset.k.includes(q)); if (!i.hidden) n++; });
    box.querySelector('.pick-empty').hidden = n > 0;
  };
  box.querySelector('#pkLy').onchange = saring; box.querySelector('#pkQ').addEventListener('input', debounce(saring, 100)); saring();
  if (opt.single) box.querySelector('.pick-list').addEventListener('dblclick', e => { const i = e.target.closest('.pick-i'); if (i) box.querySelector('#pkOk').click(); });
  box.querySelector('#pkOk').onclick = () => {
    const ids = [...box.querySelectorAll('input:checked')].map(i => i.value);
    if (!ids.length) return toast('info', 'Pilih salah satu harga');
    cb(list.filter(h => ids.includes(h.ID))); tutup();
  };
}
const hrgKorp = (h, pid) => (h.Kategori === 'Corporate' && pid && h.PelangganID === pid ? 1 : 0);
function hargaBadge(h, singkat) {
  if (h.Kategori !== 'Corporate') return '<span class="badge b-slate plain">Reguler</span>';
  return `<span class="badge b-indigo plain"><i class="bi bi-building-check"></i> Corporate</span>${singkat ? '' : ` <small class="muted">${esc(h.PelangganNama || '')}${h.Marketing ? ' · Marketing ' + esc(h.Marketing) : ''}</small>`}`;
}
function tipePelBadge(p) { return p && p.Tipe === 'Corporate' ? '<span class="badge b-indigo plain">Corporate</span>' : ''; }

// ── Form order: pilih dari daftar harga & simpan ke daftar harga (Reguler) ──
const DH_LAYANAN = { sewa: 'Sewa Kendaraan', kirim: 'Pengiriman Mobil & Alat Berat', paket: 'Pengiriman Barang' };
function kotaDari(alamat) {
  const seg = String(alamat || '').split(/[,\n]/).map(x => x.replace(/\b\d{5}\b/g, '').trim()).filter(Boolean);
  return (seg[seg.length - 1] || '').replace(/^(kota|kab\.?|kabupaten)\s+/i, '').slice(0, 80);
}
function setupDaftarHargaBox(lay) {
  const form = FORMS[lay].el, box = form.querySelector('[data-dh]');
  const f = k => box.querySelector(`[data-dh-f="${k}"]`);
  box.addEventListener('input', e => { if (e.target.dataset.dhF === 'min') formatMoneyInput(e.target); e.target.classList.remove('invalid'); e.stopPropagation(); });
  box.addEventListener('change', e => e.stopPropagation());
  box.querySelector('[data-dh-save]').addEventListener('change', e => {
    box.querySelector('[data-dh-fields]').hidden = !e.target.checked;
    if (e.target.checked) dhIsiOtomatis(lay);
  });
  box.querySelector('[data-dh-pick]').onclick = () => {
    if (form.classList.contains('locked')) return;
    const pid = form.querySelector('[name=PelangganID]').value;
    pilihHarga(rows => dhPakai(lay, rows[0]), { single: true, layanan: DH_LAYANAN[lay], pelangganID: pid });
  };
  FORMS[lay].dhField = f;
}
function dhIsiOtomatis(lay) {
  const form = FORMS[lay].el, f = FORMS[lay].dhField, v = n => (form.querySelector(`[name="${n}"]`) || {}).value || '';
  const isi = (k, val) => { if (!f(k).value.trim() && val) f(k).value = val; };
  if (lay === 'sewa') { isi('asal', kotaDari(v('MuatAlamat'))); isi('tujuan', kotaDari(v('BongkarAlamat'))); isi('armada', v('JenisKendaraan')); }
  else if (lay === 'kirim') { const r = byId('penerima', v('PenerimaID')); isi('asal', kotaDari(v('AsalAlamat'))); isi('tujuan', (r && r.Kota) || kotaDari(r ? r.Alamat : '')); isi('armada', ((v('ModaAngkut') || 'Towing') === 'Dikendarai' ? 'Dikendarai' : 'Towing') + (v('JenisLayanan') ? ' · ' + v('JenisLayanan') : '')); }
  else { isi('asal', (S.settings && S.settings.kotaSurat) || kotaDari(v('PengirimAlamat'))); isi('tujuan', v('KotaTujuan')); isi('armada', 'Paket ' + (v('Jalur') || 'Darat').toLowerCase()); }
}
function dhPakai(lay, h) {
  if (!h) return;
  const st = FORMS[lay], form = st.el, q = n => form.querySelector(`[name="${n}"]`), f = st.dhField;
  if (lay === 'paket') {
    setMoney(q('TarifKg'), num(h.HargaKg) || ''); setMoney(q('TarifVolume'), num(h.HargaM3) || '');
    q('DasarTarif').value = num(h.HargaKg) ? 'kg' : 'volume';
    if (!q('KotaTujuan').value.trim() && h.Tujuan) q('KotaTujuan').value = h.Tujuan;
    if (num(h.HargaMin)) f('min').value = num(h.HargaMin).toLocaleString('id-ID');
  } else {
    setMoney(q('Harga'), num(h.Harga));
    if (lay === 'sewa' && JENIS_KENDARAAN.includes(h.Armada) && !q('JenisKendaraan').value) q('JenisKendaraan').value = h.Armada;
  }
  ['asal', 'tujuan', 'armada'].forEach(k => { f(k).value = h[{ asal: 'Asal', tujuan: 'Tujuan', armada: 'Armada' }[k]] || ''; });
  st.dhSrc = h;
  q('Harga').classList.remove('invalid');
  markDirty(lay); recalc(lay); dhInfo(lay);
  ok('Harga dipakai', [h.Asal, h.Tujuan].filter(Boolean).join(' → ') + ' · ' + hargaTeks(h));
}
function dhInfo(lay) {
  const st = FORMS[lay], el = st.el.querySelector('[data-dh-src]'), h = st.dhSrc;
  if (!h) { el.hidden = true; return; }
  const ongkos = num(st.el.querySelector('[name=Harga]').value), mn = num(h.HargaMin);
  el.hidden = false;
  el.innerHTML = `<i class="bi bi-tags"></i> Dari daftar harga: <b>${esc([h.Asal, h.Tujuan].filter(Boolean).join(' → ') || h.Armada)}</b> ${hargaBadge(h)}` +
    (lay === 'paket' && mn && ongkos && ongkos < mn ? `<div class="warn-line amber"><i class="bi bi-exclamation-triangle"></i> Ongkos ${rp(ongkos)} di bawah harga minimal ${rp(mn)} — tambahkan selisihnya di Penyesuaian tarif bila berlaku.</div>` : '');
}
function dhNilai(lay) {
  const st = FORMS[lay]; if (!st) return null;
  const box = st.el.querySelector('[data-dh]');
  if (!box || box.hidden || !box.querySelector('[data-dh-save]').checked) return null;
  const f = st.dhField;
  return { asal: f('asal').value.trim(), tujuan: f('tujuan').value.trim(), armada: f('armada').value.trim(), min: lay === 'paket' ? num(f('min').value) : 0 };
}
function dhReset(lay) {
  const st = FORMS[lay]; if (!st || !st.dhField) return;
  const box = st.el.querySelector('[data-dh]');
  box.hidden = st.el.classList.contains('locked');
  box.querySelector('[data-dh-save]').checked = false;
  box.querySelector('[data-dh-fields]').hidden = true;
  box.querySelectorAll('[data-dh-f]').forEach(i => { i.value = ''; i.classList.remove('invalid'); });
  st.dhSrc = null; dhInfo(lay);
}

// ── CRM: harga sepakat hasil negosiasi ──
function hargaSepakatHTML(l, boleh) {
  const rows = rcParse(l.HargaSepakat);
  return `<div class="hs-box"><div class="card-title-row"><h4 style="margin:0"><i class="bi bi-patch-check"></i> Harga sepakat</h4>${boleh ? `<button type="button" class="btn btn-secondary btn-sm" id="hsEdit"><i class="bi bi-pencil-square"></i> ${rows.length ? 'Ubah' : 'Isi harga'}</button>` : ''}</div>
    ${rows.length ? `<ul class="hs-list">${rows.map(r => `<li><span><b>${esc([r.asal, r.tujuan].filter(Boolean).join(' → ') || r.armada)}</b><small class="muted">${esc(r.armada && (r.asal || r.tujuan) ? r.armada + ' · ' : '')}${esc(r.layanan || l.Layanan)}</small></span><b class="mono">${hargaTeks(r)}</b></li>`).join('')}</ul>` : '<p class="muted" style="margin:6px 0 0">Belum ada. Catat harga hasil negosiasi di sini.</p>'}
    <small class="muted">${l.Tahap === 'Deal' ? 'Sudah masuk Daftar Harga sebagai harga <b>Corporate</b> pelanggan ini.' : 'Saat lead <b>Deal</b>, harga ini otomatis masuk Daftar Harga (Corporate) khusus pelanggan ini, dengan nama marketing.'}</small></div>`;
}
function openHargaSepakat(l) {
  const rows = rcParse(l.HargaSepakat);
  openModal({ title: 'Harga sepakat', sub: crmNama(l) + ' · ' + l.Kode, icon: 'bi-patch-check', size: 'lg',
    body: `<p class="muted" style="margin-top:0">Ambil dari daftar harga lalu ubah sesuai hasil negosiasi, atau tambah baris baru. Kirim paket: isi per kg / per m³ / minimal; layanan lain: harga + satuan.</p>
      <div class="chips-row" style="margin-bottom:8px"><button type="button" class="btn btn-secondary btn-sm" id="hsPick"><i class="bi bi-list-check"></i> Ambil dari daftar harga</button><button type="button" class="btn btn-ghost btn-sm" id="hsAdd"><i class="bi bi-plus-lg"></i> Baris</button></div>
      <div class="table-wrap rc-wrap"><table class="table rc-table"><thead><tr><th>Layanan</th><th>Asal</th><th>Tujuan</th><th>Armada / jenis</th><th>Harga (Rp)</th><th>Satuan</th><th>Per kg</th><th>Per m³</th><th>Minimal</th><th>Keterangan</th><th></th></tr></thead><tbody id="hsBody">${(rows.length ? rows : [{ layanan: l.Layanan, satuan: 'per trip' }]).map(rcRowHTML).join('')}</tbody></table></div>`,
    foot: `<button class="btn btn-secondary" id="hsBack">Batal</button><button class="btn btn-primary" id="hsSave"><i class="bi bi-check2"></i> Simpan harga sepakat</button>` });
  const body = $('#hsBody');
  body.addEventListener('input', e => { if (['harga', 'kg', 'm3', 'min'].includes(e.target.dataset.rf)) formatMoneyInput(e.target); });
  body.addEventListener('click', e => { const b = e.target.closest('[data-rcdel]'); if (b) b.closest('tr').remove(); });
  $('#hsAdd').onclick = () => body.insertAdjacentHTML('beforeend', rcRowHTML({ layanan: l.Layanan, satuan: 'per trip' }));
  $('#hsPick').onclick = () => pilihHarga(hs => {
    // buang baris kosong bawaan sebelum menambah
    $$('[data-rc]', body).forEach(tr => { if (![...tr.querySelectorAll('[data-rf]')].some(i => i.dataset.rf !== 'layanan' && i.dataset.rf !== 'satuan' && i.value.trim())) tr.remove(); });
    hs.forEach(h => body.insertAdjacentHTML('beforeend', rcRowHTML({ layanan: h.Layanan, asal: h.Asal, tujuan: h.Tujuan, armada: h.Armada, harga: h.Harga, satuan: h.Satuan, kg: h.HargaKg, m3: h.HargaM3, min: h.HargaMin, ket: h.Keterangan })));
  }, { layanan: l.Layanan, pelangganID: (crmPT(l.CompanyID) || {}).PelangganID || '' });
  $('#hsBack').onclick = () => openCrmLeadDetail(l.ID);
  $('#hsSave').onclick = () => {
    const data = $$('[data-rc]', body).map(tr => { const o = {}; tr.querySelectorAll('[data-rf]').forEach(i => { o[i.dataset.rf] = ['harga', 'kg', 'm3', 'min'].includes(i.dataset.rf) ? num(i.value) : i.value.trim(); }); return o; })
      .filter(r => r.harga || r.kg || r.m3 || r.tujuan || r.armada);
    const bad = data.find(r => !(r.tujuan || r.armada) || !(r.harga || r.kg || r.m3));
    if (bad) return toast('warning', 'Lengkapi baris harga', 'Setiap baris perlu tujuan/armada dan harga (atau per kg / per m³).');
    const b = $('#hsSave'); btnBusy(b, true, 'Menyimpan…');
    api('saveCrmLead', S.token, { ID: l.ID, HargaSepakat: data }).then(res => { crmApplyResult(res.data); ok(res.message || 'Harga sepakat tersimpan'); crmRerender(); openCrmLeadDetail(l.ID); }).catch(fail).finally(() => btnBusy(b, false));
  };
}

function suratHTML(x, forPdf) {
  const st = S.settings || {}, rc = rcParse(x.RateCard);
  const tglIndo = s => { const m = String(s).slice(0, 10).split('-'); return m.length === 3 ? Number(m[2]) + ' ' + BULAN_ID[Number(m[1]) - 1] + ' ' + m[0] : s; };
  const par = s => String(s || '').split(/\n\s*\n/).map(p => `<p style="margin:0 0 9px;text-align:justify;white-space:pre-wrap">${esc(p.trim())}</p>`).join('');
  const ok = x.DisetujuiPada && ['Disetujui', 'Diarsipkan'].includes(x.Status);
  let qr = '';
  if (ok) { try { qr = KgmQR.dataUrl([st.companyName || st.appName, 'Surat ' + x.NoSurat, 'Perihal: ' + x.Perihal, 'Disetujui: ' + x.DisetujuiNama + ' (' + (x.DisetujuiJabatan || '') + ')', 'Waktu: ' + x.DisetujuiPada + ' WIB', 'Kode verifikasi: ' + x.KodeVerifikasi].join('\n'), 300, 'M'); } catch (e) { qr = ''; } }
  const tabel = rc.length ? `<table class="t" style="margin:6px 0 12px;font-size:10px"><tr><th style="width:26px">No</th><th>Layanan</th><th>Rute</th><th>Armada / jenis</th><th class="num">Harga</th><th>Keterangan</th></tr>
    ${rc.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.layanan)}</td><td>${esc([r.asal, r.tujuan].filter(Boolean).join(' → '))}</td><td>${esc(r.armada)}</td><td class="num"><b>${hargaTeks(r, true)}</b></td><td>${esc(r.ket)}</td></tr>`).join('')}</table>` : '';
  const body = `<div class="sheet a4" style="font-size:11.5px;line-height:1.55">${kopHTML(st, true)}
    ${!ok ? '<div style="margin:10px 0;padding:6px 10px;border:1px dashed #B42318;color:#B42318;font-weight:700;text-align:center">DRAF — BELUM DISETUJUI, TIDAK UNTUK DIKIRIM</div>' : ''}
    <table style="margin-top:14px"><tr><td style="vertical-align:top"><table style="width:auto"><tr><td style="padding:1px 12px 1px 0">Nomor</td><td>: <b>${esc(x.NoSurat || '(belum bernomor)')}</b></td></tr>
      <tr><td style="padding:1px 12px 1px 0">Lampiran</td><td>: ${esc(x.Lampiran || '-')}</td></tr><tr><td style="padding:1px 12px 1px 0;vertical-align:top">Perihal</td><td>: <b>${esc(x.Perihal)}</b></td></tr></table></td>
      <td style="vertical-align:top;text-align:right;white-space:nowrap">${esc(st.kotaSurat || '')}${st.kotaSurat ? ', ' : ''}${tglIndo(x.Tanggal)}</td></tr></table>
    <div style="margin:22px 0 16px">Kepada Yth.<br><b>${esc(x.KepadaNama)}</b>${x.KepadaUP ? '<br>u.p. ' + esc(x.KepadaUP) : ''}${x.KepadaAlamat ? '<br>' + esc(x.KepadaAlamat).replace(/\n/g, '<br>') : ''}<br>di tempat</div>
    ${par(x.Isi)}${tabel}${par(x.Penutup)}
    <table style="margin-top:18px;width:auto;margin-left:auto"><tr><td style="text-align:center;min-width:220px">Hormat kami,<br>${esc(st.companyName || st.appName || '')}<br>
      ${qr ? `<img src="${qr}" width="92" height="92" style="width:92px;height:92px;margin:6px auto 2px;display:block">` : '<div style="height:80px"></div>'}
      <b><u>${esc(ok ? x.DisetujuiNama : '............................')}</u></b><br>${esc(ok ? x.DisetujuiJabatan || '' : '')}
      ${qr ? `<div style="font-size:8px;color:#64748B">Ditandatangani elektronik ${esc(x.DisetujuiPada)} WIB<br>Kode verifikasi ${esc(x.KodeVerifikasi)}</div>` : ''}</td></tr></table>
    ${x.Tembusan ? `<div style="margin-top:16px;font-size:10.5px">Tembusan:<br>${x.Tembusan.split(',').map((t, i) => (i + 1) + '. ' + esc(t.trim())).join('<br>')}</div>` : ''}
    ${docFooter('Dibuat oleh ' + esc(x.DibuatNama || '') + ' · ' + esc(x.NoSurat || ''))}</div>`;
  return docShell(x.NoSurat || x.Perihal, body, 'A4 portrait', forPdf);
}
function openSuratDetail(id) {
  const x = (S.d.surat || []).find(s => s.ID === id); if (!x) return;
  const pemilik = isSA() || x.DibuatOleh === S.me.email;
  const tombol = [];
  if (pemilik && ['Draft', 'Ditolak'].includes(x.Status)) tombol.push('<button class="btn btn-secondary" id="sdEdit"><i class="bi bi-pencil"></i> Ubah</button>', '<button class="btn btn-primary" id="sdAjukan"><i class="bi bi-send"></i> Konfirmasi & ajukan</button>');
  if (pemilik && x.Status === 'Draft' && !x.NoSurat) tombol.unshift('<button class="btn btn-ghost" id="sdDel" style="margin-right:auto;color:var(--red)"><i class="bi bi-trash"></i> Hapus draft</button>');
  if (isSA() && x.Status === 'Menunggu Persetujuan') tombol.push('<button class="btn btn-secondary" id="sdTolak" style="color:var(--red)"><i class="bi bi-x-lg"></i> Tolak</button>', '<button class="btn btn-primary" id="sdSetuju"><i class="bi bi-check2-circle"></i> Setujui & tanda tangani</button>');
  if (['Disetujui', 'Diarsipkan'].includes(x.Status) && x.DisetujuiPada) tombol.push('<button class="btn btn-primary" id="sdCetak"><i class="bi bi-printer"></i> Cetak / PDF</button>');
  if (pemilik && x.NoSurat && x.Status !== 'Diarsipkan') tombol.unshift('<button class="btn btn-ghost" id="sdArsip" style="margin-right:auto"><i class="bi bi-archive"></i> Arsipkan</button>');
  openModal({ title: x.NoSurat || 'Draft surat', sub: SURAT_JENIS[x.Jenis] + ' · ' + x.Perihal, icon: 'bi-envelope-paper', size: 'lg',
    body: `<div class="klh-top"><span class="badge ${SURAT_STATUS_CLS[x.Status]}">${esc(x.Status)}</span><span class="muted">Dibuat ${esc(x.DibuatNama || '')} · ${tglJam(x.DibuatPada)}</span>${x.DisetujuiPada ? `<span class="muted">· Disetujui ${esc(x.DisetujuiNama)} ${tglJam(x.DisetujuiPada)}</span>` : ''}</div>
      ${x.Status === 'Ditolak' ? `<div class="alert alert-warning"><i class="bi bi-arrow-return-left"></i><div><b>Dikembalikan:</b> ${esc(x.CatatanTolak)}</div></div>` : ''}
      ${x.Status === 'Menunggu Persetujuan' && !isSA() ? '<div class="alert alert-info"><i class="bi bi-hourglass-split"></i><div>Menunggu persetujuan Super Admin. Surat bisa dicetak setelah disetujui.</div></div>' : ''}
      <iframe class="srt-prev" id="sdPrev" title="Pratinjau surat"></iframe>`,
    foot: `<button class="btn btn-secondary" data-close>Tutup</button>${tombol.join('')}` });
  $('#sdPrev').srcdoc = suratHTML(x, false);
  const lanjut = (p, b) => { btnBusy(b, true); return p.then(r => { upsert('surat', r.data); saveCache(); updateBadges(); ok(r.message); if (S.page === 'surat') renderSurat(); openSuratDetail(id); }).catch(fail).finally(() => btnBusy(b, false)); };
  if ($('#sdEdit')) $('#sdEdit').onclick = () => openSuratForm(x);
  if ($('#sdDel')) $('#sdDel').onclick = () => confirmDialog({ title: 'Hapus draft?', variant: 'danger', icon: 'bi-trash', ok: 'Hapus' }).then(v => { if (v === true) api('deleteSurat', S.token, id).then(r => { removeFrom('surat', id); saveCache(); ok(r.message); closeModal(); renderSurat(); }).catch(fail); });
  if ($('#sdAjukan')) $('#sdAjukan').onclick = e => { const b = e.currentTarget; confirmDialog({ title: 'Konfirmasi & ajukan?', html: 'Surat mendapat nomor resmi dan tidak bisa dihapus lagi, hanya diarsipkan.', icon: 'bi-send', ok: 'Ya, ajukan' }).then(v => { if (v === true) lanjut(api('ajukanSurat', S.token, id), b); }); };
  if ($('#sdSetuju')) $('#sdSetuju').onclick = e => { const b = e.currentTarget; confirmDialog({ title: 'Setujui surat ' + x.NoSurat + '?', html: 'Tanda tangan QR atas nama <b>' + esc(S.me.nama) + '</b> akan tercetak di surat.', icon: 'bi-check2-circle', ok: 'Setujui' }).then(v => { if (v === true) lanjut(api('putuskanSurat', S.token, id, true, ''), b); }); };
  if ($('#sdTolak')) $('#sdTolak').onclick = () => {
    openModal({ title: 'Tolak ' + x.NoSurat, sub: 'Surat dikembalikan ke pembuat untuk diperbaiki', icon: 'bi-x-octagon', size: 'sm',
      body: '<label class="field"><span class="label req">Alasan / yang perlu diperbaiki</span><textarea class="input" id="sdAlasan" rows="3" maxlength="500"></textarea></label>',
      foot: '<button class="btn btn-secondary" id="sdBack">Batal</button><button class="btn btn-danger" id="sdTolakOk">Kembalikan</button>' });
    $('#sdBack').onclick = () => openSuratDetail(id);
    $('#sdTolakOk').onclick = e => { const a = $('#sdAlasan').value.trim(); if (!a) return toast('warning', 'Isi alasannya'); lanjut(api('putuskanSurat', S.token, id, false, a), e.currentTarget); };
  };
  if ($('#sdArsip')) $('#sdArsip').onclick = e => { const b = e.currentTarget; confirmDialog({ title: 'Arsipkan surat?', html: 'Surat tetap tersimpan dan bisa dilihat di filter <b>Arsip</b>.', icon: 'bi-archive', ok: 'Arsipkan' }).then(v => { if (v === true) lanjut(api('arsipSurat', S.token, id), b); }); };
  if ($('#sdCetak')) $('#sdCetak').onclick = () => { closeModal(); openPrint({ title: x.NoSurat, sub: x.Perihal + ' · A4', build: () => suratHTML(x, false), pdfBuild: () => suratHTML(x, true),
    onPrint: (v, html, pdf) => pdf ? api('suratPdf', S.token, id, html) : Promise.resolve() }); };
}

document.addEventListener('click', e => {
  const s = e.target.closest('[data-srt]'); if (s) { e.preventDefault(); openSuratDetail(s.dataset.srt); return; }
  const n = e.target.closest('[data-surat-new]'); if (n) openSuratForm(null, n.dataset.suratNew);
});


// ── 3.7: Ekspedisi rekanan (Towing / Paket darat-laut-udara-kereta) & cara kirim mobil ──
const EKSP_PAKET = ['Paket Darat', 'Paket Laut', 'Paket Udara', 'Paket Kereta'];
function ekspLayananList(v, baru) {
  const l = String(v || '').split(',').map(x => x.trim()).filter(Boolean);
  return l.length || baru ? l : EKSP_PAKET.slice(); // data lama tanpa layanan = rekanan paket
}
function ekspPunya(e, jenis) { return ekspLayananList(e && e.Layanan).some(x => x === jenis || x.startsWith(jenis + ' ')); }
function ekspLayananBadge(e) {
  const l = ekspLayananList(e.Layanan), pk = l.filter(x => x.startsWith('Paket ')).map(x => x.slice(6));
  return (l.includes('Towing') ? '<span class="badge b-amber plain">Towing</span> ' : '') + (pk.length ? `<span class="badge b-indigo plain">Paket ${esc(pk.join('/'))}</span>` : '');
}
function ekspTarifCls(l) { return (l.includes('Towing') ? 'tf-tw ' : '') + (l.some(x => x.startsWith('Paket ')) ? 'tf-pk' : ''); }
function bindLayananEksp(form) {
  const hid = form.querySelector('[name=Layanan]'), table = form.querySelector('[data-tf-table]');
  const sync = () => {
    const l = $$('[data-lyn]', form).filter(c => c.checked).map(c => c.dataset.lyn);
    hid.value = l.join(', ');
    if (table) { table.classList.toggle('tf-tw', l.includes('Towing')); table.classList.toggle('tf-pk', l.some(x => x.startsWith('Paket '))); }
  };
  form.addEventListener('change', e => { if (e.target.dataset.lyn !== undefined) sync(); });
}
const MODA_KODE = { 'Towing': 'tow', 'Dikendarai': 'drv', 'Towing rekanan': 'rek' };
function gantiModa(m) {
  const st = FORMS.kirim, form = st.el;
  form.querySelector('[name=ModaAngkut]').value = m;
  const kosong = sel => { const c = form.querySelector(`[data-combo="${sel}"]`); if (c) comboSet(c, ''); };
  if (m !== 'Towing') kosong('kendaraan');
  if (m === 'Towing rekanan') kosong('pengemudi'); else kosong('ekspTowing');
  markDirty('kirim'); updateWarnings('kirim'); recalc('kirim');
}
function syncModa() {
  const form = FORMS.kirim.el, moda = form.querySelector('[name=ModaAngkut]').value || 'Towing', kode = MODA_KODE[moda] || 'tow';
  const locked = form.classList.contains('locked');
  $$('[data-moda]', form).forEach(b => { b.classList.toggle('on', b.dataset.moda === moda); b.disabled = locked; });
  $$('[data-moda-show]', form).forEach(x => { x.hidden = !x.dataset.modaShow.split(' ').includes(kode); });
  const lbl = form.querySelector('[data-drv-label]'); if (lbl) { lbl.textContent = moda === 'Dikendarai' ? 'Sopir' : 'Pengemudi'; lbl.classList.toggle('req', moda === 'Dikendarai'); }
  const info = form.querySelector('[data-drv-info]'), d = byId('pengemudi', form.querySelector('[name=PengemudiID]').value);
  if (info) {
    info.hidden = !d;
    if (d) info.innerHTML = `<span><i class="bi bi-person-badge"></i> <b>${esc(d.Nama)}</b>${moda === 'Dikendarai' ? ' <span class="muted">· mengendarai mobil pelanggan</span>' : ''}</span>${d.NoHP ? `<a class="btn btn-secondary btn-sm" href="https://wa.me/${waNumber(d.NoHP)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> WA ${esc(d.NoHP)}</a>` : '<span class="muted">No. WA belum ada di Data Pengemudi</span>'}`;
  }
  if (kode === 'rek') updateEkspInfo('kirim');
}
/** Towing rekanan: estimasi hari (semua) + biaya per unit dan selisih (Super Admin saja). */
function towingEstimasiHTML(e) {
  const form = FORMS.kirim.el, r = byId('penerima', form.querySelector('[name=PenerimaID]').value);
  const kota = (r && r.Kota) || '';
  const t = cariTarifDi(tarifParse(e.Tarif), kota);
  const hari = t && t.hari ? `<div class="eksp-est-r"><span><i class="bi bi-clock-history"></i> Estimasi sampai${t.kota ? ' ' + esc(t.kota) : ''}</span><b>${esc(t.hari)} hari</b></div>` : '';
  if (!isSA()) return hari ? `<div class="eksp-est">${hari}</div>` : '';
  if (!t) return `<div class="eksp-est muted">${kota ? 'Tarif towing ke ' + esc(kota) + ' belum ada' : 'Pilih penerima (kota tujuan) untuk melihat tarif'} di rekanan ini.</div>`;
  const unit = num(t.unit), harga = num(form.querySelector('[name=Harga]').value);
  return `<div class="eksp-est"><div class="eksp-est-h"><i class="bi bi-calculator"></i> Biaya towing rekanan${t.kota ? ' · ' + esc(t.kota) : ' · tarif umum'}</div>
    <div class="eksp-est-r"><span>Per unit</span><b class="mono">${unit ? rp(unit) : '—'}</b></div>${hari}
    ${unit && harga ? `<div class="eksp-est-r"><span>Ongkos ke pelanggan − biaya rekanan</span><b class="mono ${harga - unit < 0 ? 't-red' : 't-green'}">${rp(harga - unit)}</b></div>` : ''}</div>`;
}
/** Teks cara pengiriman di surat jalan (nama rekanan tidak dicetak). */
function modaCetak(o) {
  const m = o.ModaAngkut || 'Towing';
  if (m === 'Dikendarai') return 'Dikendarai' + (o.PengemudiNama ? ' · ' + o.PengemudiNama : '') + (o.PengemudiHP ? ' (' + o.PengemudiHP + ')' : '');
  if (m === 'Towing rekanan') return 'Towing';
  return ['Towing', o.UnitNoPol, o.PengemudiNama].filter(Boolean).join(' · ');
}
// Penanda: js/app.js termuat sampai akhir
window.__KGM_JS_END = true;
