# Finance · Akuntansi & Pajak

Aplikasi pembukuan (PWA) untuk Vorent, Izinin, dan Echoffice: double-entry, per PT, mulai dari tanggal pendirian.
Login memakai akun aplikasi [Prospek](https://github.com/my-razara/dashboard-prospek), tapi **data keuangan tidak diambil dari Prospek**. Semua diinput oleh tim finance.

## Fitur (Fondasi + Tahap 2–8)
- **Data Induk**: profil PT & pajak (PKP sejak, jenis pajak, kode invoice), kebijakan akuntansi, Daftar Akun (COA standar perusahaan jasa),
  pelanggan, vendor & agen, karyawan & sales, jasa/paket, rekening bank & kas.
- **Transaksi dengan jurnal otomatis**: penjualan (invoice, PPN, PPh 23 dipotong klien, DP), terima pembayaran, pembelian/beban (PPN masukan, potong PPh),
  bayar tagihan, uang masuk/keluar, pindah dana, jurnal umum (template setoran modal, saldo awal, penyusutan, prive).
- **Buku pembantu**: piutang & umur piutang, uang muka klien, utang & umur utang, mutasi kas & bank, laba per proyek/klien.
- **Laporan**: Laba Rugi, Neraca (cek seimbang), Neraca Saldo, Buku Besar, unduh Excel.
- **Pajak**: status setor/lapor per masa, angka dari pembukuan, catat pembayaran.
- **Import data lama**: mutasi rekening koran (CSV/Excel) dengan aturan kata kunci & pencocokan invoice; import pelanggan/vendor dari Excel.

- **Payroll & BPJS** — data karyawan (PTKP, gaji, tunjangan, kepesertaan BPJS), proses gaji per PT per bulan, PPh 21 TER (PP 58/2023) otomatis, jurnal gaji otomatis, rekap tahunan per karyawan. Tarif & batas upah BPJS diatur di Data Induk → Profil PT.
- **Aset Tetap** — daftar aset, penyusutan garis lurus per bulan, jadwal penyusutan, tombol catat penyusutan (jurnal 6-1501 / 1-2901).

- **Tutup Buku bulanan** — per PT per bulan: cek otomatis (rekonsiliasi saldo bank vs rekening koran, penyusutan, gaji, neraca seimbang, akun lain-lain, status pajak), cek manual, lalu kunci periode. Bulan yang sudah ditutup tidak bisa ditambah/diubah/dihapus (dicek juga di server). Bisa dibuka kembali dengan alasan; semua tercatat di riwayat.

- **Arus Kas & Perubahan Ekuitas** — menu Laporan: arus kas metode tidak langsung (operasi, investasi, pendanaan) yang dicocokkan otomatis dengan saldo kas & bank, dan perubahan ekuitas (modal, prive/dividen, laba ditahan) yang dicocokkan dengan neraca. Ikut di Download Excel.

- **Rekap SPT masa** — menu Pajak → Rekap SPT masa: daftar faktur PPN keluaran & masukan (DPP, DPP nilai lain, PPN, kurang/lebih bayar), PPh 21 pegawai (dari proses gaji) & bukan pegawai, PPh 23/26 & 4(2) yang dipotong ke vendor, PPh 23 yang dipotong klien (kredit pajak). Dicocokkan otomatis dengan saldo akun pajak, peringatan NPWP kosong, bisa diunduh Excel per masa.

- **Tutup tahun & laporan tahunan** — menu Tutup Buku → tab Tutup tahun: checklist akhir tahun, perhitungan PPh Badan (tarif umum + fasilitas Pasal 31E atau PP 55 0,5%, koreksi fiskal, kredit PPh 23/25, PPh 29) dengan tombol jurnal otomatis, CALK yang bisa diedit, dan laporan tahunan siap cetak/PDF (neraca & laba rugi komparatif, perubahan ekuitas, arus kas, CALK bernomor).
- Sheet **Catatan** menyimpan checklist tutup buku, CALK, dan perhitungan PPh Badan per PT (dibuat otomatis).

- **Laporan manajemen** — menu Laporan → Manajemen (tab pertama): ringkasan untuk owner (pendapatan vs tahun lalu, laba & margin, kas & perkiraan cukup berapa bulan, piutang telat), grafik tren bulanan, perbandingan per PT, pendapatan per layanan, beban terbesar, 10 klien terbesar, umur piutang, rincian per bulan. Ikut di Download Excel (sheet Manajemen).

- **Komisi sales & agen** — isi Sales / Agen di invoice dan % komisi di Data Induk; menu Komisi menghitung komisi per invoice (saat lunas atau saat terbit), lalu Catat komisi membuat tagihan komisi (beban 5-1003/5-1004, potong PPh 21/23 otomatis) yang dibayar lewat Bayar tagihan vendor.
- **Transaksi antar PT** — transfer/pinjam dana, dibayarin biaya PT lain, dan pelunasan: sekali catat langsung tercatat di kedua PT (Piutang/Utang Antar Perusahaan), saldo antar PT dicocokkan otomatis, hapus satu sisi = pasangannya ikut terhapus.

Semua tahap dari roadmap tim finance sudah selesai. Modul Virtual Office menyusul.


## Sheet di spreadsheet Finance
Akun, Kontak, Jasa, Rekening, Dokumen (semua transaksi, rincian dalam JSON), Pajak, Pengaturan.
Data versi lama (sheet Transaksi) dipindah otomatis ke Dokumen saat Code.gs baru pertama kali jalan.

## Pemasangan (sekali saja)
1. Buat Google Spreadsheet baru (mis. "Finance"), bukan spreadsheet Prospek.
2. Extensions → Apps Script → tempel `apps-script/Code.gs`. Pastikan `PROSPEK_API` = URL Web App Prospek.
3. Jalankan fungsi `setup` sekali (Run) dan izinkan akses.
4. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone), salin URL `/exec` ke `config.js` (`API_URL`).
5. GitHub Pages: Settings → Pages → Branch `main` / root.

Update `Code.gs` berikutnya: **Manage deployments → Edit → Version: New version** (URL tetap).
