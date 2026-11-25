/**
 * Finance (Keuangan & Pajak) — backend Google Apps Script
 * Pasang di spreadsheet KHUSUS finance (bukan spreadsheet Prospek).
 * Login memakai akun aplikasi Prospek: token dicek ke server Prospek (finWho).
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Update berikutnya: Deploy → Manage deployments → Edit → Version: New version (URL tetap).
 */

// URL Web App aplikasi Prospek (yang berakhiran /exec)
const PROSPEK_API = 'https://script.google.com/macros/s/AKfycby80Xr7c6ia8q3aZcwWaJ0k2AmQ91hZjnDsQb4ICSZGAe3qvMR8HwylyE8oC1xnFInlfQ/exec';

const SH = { trx: 'Transaksi', rek: 'Rekening', pajak: 'Pajak', abaikan: 'Abaikan', set: 'Pengaturan' };
const F = {
  trx: [['id', 'ID'], ['tgl', 'Tanggal'], ['pt', 'PT'], ['jenis', 'Jenis (masuk / keluar / pindah)'], ['kat', 'Kategori'], ['rek', 'Rekening'], ['rekTo', 'Rekening Tujuan'],
    ['nominal', 'Nominal'], ['ket', 'Keterangan'], ['pihak', 'Klien / Vendor'], ['ref', 'Ref Prospek'], ['bukti', 'Bukti (link)'], ['dibuat', 'Dibuat'], ['oleh', 'Oleh'], ['diubah', 'Diubah']],
  rek: [['id', 'ID'], ['nama', 'Nama Rekening'], ['pt', 'PT'], ['bank', 'Bank'], ['norek', 'No Rekening'], ['saldoAwal', 'Saldo Awal'], ['tglAwal', 'Tanggal Saldo Awal'], ['alias', 'Nama di Prospek'], ['aktif', 'Aktif']],
  pajak: [['id', 'ID'], ['pt', 'PT'], ['masa', 'Masa (yyyy-MM)'], ['jenis', 'Jenis Pajak'], ['nominal', 'Nominal'], ['status', 'Status (belum / setor / beres / nihil)'], ['ntpn', 'NTPN / No Bukti'],
    ['tglSetor', 'Tanggal Setor'], ['tglLapor', 'Tanggal Lapor'], ['catatan', 'Catatan'], ['diubah', 'Diubah'], ['oleh', 'Oleh']],
  abaikan: [['ref', 'Ref Prospek'], ['oleh', 'Oleh'], ['tgl', 'Tanggal']]
};
const NUM = { nominal: 1, saldoAwal: 1 };
const TXT = { tgl: 1, tglAwal: 1, masa: 1, tglSetor: 1, tglLapor: 1, norek: 1, ntpn: 1, dibuat: 1, diubah: 1 };

const DEF_SET = {
  pts: [
    { n: 'Vorent', legal: '', match: 'vorent', pkp: true, pajak: ['PPh 21', 'PPh 23', 'PPh 4(2)', 'PPh 25', 'PPN'] },
    { n: 'Izinin', legal: '', match: 'izinin', pkp: true, pajak: ['PPh 21', 'PPh 23', 'PPh 4(2)', 'PPh 25', 'PPN'] },
    { n: 'Echoffice', legal: '', match: 'echoffice', pkp: true, pajak: ['PPh 21', 'PPh 23', 'PPh 4(2)', 'PPh 25', 'PPN'] }
  ],
  kat: [
    { n: 'Pendapatan jasa', j: 'masuk', lr: true }, { n: 'Pendapatan lain', j: 'masuk', lr: true },
    { n: 'Setoran modal', j: 'masuk', lr: false }, { n: 'Pinjaman diterima', j: 'masuk', lr: false },
    { n: 'Gaji & tunjangan', j: 'keluar', lr: true }, { n: 'Sewa', j: 'keluar', lr: true }, { n: 'Iklan', j: 'keluar', lr: true },
    { n: 'Notaris / biaya klien', j: 'keluar', lr: true }, { n: 'Operasional', j: 'keluar', lr: true }, { n: 'Pajak', j: 'keluar', lr: true },
    { n: 'Biaya bank', j: 'keluar', lr: true }, { n: 'Lainnya', j: 'keluar', lr: true },
    { n: 'Prive / dividen', j: 'keluar', lr: false }, { n: 'Bayar pinjaman', j: 'keluar', lr: false }
  ],
  mulai: ''   // masa pajak pertama yang dicatat (yyyy-MM)
};

function doGet() { return ContentService.createTextOutput('Finance API aktif'); }

function doPost(e) {
  let out;
  try {
    const q = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = { ok: true, data: route_(q) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route_(q) {
  if (q.action === 'version') return ver_();
  ensure_();
  switch (q.action) {
    case 'getAll': return getAll(q.token);
    case 'save': return save(q.token, q.kind, q.rec);
    case 'del': return del(q.token, q.kind, q.id);
    case 'saveSettings': return saveSettings(q.token, q.settings);
    case 'prospekIn': return prospekIn(q.token, q.from);
    case 'abaikan': return abaikan(q.token, q.ref, q.undo);
    case 'upload': return upload(q.token, q.name, q.mime, q.data);
  }
  throw new Error('UNKNOWN');
}

/* ---------------- dasar ---------------- */
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function norm_(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
function ver_() { return PropertiesService.getScriptProperties().getProperty('VER') || '0'; }
function bump_() { const v = String(Date.now()); PropertiesService.getScriptProperties().setProperty('VER', v); return v; }
function uid_() { return Utilities.getUuid().slice(0, 8) + Date.now().toString(36); }
function today_() { return Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd'); }

function ensure_() {
  const props = PropertiesService.getScriptProperties();
  const sig = Object.keys(F).map(k => F[k].map(f => f[0]).join(',')).join('|');
  if (props.getProperty('SIG') === sig) return;
  const ss = ss_();
  Object.keys(F).forEach(k => {
    let sh = ss.getSheetByName(SH[k]);
    if (!sh) sh = ss.insertSheet(SH[k]);
    const head = F[k].map(f => f[1]);
    const cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    // kolom baru ditambahkan di kanan; kolom lama tidak dipindah
    if (!cur.length || !cur.some(String)) sh.getRange(1, 1, 1, head.length).setValues([head]);
    else head.forEach(h => { if (cur.indexOf(h) < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue(h); } });
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#eef0fb');
    sh.setFrozenRows(1);
  });
  let st = ss.getSheetByName(SH.set);
  if (!st) {
    st = ss.insertSheet(SH.set);
    // pajak mulai dicatat dari masa bulan lalu (masa sebelum itu tidak ditagih di kalender)
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    const mulai = Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), 'yyyy-MM');
    st.getRange(1, 1, 4, 2).setValues([['Kunci', 'Nilai (jangan diubah manual kalau tidak paham)'], ['pts', JSON.stringify(DEF_SET.pts)], ['kat', JSON.stringify(DEF_SET.kat)], ['mulai', JSON.stringify(mulai)]]);
    st.getRange(1, 1, 1, 2).setFontWeight('bold');
  }
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  props.setProperty('SIG', sig);
}

// baca sheet → array objek, kolom dicari dari judul (aman kalau urutan kolom diubah)
function read_(k) {
  const sh = ss_().getSheetByName(SH[k]), last = sh.getLastRow(), nc = sh.getLastColumn();
  if (last < 2) return [];
  const tz = ss_().getSpreadsheetTimeZone();
  const head = sh.getRange(1, 1, 1, nc).getValues()[0].map(String);
  const idx = F[k].map(f => head.indexOf(f[1]));
  return sh.getRange(2, 1, last - 1, nc).getValues().map((r, i) => {
    const o = { _row: i + 2 };
    F[k].forEach((f, j) => {
      let v = idx[j] >= 0 ? r[idx[j]] : '';
      if (v instanceof Date) v = Utilities.formatDate(v, tz, f[0] === 'masa' ? 'yyyy-MM' : 'yyyy-MM-dd');
      if (NUM[f[0]]) v = Number(v) || 0; else v = v == null ? '' : String(v);
      o[f[0]] = v;
    });
    return o;
  }).filter(o => o[F[k][0][0]]);
}

function write_(k, o, row) {
  const sh = ss_().getSheetByName(SH[k]), nc = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, nc).getValues()[0].map(String);
  const r = row || sh.getLastRow() + 1;
  const cur = row ? sh.getRange(r, 1, 1, nc).getValues()[0] : new Array(nc).fill('');
  F[k].forEach(f => { const i = head.indexOf(f[1]); if (i >= 0 && o[f[0]] !== undefined) cur[i] = o[f[0]]; });
  const rg = sh.getRange(r, 1, 1, nc);
  // kolom teks (tanggal, no rekening, NTPN) disimpan sebagai teks agar tidak diubah format oleh Sheets
  F[k].forEach(f => { if (TXT[f[0]]) { const i = head.indexOf(f[1]); if (i >= 0) sh.getRange(r, i + 1).setNumberFormat('@'); } });
  rg.setValues([cur]);
  return r;
}

function readSet_() {
  const sh = ss_().getSheetByName(SH.set), o = JSON.parse(JSON.stringify(DEF_SET));
  if (!sh || sh.getLastRow() < 2) return o;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    const k = String(r[0]).trim();
    if (k in o) { try { const v = JSON.parse(r[1]); if (Array.isArray(o[k]) ? (Array.isArray(v) && v.length) : typeof v === typeof o[k]) o[k] = v; } catch (e) {} }
  });
  return o;
}

/* ---------------- login (lewat Prospek) ---------------- */
// siapa pengguna ini & aksesnya (dicek ke Prospek, disimpan sementara 2 menit)
function who_(token) {
  if (!token) throw new Error('AUTH');
  const c = CacheService.getScriptCache(), key = 'W_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  const hit = c.get(key);
  if (hit) return JSON.parse(hit);
  const j = prospek_('finWho', token, {});
  c.put(key, JSON.stringify(j), 120);
  return j;
}

function prospek_(action, token, extra) {
  const res = UrlFetchApp.fetch(PROSPEK_API, {
    method: 'post', contentType: 'text/plain;charset=utf-8', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify(Object.assign({ action: action, token: token }, extra || {}))
  });
  let j;
  try { j = JSON.parse(res.getContentText()); } catch (e) { throw new Error('Server Prospek tidak bisa dihubungi'); }
  if (!j.ok) {
    if (['AUTH', 'NOFIN', 'FINLOCK'].indexOf(j.error) >= 0 || /^(BAD|LOCK):/.test(j.error)) throw new Error(j.error);
    if (j.error === 'UNKNOWN') throw new Error('Code.gs Prospek belum versi terbaru (perlu fitur Finance). Deploy ulang Code.gs Prospek.');
    throw new Error(j.error || 'Gagal menghubungi Prospek');
  }
  return j.data;
}

const canPt_ = (u, pt) => !u.finPt || norm_(u.finPt) === norm_(pt);
function writer_(u, pt) {
  if (u.fin !== 'kelola') throw new Error('Akun ini hanya bisa melihat data Finance');
  if (pt !== undefined && !canPt_(u, pt)) throw new Error('Tidak punya akses ke PT ' + pt);
}

/* ---------------- API ---------------- */

function getAll(token) {
  const u = who_(token), set = readSet_();
  const f = o => canPt_(u, o.pt);
  const strip = o => { delete o._row; return o; };
  if (u.finPt) set.pts = set.pts.filter(p => norm_(p.n) === norm_(u.finPt));
  return {
    user: u, settings: set,
    trx: read_('trx').filter(f).map(strip),
    rek: read_('rek').filter(f).map(strip),
    pajak: read_('pajak').filter(f).map(strip),
    ver: ver_()
  };
}

function clean_(kind, r, set) {
  const o = {};
  F[kind].forEach(f => { if (r[f[0]] !== undefined && f[0] !== 'oleh' && f[0] !== 'dibuat' && f[0] !== 'diubah') o[f[0]] = NUM[f[0]] ? (Number(r[f[0]]) || 0) : String(r[f[0]] == null ? '' : r[f[0]]).slice(0, 2000); });
  if (!set.pts.some(p => p.n === o.pt)) throw new Error('PT tidak dikenal: ' + o.pt);
  if (kind === 'trx') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.tgl)) throw new Error('Tanggal tidak valid');
    if (['masuk', 'keluar', 'pindah'].indexOf(o.jenis) < 0) throw new Error('Jenis transaksi tidak valid');
    if (!(o.nominal > 0)) throw new Error('Nominal harus lebih dari 0');
    if (!o.rek) throw new Error('Pilih rekening');
    if (o.jenis === 'pindah' && (!o.rekTo || o.rekTo === o.rek)) throw new Error('Pilih rekening tujuan yang berbeda');
  }
  if (kind === 'rek' && !o.nama) throw new Error('Nama rekening wajib diisi');
  if (kind === 'pajak') {
    if (!/^\d{4}-\d{2}$/.test(o.masa) || !o.jenis) throw new Error('Data pajak tidak valid');
    o.id = o.pt + '|' + o.masa + '|' + o.jenis;
  }
  return o;
}

function save(token, kind, rec) {
  const u = who_(token);
  if (!F[kind] || kind === 'abaikan') throw new Error('Data tidak valid');
  const set = readSet_(), o = clean_(kind, rec || {}, set);
  writer_(u, o.pt);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const all = read_(kind);
    if (kind === 'trx' && o.ref) {
      const dup = all.find(x => x.ref === o.ref && x.id !== o.id);
      if (dup) throw new Error('Pembayaran ini sudah dicatat (' + dup.tgl + ')');
    }
    const old = o.id ? all.find(x => x.id === o.id) : null;
    if (old && !canPt_(u, old.pt)) throw new Error('Tidak punya akses ke data ini');
    if (!o.id) o.id = uid_();
    const now = new Date().toISOString();
    if (kind === 'trx') { if (!old) { o.dibuat = now; } o.oleh = u.name; o.diubah = now; }
    if (kind === 'pajak') { o.oleh = u.name; o.diubah = now; }
    write_(kind, o, old ? old._row : 0);
    const out = Object.assign({}, old || {}, o); delete out._row;
    return { rec: out, ver: bump_() };
  } finally { lock.releaseLock(); }
}

function del(token, kind, id) {
  const u = who_(token);
  if (!F[kind] || kind === 'abaikan') throw new Error('Data tidak valid');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const old = read_(kind).find(x => x.id === id);
    if (!old) return { ver: ver_() };
    writer_(u, old.pt);
    if (kind === 'rek' && read_('trx').some(t => t.rek === id || t.rekTo === id)) throw new Error('Rekening sudah dipakai transaksi. Nonaktifkan saja.');
    ss_().getSheetByName(SH[kind]).deleteRow(old._row);
    return { ver: bump_() };
  } finally { lock.releaseLock(); }
}

function saveSettings(token, s) {
  const u = who_(token);
  writer_(u);
  if (u.finPt) throw new Error('Pengaturan hanya untuk akun Finance semua PT');
  const cur = readSet_();
  const pts = Array.isArray(s && s.pts) ? s.pts.filter(p => p && String(p.n || '').trim()).map(p => ({
    n: String(p.n).trim().slice(0, 40), legal: String(p.legal || '').slice(0, 120), match: String(p.match || p.n).trim().toLowerCase().slice(0, 80),
    npwp: String(p.npwp || '').slice(0, 30), pkp: !!p.pkp, pajak: Array.isArray(p.pajak) ? p.pajak.map(String).slice(0, 12) : []
  })) : cur.pts;
  const kat = Array.isArray(s && s.kat) ? s.kat.filter(k => k && String(k.n || '').trim() && (k.j === 'masuk' || k.j === 'keluar')).map(k => ({ n: String(k.n).trim().slice(0, 50), j: k.j, lr: k.lr !== false })) : cur.kat;
  const mulai = /^\d{4}-\d{2}$/.test(String(s && s.mulai)) ? s.mulai : cur.mulai;
  if (!pts.length) throw new Error('Minimal 1 PT');
  const sh = ss_().getSheetByName(SH.set);
  sh.getRange(2, 1, 3, 2).setValues([['pts', JSON.stringify(pts)], ['kat', JSON.stringify(kat)], ['mulai', JSON.stringify(mulai)]]);
  return { settings: { pts: pts, kat: kat, mulai: mulai }, ver: bump_() };
}

// Pembayaran klien dari Prospek yang belum dicatat / belum diabaikan
function prospekIn(token, from) {
  const u = who_(token), set = readSet_();
  const list = prospek_('finPayments', token, { from: from || '' });
  const done = {};
  read_('trx').forEach(t => { if (t.ref) done[t.ref] = 1; });
  read_('abaikan').forEach(a => { done[a.ref] = 1; });
  return list.filter(p => !done[p.ref]).map(p => {
    const s = norm_(p.brand + ' ' + p.invBrand);
    const pt = set.pts.find(x => String(x.match || x.n).toLowerCase().split(',').map(m => m.trim()).filter(Boolean).some(m => s.indexOf(m) >= 0));
    p.pt = pt ? pt.n : '';
    return p;
  }).filter(p => !p.pt || canPt_(u, p.pt));
}

function abaikan(token, ref, undo) {
  const u = who_(token); writer_(u);
  if (!ref) throw new Error('Data tidak valid');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const all = read_('abaikan'), ex = all.find(a => a.ref === ref);
    if (undo) { if (ex) ss_().getSheetByName(SH.abaikan).deleteRow(ex._row); }
    else if (!ex) write_('abaikan', { ref: ref, oleh: u.name, tgl: today_() }, 0);
    return { ver: bump_() };
  } finally { lock.releaseLock(); }
}

// Foto nota / bukti transfer → Google Drive (folder "Finance - Bukti Transaksi"), link bisa dibuka siapa pun yang punya link
function upload(token, name, mime, data) {
  const u = who_(token); writer_(u);
  if (!/^image\/|^application\/pdf$/.test(String(mime || ''))) throw new Error('Hanya foto atau PDF');
  const bytes = Utilities.base64Decode(String(data || ''));
  if (bytes.length > 8 * 1024 * 1024) throw new Error('File terlalu besar (maks 8 MB)');
  const props = PropertiesService.getScriptProperties();
  let folder;
  try { folder = DriveApp.getFolderById(props.getProperty('FOLDER') || 'x'); } catch (e) {
    folder = DriveApp.createFolder('Finance - Bukti Transaksi'); props.setProperty('FOLDER', folder.getId());
  }
  const f = folder.createFile(Utilities.newBlob(bytes, mime, String(name || 'bukti').slice(0, 80)));
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: f.getUrl() };
}

// Jalankan sekali dari editor untuk memberi izin (Drive, UrlFetch) dan menyiapkan sheet
function setup() {
  ensure_();
  DriveApp.getRootFolder();
  UrlFetchApp.fetch(PROSPEK_API + '?ping=1', { muteHttpExceptions: true });
  SpreadsheetApp.getUi && Logger.log('Siap. Sheet: ' + ss_().getSheets().map(s => s.getName()).join(', '));
}
