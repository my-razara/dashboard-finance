/**
 * Finance (Akuntansi & Pajak) — backend Google Apps Script
 * Pasang di spreadsheet KHUSUS finance (bukan spreadsheet Prospek).
 * Login memakai akun aplikasi Prospek: token dicek ke server Prospek (finWho). Data keuangan TIDAK diambil dari Prospek.
 *
 * Pembukuan double-entry: setiap dokumen (penjualan, penerimaan, pembelian, pembayaran, kas, pindah dana, jurnal umum)
 * disimpan di sheet "Dokumen"; jurnal debit/kredit dibentuk dari dokumen itu oleh aplikasi.
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Update berikutnya: Deploy → Manage deployments → Edit → Version: New version (URL tetap).
 */

// URL Web App aplikasi Prospek (yang berakhiran /exec) — hanya untuk cek login & akses
const PROSPEK_API = 'https://script.google.com/macros/s/AKfycby80Xr7c6ia8q3aZcwWaJ0k2AmQ91hZjnDsQb4ICSZGAe3qvMR8HwylyE8oC1xnFInlfQ/exec';

const SH = { akun: 'Akun', kontak: 'Kontak', jasa: 'Jasa', rek: 'Rekening', dok: 'Dokumen', pajak: 'Pajak', set: 'Pengaturan', trx: 'Transaksi', cat: 'Catatan' };
const F = {
  akun: [['kode', 'Kode'], ['nama', 'Nama Akun'], ['jenis', 'Jenis'], ['normal', 'Saldo Normal (D/K)'], ['grup', 'Kelompok'], ['sys', 'Akun Sistem'], ['aktif', 'Aktif']],
  kontak: [['id', 'ID'], ['tipe', 'Tipe'], ['nama', 'Nama'], ['pic', 'Kontak / Jabatan'], ['wa', 'WhatsApp'], ['email', 'Email'], ['npwp', 'NPWP'], ['alamat', 'Alamat'],
    ['pt', 'PT'], ['termin', 'Termin (hari)'], ['pajak', 'Status Pajak'], ['ket', 'Catatan'], ['aktif', 'Aktif'], ['data', 'Rincian (JSON)']],
  jasa: [['id', 'ID'], ['nama', 'Nama Jasa'], ['akun', 'Akun Pendapatan'], ['harga', 'Harga Standar'], ['pt', 'PT'], ['aktif', 'Aktif']],
  rek: [['id', 'ID'], ['nama', 'Nama Rekening'], ['pt', 'PT'], ['bank', 'Bank'], ['norek', 'No Rekening'], ['saldoAwal', 'Saldo Awal'], ['tglAwal', 'Tanggal Saldo Awal'],
    ['alias', 'Nama di Prospek'], ['aktif', 'Aktif'], ['akun', 'Akun COA'], ['tipe', 'Jenis (bank / kas)']],
  dok: [['id', 'ID'], ['jenis', 'Jenis'], ['pt', 'PT'], ['no', 'Nomor'], ['tgl', 'Tanggal'], ['jt', 'Jatuh Tempo'], ['kontak', 'Kontak'], ['proyek', 'Proyek'],
    ['ket', 'Keterangan'], ['total', 'Total'], ['data', 'Rincian (JSON)'], ['bukti', 'Bukti (link)'], ['oleh', 'Oleh'], ['dibuat', 'Dibuat'], ['diubah', 'Diubah']],
  pajak: [['id', 'ID'], ['pt', 'PT'], ['masa', 'Masa (yyyy-MM)'], ['jenis', 'Jenis Pajak'], ['nominal', 'Nominal'], ['status', 'Status (belum / setor / beres / nihil)'], ['ntpn', 'NTPN / No Bukti'],
    ['tglSetor', 'Tanggal Setor'], ['tglLapor', 'Tanggal Lapor'], ['catatan', 'Catatan'], ['diubah', 'Diubah'], ['oleh', 'Oleh']],
  // catatan per PT: checklist tutup buku, CALK, perhitungan PPh Badan (disimpan per baris supaya tidak melebihi batas 1 sel)
  cat: [['kunci', 'Kunci'], ['data', 'Isi (JSON)'], ['oleh', 'Oleh'], ['diubah', 'Diubah']],
  // versi lama (dipindah otomatis ke Dokumen), tidak dibuat untuk pemasangan baru
  trx: [['id', 'ID'], ['tgl', 'Tanggal'], ['pt', 'PT'], ['jenis', 'Jenis (masuk / keluar / pindah)'], ['kat', 'Kategori'], ['rek', 'Rekening'], ['rekTo', 'Rekening Tujuan'],
    ['nominal', 'Nominal'], ['ket', 'Keterangan'], ['pihak', 'Klien / Vendor'], ['ref', 'Ref Prospek'], ['bukti', 'Bukti (link)'], ['dibuat', 'Dibuat'], ['oleh', 'Oleh'], ['diubah', 'Diubah']]
};
const LEGACY = { trx: 1 };
const KEY = { akun: 'kode', cat: 'kunci' };
const NUM = { nominal: 1, saldoAwal: 1, harga: 1, total: 1, termin: 1 };
const TXT = { kunci: 1, kode: 1, tgl: 1, jt: 1, tglAwal: 1, masa: 1, tglSetor: 1, tglLapor: 1, norek: 1, ntpn: 1, npwp: 1, wa: 1, no: 1, dibuat: 1, diubah: 1, data: 1 };
const DOK_JENIS = ['jual', 'terima', 'beli', 'bayar', 'kas', 'pindah', 'jurnal', 'gaji', 'aset', 'susut'];
const AKUN_JENIS = ['aset', 'kewajiban', 'ekuitas', 'pendapatan', 'hpp', 'beban', 'lain_p', 'lain_b', 'pajak'];

// Daftar akun standar perusahaan jasa (bisa diubah tim finance). sys = dipakai jurnal otomatis, tidak bisa dihapus.
const DEF_COA = [
  ['1-1301', 'Piutang Usaha', 'aset', 'D', 'Piutang', 1], ['1-1302', 'Piutang Antar Perusahaan', 'aset', 'D', 'Piutang', 0],
  ['1-1401', 'Uang Muka Pembelian', 'aset', 'D', 'Uang Muka & Dibayar di Muka', 0], ['1-1402', 'Kasbon Karyawan', 'aset', 'D', 'Uang Muka & Dibayar di Muka', 0],
  ['1-1403', 'Biaya Dibayar di Muka', 'aset', 'D', 'Uang Muka & Dibayar di Muka', 0],
  ['1-1501', 'PPN Masukan', 'aset', 'D', 'Pajak Dibayar di Muka', 1], ['1-1502', 'PPh 23 Dibayar di Muka', 'aset', 'D', 'Pajak Dibayar di Muka', 1],
  ['1-1503', 'PPh 25 Dibayar di Muka', 'aset', 'D', 'Pajak Dibayar di Muka', 1],
  ['1-2101', 'Peralatan Kantor', 'aset', 'D', 'Aset Tetap', 0], ['1-2102', 'Kendaraan', 'aset', 'D', 'Aset Tetap', 0], ['1-2103', 'Bangunan & Renovasi', 'aset', 'D', 'Aset Tetap', 0],
  ['1-2901', 'Akumulasi Penyusutan', 'aset', 'K', 'Aset Tetap', 0],
  ['2-1101', 'Utang Usaha', 'kewajiban', 'K', 'Utang Usaha', 1], ['2-1102', 'Utang Antar Perusahaan', 'kewajiban', 'K', 'Utang Usaha', 0],
  ['2-1103', 'Utang Komisi Agen & Sales', 'kewajiban', 'K', 'Utang Usaha', 0],
  ['2-1201', 'Pendapatan Diterima di Muka (DP Klien)', 'kewajiban', 'K', 'Uang Muka Pelanggan', 1],
  ['2-1301', 'Utang PPN Keluaran', 'kewajiban', 'K', 'Utang Pajak', 1], ['2-1302', 'Utang PPh 21', 'kewajiban', 'K', 'Utang Pajak', 1],
  ['2-1303', 'Utang PPh 23/26', 'kewajiban', 'K', 'Utang Pajak', 1], ['2-1304', 'Utang PPh 4(2)', 'kewajiban', 'K', 'Utang Pajak', 1],
  ['2-1305', 'Utang PPh Badan', 'kewajiban', 'K', 'Utang Pajak', 0],
  ['2-1401', 'Biaya Masih Harus Dibayar', 'kewajiban', 'K', 'Kewajiban Lain', 0], ['2-1402', 'Utang Gaji', 'kewajiban', 'K', 'Kewajiban Lain', 0],
  ['2-1403', 'Utang BPJS', 'kewajiban', 'K', 'Kewajiban Lain', 0], ['2-2001', 'Utang Pinjaman', 'kewajiban', 'K', 'Kewajiban Jangka Panjang', 0],
  ['3-1001', 'Modal Disetor', 'ekuitas', 'K', 'Modal', 1], ['3-2001', 'Laba Ditahan', 'ekuitas', 'K', 'Saldo Laba', 1],
  ['3-3001', 'Prive / Dividen', 'ekuitas', 'D', 'Saldo Laba', 0], ['3-9001', 'Ekuitas Saldo Awal (sementara)', 'ekuitas', 'K', 'Modal', 0],
  ['4-1001', 'Pendapatan Jasa Pendirian', 'pendapatan', 'K', 'Pendapatan Usaha', 0], ['4-1002', 'Pendapatan Jasa Perubahan', 'pendapatan', 'K', 'Pendapatan Usaha', 0],
  ['4-1003', 'Pendapatan Jasa Perizinan', 'pendapatan', 'K', 'Pendapatan Usaha', 0], ['4-1004', 'Pendapatan Virtual Office', 'pendapatan', 'K', 'Pendapatan Usaha', 0],
  ['4-1005', 'Pendapatan Jasa Konsultasi & Pajak', 'pendapatan', 'K', 'Pendapatan Usaha', 0], ['4-1099', 'Pendapatan Jasa Lainnya', 'pendapatan', 'K', 'Pendapatan Usaha', 1],
  ['4-1901', 'Diskon Penjualan', 'pendapatan', 'D', 'Pendapatan Usaha', 0],
  ['5-1001', 'Biaya Notaris', 'hpp', 'D', 'Beban Pokok Jasa', 0], ['5-1002', 'Biaya PNBP & Instansi', 'hpp', 'D', 'Beban Pokok Jasa', 0],
  ['5-1003', 'Komisi Agen', 'hpp', 'D', 'Beban Pokok Jasa', 0], ['5-1004', 'Komisi Sales', 'hpp', 'D', 'Beban Pokok Jasa', 0],
  ['5-1005', 'Biaya Ruang / Mitra Virtual Office', 'hpp', 'D', 'Beban Pokok Jasa', 0], ['5-1099', 'Beban Pokok Lainnya', 'hpp', 'D', 'Beban Pokok Jasa', 0],
  ['6-1001', 'Beban Gaji & Tunjangan', 'beban', 'D', 'Beban Karyawan', 0], ['6-1002', 'Beban BPJS', 'beban', 'D', 'Beban Karyawan', 0],
  ['6-1003', 'Beban THR & Bonus', 'beban', 'D', 'Beban Karyawan', 0],
  ['6-1101', 'Beban Iklan & Pemasaran', 'beban', 'D', 'Beban Pemasaran', 0],
  ['6-1201', 'Beban Sewa Kantor', 'beban', 'D', 'Beban Umum & Administrasi', 0], ['6-1301', 'Beban Listrik, Internet & Telepon', 'beban', 'D', 'Beban Umum & Administrasi', 0],
  ['6-1302', 'Beban ATK & Perlengkapan', 'beban', 'D', 'Beban Umum & Administrasi', 0], ['6-1303', 'Beban Transportasi', 'beban', 'D', 'Beban Umum & Administrasi', 0],
  ['6-1304', 'Beban Konsumsi', 'beban', 'D', 'Beban Umum & Administrasi', 0], ['6-1305', 'Beban Software & Langganan', 'beban', 'D', 'Beban Umum & Administrasi', 0],
  ['6-1401', 'Beban Administrasi Bank', 'beban', 'D', 'Beban Umum & Administrasi', 1], ['6-1501', 'Beban Penyusutan', 'beban', 'D', 'Beban Umum & Administrasi', 0],
  ['6-1601', 'Beban Jasa Profesional', 'beban', 'D', 'Beban Umum & Administrasi', 0], ['6-1901', 'Beban Pajak & Perizinan', 'beban', 'D', 'Beban Umum & Administrasi', 0],
  ['6-1999', 'Beban Lain-lain', 'beban', 'D', 'Beban Umum & Administrasi', 1],
  ['7-1001', 'Pendapatan Bunga / Jasa Giro', 'lain_p', 'K', 'Pendapatan Lain', 0], ['7-1002', 'Pendapatan Lain-lain', 'lain_p', 'K', 'Pendapatan Lain', 0],
  ['7-2001', 'Beban Bunga Pinjaman', 'lain_b', 'D', 'Beban Lain', 0], ['7-2002', 'Pajak atas Bunga Bank', 'lain_b', 'D', 'Beban Lain', 0],
  ['8-1001', 'Beban PPh Badan', 'pajak', 'D', 'Pajak Penghasilan', 0]
];

const PJ_DEF = ['PPh 21', 'PPh 23', 'PPh 4(2)', 'PPh 25', 'PPN'];
const DEF_SET = {
  pts: [
    { n: 'Vorent', legal: '', bentuk: 'PT', npwp: '', alamat: '', berdiri: '', pkp: true, pkpSejak: '', prefix: 'VOI', pajak: PJ_DEF },
    { n: 'Izinin', legal: '', bentuk: 'PT', npwp: '', alamat: '', berdiri: '', pkp: true, pkpSejak: '', prefix: 'IZN', pajak: PJ_DEF },
    { n: 'Echoffice', legal: '', bentuk: 'PT', npwp: '', alamat: '', berdiri: '', pkp: true, pkpSejak: '', prefix: 'ECO', pajak: PJ_DEF }
  ],
  kebijakan: { pendapatan: 'invoice', asetMin: 2500000, susut: 'garis lurus', ppn: 12, dpp: '11/12' },
  aturan: [],   // aturan import rekening koran: [{ kata, akun }]
  // tarif BPJS (persen) & batas upah; bisa diubah di Data Induk
  payroll: { kesP: 4, kesK: 1, kesMax: 12000000, jhtP: 3.7, jhtK: 2, jpP: 2, jpK: 1, jpMax: 10547400, jkk: 0.24, jkm: 0.3 },
  kat: [],      // kategori versi lama (hanya untuk pemindahan data)
  tutup: {},    // tutup buku per PT: { Vorent: { s: 'yyyy-MM' (terkunci s.d. bulan ini), log: [...] } }
  cek: {},      // checklist tutup buku: { 'PT|yyyy-MM': { rek: { idRekening: saldoRekeningKoran }, c: { kunci: true }, by, at } }
  mulai: ''     // masa pajak pertama yang dicatat (yyyy-MM)
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
    case 'saveMany': return saveMany(q.token, q.kind, q.recs);
    case 'del': return del(q.token, q.kind, q.id);
    case 'saveSettings': return saveSettings(q.token, q.settings);
    case 'upload': return upload(q.token, q.name, q.mime, q.data);
    case 'tutup': return tutup(q.token, q.pt, q.m, q.buka, q.ket);
    case 'cek': return saveCek(q.token, q.pt, q.m, q.data);
    case 'note': return saveNote(q.token, q.pt, q.key, q.data);
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
const keyOf_ = k => KEY[k] || 'id';

function ensure_() {
  const props = PropertiesService.getScriptProperties();
  const sig = 'v2|' + Object.keys(F).map(k => F[k].map(f => f[0]).join(',')).join('|');
  if (props.getProperty('SIG') === sig) return;
  const ss = ss_();
  Object.keys(F).forEach(k => {
    let sh = ss.getSheetByName(SH[k]);
    if (!sh) { if (LEGACY[k]) return; sh = ss.insertSheet(SH[k]); }
    const head = F[k].map(f => f[1]);
    const cur = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String) : [];
    // kolom baru ditambahkan di kanan; kolom lama tidak dipindah
    if (!cur.length || !cur.some(String)) sh.getRange(1, 1, 1, head.length).setValues([head]);
    else head.forEach(h => { if (cur.indexOf(h) < 0) { sh.getRange(1, sh.getLastColumn() + 1).setValue(h); } });
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#eef0fb');
    sh.setFrozenRows(1);
  });
  // daftar akun standar
  const ak = ss.getSheetByName(SH.akun);
  if (ak.getLastRow() < 2) {
    ak.getRange(2, 1, DEF_COA.length, 1).setNumberFormat('@');
    ak.getRange(2, 1, DEF_COA.length, 7).setValues(DEF_COA.map(r => [r[0], r[1], r[2], r[3], r[4], r[5] ? 'ya' : '', 'ya']));
  }
  let st = ss.getSheetByName(SH.set);
  if (!st) {
    st = ss.insertSheet(SH.set);
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
    const s0 = JSON.parse(JSON.stringify(DEF_SET)); s0.mulai = Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), 'yyyy-MM');
    writeSet_(st, s0);
  }
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Lembar1');
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
  migrate_();
  props.setProperty('SIG', sig);
}

// sekali saja: data versi lama (Transaksi + saldo awal rekening) → Dokumen; rekening diberi akun COA
function migrate_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('MIG_V2')) return;
  const set = readSet_();
  const reks = read_('rek'), akun = read_('akun'), used = {};
  akun.forEach(a => used[a.kode] = 1);
  reks.forEach(r => {
    if (r.akun) return;
    r.tipe = r.tipe || (/kas|tunai|cash/i.test(r.bank + ' ' + r.nama) ? 'kas' : 'bank');
    r.akun = nextKode_(r.tipe === 'kas' ? '1-11' : '1-12', used);
    used[r.akun] = 1;
    write_('akun', { kode: r.akun, nama: r.nama, jenis: 'aset', normal: 'D', grup: r.tipe === 'kas' ? 'Kas' : 'Bank', sys: '', aktif: 'ya' }, 0);
    write_('rek', { akun: r.akun, tipe: r.tipe }, r._row);
  });
  const MAP = { 'pendapatan jasa': '4-1099', 'pendapatan lain': '7-1002', 'setoran modal': '3-1001', 'pinjaman diterima': '2-2001', 'gaji & tunjangan': '6-1001',
    'sewa': '6-1201', 'iklan': '6-1101', 'notaris / biaya klien': '5-1001', 'operasional': '6-1999', 'pajak': '6-1901', 'biaya bank': '6-1401', 'lainnya': '6-1999',
    'prive / dividen': '3-3001', 'bayar pinjaman': '2-2001' };
  const now = new Date().toISOString(), rows = [];
  reks.forEach(r => {
    if (!(r.saldoAwal > 0)) return;
    rows.push({ id: uid_(), jenis: 'jurnal', pt: r.pt, no: '', tgl: r.tglAwal || today_(), jt: '', kontak: '', proyek: '', ket: 'Saldo awal ' + r.nama, total: r.saldoAwal,
      data: JSON.stringify({ lines: [{ akun: r.akun, d: r.saldoAwal, k: 0 }, { akun: '3-9001', d: 0, k: r.saldoAwal }] }), bukti: '', oleh: 'pemindahan data', dibuat: now, diubah: now });
  });
  if (ss_().getSheetByName(SH.trx)) {
    const rk = {}; read_('rek').forEach(r => rk[r.id] = r);
    read_('trx').forEach(t => {
      const a = rk[t.rek]; if (!a) return;
      const base = { id: uid_(), pt: t.pt, no: '', tgl: t.tgl, jt: '', kontak: '', proyek: '', ket: t.ket || t.pihak || t.kat, total: t.nominal, bukti: t.bukti, oleh: t.oleh || 'pemindahan data', dibuat: t.dibuat || now, diubah: now };
      if (t.jenis === 'pindah') rows.push(Object.assign(base, { jenis: 'pindah', data: JSON.stringify({ rek: t.rek, rekTo: t.rekTo, jml: t.nominal, biaya: 0 }) }));
      else rows.push(Object.assign(base, { jenis: 'kas', data: JSON.stringify({ rek: t.rek, arah: t.jenis === 'masuk' ? 'masuk' : 'keluar', lines: [{ akun: MAP[norm_(t.kat)] || (t.jenis === 'masuk' ? '4-1099' : '6-1999'), ket: t.pihak || '', jml: t.nominal }] }) }));
    });
  }
  if (rows.length) appendMany_('dok', rows);
  props.setProperty('MIG_V2', new Date().toISOString() + ' ' + rows.length + ' dokumen');
}

function nextKode_(prefix, used) {
  for (let i = 1; i < 100; i++) { const k = prefix + ('0' + i).slice(-2); if (!used[k]) return k; }
  throw new Error('Kode akun ' + prefix + 'xx penuh');
}

// baca sheet → array objek, kolom dicari dari judul (aman kalau urutan kolom diubah)
function read_(k) {
  const sh = ss_().getSheetByName(SH[k]);
  if (!sh) return [];
  const last = sh.getLastRow(), nc = sh.getLastColumn();
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

function rowOf_(k, head, o, cur) {
  const r = cur || new Array(head.length).fill('');
  F[k].forEach(f => { const i = head.indexOf(f[1]); if (i >= 0 && o[f[0]] !== undefined) r[i] = o[f[0]]; });
  return r;
}

function write_(k, o, row) {
  const sh = ss_().getSheetByName(SH[k]), nc = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, nc).getValues()[0].map(String);
  const r = row || sh.getLastRow() + 1;
  const cur = rowOf_(k, head, o, row ? sh.getRange(r, 1, 1, nc).getValues()[0] : null);
  // kolom teks (kode, tanggal, nomor, NPWP) disimpan sebagai teks agar tidak diubah format oleh Sheets
  F[k].forEach(f => { if (TXT[f[0]]) { const i = head.indexOf(f[1]); if (i >= 0) sh.getRange(r, i + 1).setNumberFormat('@'); } });
  sh.getRange(r, 1, 1, nc).setValues([cur]);
  return r;
}

function appendMany_(k, list) {
  if (!list.length) return;
  const sh = ss_().getSheetByName(SH[k]), nc = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, nc).getValues()[0].map(String);
  const r0 = sh.getLastRow() + 1;
  F[k].forEach(f => { if (TXT[f[0]]) { const i = head.indexOf(f[1]); if (i >= 0) sh.getRange(r0, i + 1, list.length, 1).setNumberFormat('@'); } });
  sh.getRange(r0, 1, list.length, nc).setValues(list.map(o => rowOf_(k, head, o, null)));
}

function readSet_() {
  const sh = ss_().getSheetByName(SH.set), o = JSON.parse(JSON.stringify(DEF_SET));
  if (!sh || sh.getLastRow() < 2) return o;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => {
    const k = String(r[0]).trim();
    if (!(k in o)) return;
    try {
      const v = JSON.parse(r[1]);
      if (Array.isArray(o[k])) { if (Array.isArray(v) && (v.length || k !== 'pts')) o[k] = v; }
      else if (o[k] && typeof o[k] === 'object') { if (v && typeof v === 'object') o[k] = Object.assign(o[k], v); }
      else if (typeof v === typeof o[k]) o[k] = v;
    } catch (e) {}
  });
  // lengkapi kolom PT versi lama
  o.pts = o.pts.map(p => Object.assign({ legal: '', bentuk: 'PT', npwp: '', alamat: '', berdiri: '', pkp: false, pkpSejak: '', prefix: String(p.n || '').slice(0, 3).toUpperCase(), pajak: [] }, p));
  return o;
}

function writeSet_(sh, s) {
  const keys = Object.keys(DEF_SET);
  keys.forEach(k => { if (JSON.stringify(s[k] == null ? DEF_SET[k] : s[k]).length > 49000) throw new Error('Pengaturan "' + k + '" terlalu besar untuk disimpan'); });
  sh.clearContents();
  sh.getRange(1, 1, keys.length + 1, 2).setValues([['Kunci', 'Nilai (jangan diubah manual kalau tidak paham)']].concat(keys.map(k => [k, JSON.stringify(s[k] == null ? DEF_SET[k] : s[k])])));
  sh.getRange(1, 1, 1, 2).setFontWeight('bold');
}

/* ---------------- login (lewat Prospek) ---------------- */
// siapa pengguna ini & aksesnya (dicek ke Prospek, disimpan sementara 10 menit supaya cepat)
function who_(token) {
  if (!token) throw new Error('AUTH');
  const c = CacheService.getScriptCache(), key = 'W_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token)).slice(0, 40);
  const hit = c.get(key);
  if (hit) return JSON.parse(hit);
  const j = prospek_('finWho', token, {});
  c.put(key, JSON.stringify(j), 600);   // akses yang dicabut berlaku paling lama 10 menit
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
    if (['AUTH', 'NOFIN', 'FINLOCK'].indexOf(j.error) >= 0) throw new Error(j.error);
    if (j.error === 'UNKNOWN') throw new Error('Code.gs Prospek belum versi terbaru (perlu fitur Finance). Deploy ulang Code.gs Prospek.');
    throw new Error(j.error || 'Gagal menghubungi Prospek');
  }
  return j.data;
}

const canPt_ = (u, pt) => !u.finPt || !pt || norm_(u.finPt) === norm_(pt);
function writer_(u, pt) {
  if (u.fin !== 'kelola') throw new Error('Akun ini hanya bisa melihat data Finance');
  if (pt && !canPt_(u, pt)) throw new Error('Tidak punya akses ke PT ' + pt);
}

// periode yang sudah tutup buku tidak bisa diubah
const BLN_ = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const masaTxt_ = m => BLN_[Number(String(m).slice(5, 7)) - 1] + ' ' + String(m).slice(0, 4);
function kunci_(set, pt, tgl) {
  const t = (set.tutup || {})[pt], s = t && t.s;
  if (s && tgl && String(tgl).slice(0, 7) <= s) throw new Error('Periode ' + masaTxt_(String(tgl).slice(0, 7)) + ' PT ' + pt + ' sudah tutup buku (terkunci s.d. ' + masaTxt_(s) + '). Buka dulu di menu Tutup Buku kalau memang perlu diubah.');
}

/* ---------------- API ---------------- */
function getAll(token) {
  const u = who_(token), set = readSet_();
  const f = o => canPt_(u, o.pt);
  const strip = o => { delete o._row; return o; };
  if (u.finPt) set.pts = set.pts.filter(p => norm_(p.n) === norm_(u.finPt));
  if (u.finPt) {
    const own = k => norm_(String(k).split('|')[0]) === norm_(u.finPt), pick = o => Object.keys(o || {}).filter(own).reduce((r, k) => { r[k] = o[k]; return r; }, {});
    set.tutup = pick(set.tutup); set.cek = pick(set.cek);
  }
  return {
    user: u, settings: set,
    akun: read_('akun').map(strip),
    kontak: read_('kontak').map(strip),
    jasa: read_('jasa').map(strip),
    rek: read_('rek').filter(f).map(strip),
    dok: read_('dok').filter(f).map(strip),
    pajak: read_('pajak').filter(f).map(strip),
    cat: read_('cat').filter(o => canPt_(u, String(o.kunci).split('|')[1])).map(strip),
    ver: ver_()
  };
}

function clean_(kind, r, set) {
  const o = {};
  F[kind].forEach(f => {
    if (r[f[0]] === undefined || ['oleh', 'dibuat', 'diubah'].indexOf(f[0]) >= 0) return;
    let v = r[f[0]];
    if (f[0] === 'data' && typeof v === 'object') v = JSON.stringify(v);
    o[f[0]] = NUM[f[0]] ? (Math.round((Number(v) || 0) * 100) / 100) : String(v == null ? '' : v).slice(0, f[0] === 'data' ? 45000 : 2000);
  });
  const ptOk = p => !p || set.pts.some(x => x.n === p);
  if (!ptOk(o.pt)) throw new Error('PT tidak dikenal: ' + o.pt);
  if (kind === 'akun') {
    if (!/^[0-9][0-9.\-]{1,14}$/.test(o.kode || '')) throw new Error('Kode akun tidak valid (contoh: 6-1306)');
    if (!o.nama) throw new Error('Nama akun wajib diisi');
    if (AKUN_JENIS.indexOf(o.jenis) < 0) throw new Error('Jenis akun tidak valid');
    if (o.normal !== 'D' && o.normal !== 'K') o.normal = ['aset', 'hpp', 'beban', 'lain_b', 'pajak'].indexOf(o.jenis) >= 0 ? 'D' : 'K';
  }
  if ((kind === 'kontak' || kind === 'jasa' || kind === 'rek') && !o.nama) throw new Error('Nama wajib diisi');
  if (kind === 'rek' && !o.pt) throw new Error('Pilih PT rekening');
  if (kind === 'dok') {
    if (DOK_JENIS.indexOf(o.jenis) < 0) throw new Error('Jenis transaksi tidak valid');
    if (!o.pt) throw new Error('Pilih PT');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(o.tgl || '')) throw new Error('Tanggal tidak valid');
    try { JSON.parse(o.data || '{}'); } catch (e) { throw new Error('Rincian transaksi tidak valid'); }
  }
  if (kind === 'pajak') {
    if (!/^\d{4}-\d{2}$/.test(o.masa) || !o.jenis) throw new Error('Data pajak tidak valid');
    o.id = o.pt + '|' + o.masa + '|' + o.jenis;
  }
  return o;
}

// nomor invoice otomatis: PREFIX/YYYY/MM/0001 (urut per PT per bulan)
function nextNo_(all, o, set) {
  const p = set.pts.find(x => x.n === o.pt) || {}, pre = (p.prefix || String(o.pt).slice(0, 3).toUpperCase()) + '/' + o.tgl.slice(0, 4) + '/' + o.tgl.slice(5, 7) + '/';
  let mx = 0;
  all.forEach(d => { if (d.jenis === 'jual' && String(d.no).indexOf(pre) === 0) mx = Math.max(mx, Number(String(d.no).slice(pre.length)) || 0); });
  return pre + ('000' + (mx + 1)).slice(-4);
}

function save(token, kind, rec) {
  const u = who_(token);
  if (!F[kind] || LEGACY[kind] || kind === 'cat') throw new Error('Data tidak valid');
  const set = readSet_(), o = clean_(kind, rec || {}, set), K = keyOf_(kind);
  writer_(u, o.pt);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const all = read_(kind);
    const old = o[K] ? all.find(x => x[K] === o[K]) : null;
    if (old && !canPt_(u, old.pt)) throw new Error('Tidak punya akses ke data ini');
    if (kind === 'akun' && rec._new && old) throw new Error('Kode ' + o.kode + ' sudah dipakai akun ' + old.nama);
    if (kind === 'akun' && old && old.sys) { o.jenis = old.jenis; o.normal = old.normal; o.sys = old.sys; }
    if (!o[K]) o[K] = uid_();
    const now = new Date().toISOString();
    if (kind === 'rek' && !o.akun && !(old && old.akun)) {
      const used = {}; read_('akun').forEach(a => used[a.kode] = 1);
      o.tipe = o.tipe === 'kas' ? 'kas' : 'bank';
      o.akun = nextKode_(o.tipe === 'kas' ? '1-11' : '1-12', used);
      write_('akun', { kode: o.akun, nama: o.nama, jenis: 'aset', normal: 'D', grup: o.tipe === 'kas' ? 'Kas' : 'Bank', sys: '', aktif: 'ya' }, 0);
    } else if (kind === 'rek' && old && old.akun && o.nama && o.nama !== old.nama) {
      const a = read_('akun').find(x => x.kode === old.akun); if (a) write_('akun', { nama: o.nama }, a._row);
    }
    if (kind === 'dok') {
      kunci_(set, o.pt, o.tgl);
      if (old) kunci_(set, old.pt, old.tgl);
      if (o.jenis === 'jual' && !o.no) o.no = old && old.no ? old.no : nextNo_(all, o, set);
      if (o.jenis === 'jual' && o.no && all.some(x => x.jenis === 'jual' && x.no === o.no && x.id !== o.id && x.pt === o.pt)) throw new Error('Nomor invoice ' + o.no + ' sudah dipakai');
      if (!old) o.dibuat = now;
      o.oleh = u.name; o.diubah = now;
    }
    if (kind === 'pajak') { o.oleh = u.name; o.diubah = now; }
    write_(kind, o, old ? old._row : 0);
    const out = Object.assign({}, old || {}, o); delete out._row;
    return { rec: out, ver: bump_() };
  } finally { lock.releaseLock(); }
}

// simpan banyak sekaligus (import rekening koran / Excel lama)
function saveMany(token, kind, recs) {
  const u = who_(token);
  if (['dok', 'kontak', 'jasa'].indexOf(kind) < 0 || !Array.isArray(recs)) throw new Error('Data tidak valid');
  if (recs.length > 500) throw new Error('Maksimal 500 baris per kirim');
  const set = readSet_(), now = new Date().toISOString();
  const list = recs.map(r => { const o = clean_(kind, r || {}, set); writer_(u, o.pt); if (kind === 'dok') kunci_(set, o.pt, o.tgl); if (!o.id) o.id = uid_(); if (kind === 'dok') { o.dibuat = now; o.diubah = now; o.oleh = u.name; } return o; });
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    if (kind === 'dok') {
      const all = read_('dok'), ids = {};
      all.forEach(d => ids[d.id] = 1);
      list.forEach(o => { if (ids[o.id]) throw new Error('Data sudah ada'); if (o.jenis === 'jual' && !o.no) { o.no = nextNo_(all, o, set); all.push(o); } });
    }
    appendMany_(kind, list);
    return { recs: list, ver: bump_() };
  } finally { lock.releaseLock(); }
}

function del(token, kind, id) {
  const u = who_(token);
  if (!F[kind] || LEGACY[kind] || kind === 'cat') throw new Error('Data tidak valid');
  const K = keyOf_(kind);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const old = read_(kind).find(x => x[K] === id);
    if (!old) return { ver: ver_() };
    writer_(u, old.pt);
    const docs = (kind === 'akun' || kind === 'rek' || kind === 'kontak' || kind === 'jasa') ? read_('dok') : [];
    const usedIn = s => docs.some(d => String(d.data).indexOf('"' + s + '"') >= 0 || d.kontak === s);
    if (kind === 'akun') {
      if (old.sys || ['6-1001', '6-1002', '2-1402', '2-1403', '6-1501', '1-2901', '3-9001'].indexOf(old.kode) >= 0) throw new Error('Akun ini dipakai jurnal otomatis (gaji / penyusutan / saldo awal), tidak bisa dihapus. Bisa diganti nama.');
      if (usedIn(old.kode) || read_('rek').some(r => r.akun === old.kode)) throw new Error('Akun sudah dipakai transaksi. Nonaktifkan saja.');
    }
    if (kind === 'rek' && usedIn(old.id)) throw new Error('Rekening sudah dipakai transaksi. Nonaktifkan saja.');
    if (kind === 'kontak' && usedIn(old.id)) throw new Error('Kontak sudah dipakai transaksi. Nonaktifkan saja.');
    if (kind === 'dok') {
      kunci_(readSet_(), old.pt, old.tgl);
      const ref = read_('dok').find(d => d.id !== id && (d.jenis === 'terima' || d.jenis === 'bayar') && String(d.data).indexOf('"' + id + '"') >= 0);
      if (ref) throw new Error('Sudah ada pembayaran untuk dokumen ini (' + ref.tgl + '). Hapus pembayarannya dulu.');
    }
    ss_().getSheetByName(SH[kind]).deleteRow(old._row);
    if (kind === 'rek' && old.akun) { const a = read_('akun').find(x => x.kode === old.akun); if (a && !usedIn(old.akun)) ss_().getSheetByName(SH.akun).deleteRow(a._row); }
    return { ver: bump_() };
  } finally { lock.releaseLock(); }
}

function saveSettings(token, s) {
  const u = who_(token);
  writer_(u);
  if (u.finPt) throw new Error('Pengaturan hanya untuk akun Finance semua PT');
  s = s || {};
  const cur = readSet_();
  const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const pts = Array.isArray(s.pts) ? s.pts.filter(p => p && str(p.n, 40)).map(p => ({
    n: str(p.n, 40), legal: str(p.legal, 120), bentuk: str(p.bentuk, 30) || 'PT', npwp: str(p.npwp, 30), alamat: str(p.alamat, 300),
    berdiri: /^\d{4}-\d{2}-\d{2}$/.test(p.berdiri) ? p.berdiri : '', pkp: !!p.pkp, pkpSejak: /^\d{4}-\d{2}-\d{2}$/.test(p.pkpSejak) ? p.pkpSejak : '',
    prefix: str(p.prefix, 10).toUpperCase(), pajak: Array.isArray(p.pajak) ? p.pajak.map(String).slice(0, 12) : []
  })) : cur.pts;
  if (!pts.length) throw new Error('Minimal 1 PT');
  const out = {
    pts: pts,
    kebijakan: s.kebijakan && typeof s.kebijakan === 'object' ? {
      pendapatan: s.kebijakan.pendapatan === 'selesai' ? 'selesai' : 'invoice', asetMin: Math.max(0, Number(s.kebijakan.asetMin) || 0),
      susut: str(s.kebijakan.susut, 40) || 'garis lurus', ppn: Number(s.kebijakan.ppn) || 12, dpp: s.kebijakan.dpp === '1' ? '1' : '11/12' } : cur.kebijakan,
    payroll: s.payroll && typeof s.payroll === 'object' ? Object.keys(DEF_SET.payroll).reduce((o, k) => { o[k] = Math.max(0, Number(s.payroll[k]) || 0); return o; }, {}) : cur.payroll,
    aturan: Array.isArray(s.aturan) ? s.aturan.filter(a => a && str(a.kata, 60) && a.akun).map(a => ({ kata: str(a.kata, 60), akun: str(a.akun, 20) })).slice(0, 300) : cur.aturan,
    kat: cur.kat, tutup: cur.tutup, cek: cur.cek,
    mulai: /^\d{4}-\d{2}$/.test(String(s.mulai)) ? s.mulai : cur.mulai
  };
  writeSet_(ss_().getSheetByName(SH.set), out);
  return { settings: out, ver: bump_() };
}

// Tutup buku s.d. bulan m (semua bulan sebelumnya ikut terkunci), atau buka kembali mulai bulan m
function tutup(token, pt, m, buka, ket) {
  const u = who_(token);
  writer_(u, pt);
  if (!/^\d{4}-\d{2}$/.test(String(m))) throw new Error('Bulan tidak valid');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const set = readSet_();
    if (!set.pts.some(p => p.n === pt)) throw new Error('PT tidak dikenal: ' + pt);
    const T = set.tutup || {}, cur = T[pt] || { s: '', log: [] }, now = new Date().toISOString();
    ket = String(ket || '').trim().slice(0, 300);
    if (buka) {
      if (!cur.s || m > cur.s) throw new Error(masaTxt_(m) + ' belum ditutup');
      if (!ket) throw new Error('Isi alasan buka kembali');
      const [y, mm] = m.split('-').map(Number), prev = mm === 1 ? (y - 1) + '-12' : y + '-' + ('0' + (mm - 1)).slice(-2);
      cur.s = prev < '2000-01' ? '' : prev;
    } else {
      if (m > Utilities.formatDate(new Date(), ss_().getSpreadsheetTimeZone(), 'yyyy-MM')) throw new Error('Bulan yang belum berjalan tidak bisa ditutup');
      if (cur.s && m <= cur.s) throw new Error(masaTxt_(m) + ' sudah ditutup');
      cur.s = m;
    }
    cur.log = [{ a: buka ? 'buka' : 'tutup', m: m, by: u.name, at: now, ket: ket }].concat(cur.log || []).slice(0, 40);
    T[pt] = cur; set.tutup = T;
    writeSet_(ss_().getSheetByName(SH.set), set);
    return { pt: pt, tutup: cur, ver: bump_() };
  } finally { lock.releaseLock(); }
}

// simpan checklist & saldo rekening koran untuk tutup buku
function saveCek(token, pt, m, data) {
  if (!/^\d{4}-\d{2}$/.test(String(m))) throw new Error('Bulan tidak valid');
  data = data || {};
  const rek = {}, c = {};
  Object.keys(data.rek || {}).slice(0, 50).forEach(k => { const v = data.rek[k]; if (v !== '' && v != null && isFinite(Number(v))) rek[String(k).slice(0, 40)] = Math.round(Number(v) * 100) / 100; });
  Object.keys(data.c || {}).slice(0, 30).forEach(k => { if (data.c[k]) c[String(k).slice(0, 30)] = true; });
  const r = putNote_(token, pt, 'cek|' + pt + '|' + m, { rek: rek, c: c });
  return { key: pt + '|' + m, cek: r.data, ver: r.ver };
}

// catatan tahunan: 'thn|PT|yyyy' → { calk: {...}, fiskal: {...} }
function saveNote(token, pt, key, data) {
  if (!/^thn\|[^|]+\|\d{4}$/.test(String(key)) || String(key).split('|')[1] !== pt) throw new Error('Kunci catatan tidak valid');
  const r = putNote_(token, pt, key, data && typeof data === 'object' ? data : {});
  return { key: key, data: r.data, ver: r.ver };
}

function putNote_(token, pt, key, data) {
  const u = who_(token);
  writer_(u, pt);
  const set = readSet_();
  if (!set.pts.some(p => p.n === pt)) throw new Error('PT tidak dikenal: ' + pt);
  const o = Object.assign({}, data, { by: u.name, at: new Date().toISOString() }), js = JSON.stringify(o);
  if (js.length > 45000) throw new Error('Catatan terlalu panjang');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const old = read_('cat').find(x => x.kunci === key);
    write_('cat', { kunci: key, data: js, oleh: u.name, diubah: o.at }, old ? old._row : 0);
    return { data: o, ver: bump_() };
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
  Logger.log('Siap. Sheet: ' + ss_().getSheets().map(s => s.getName()).join(', '));
}
