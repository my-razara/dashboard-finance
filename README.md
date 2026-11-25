# Finance · Keuangan & Pajak

Aplikasi keuangan (PWA) untuk Vorent, Izinin, dan Echoffice. Pasangan dari aplikasi
[Prospek](https://github.com/my-razara/dashboard-prospek): tampilannya sama dan login-nya juga sama,
tapi kode, server, dan spreadsheet-nya terpisah.

- **Ringkasan**: laba bersih, pemasukan, pengeluaran, saldo kas & bank, grafik 12 bulan,
  pajak bulan ini, jatuh tempo, dan pembayaran klien dari Prospek yang belum dicocokkan.
- **Transaksi**: pemasukan, pengeluaran, pindah dana, dan lampiran foto nota (tersimpan di Google Drive).
- **Kas & Bank**: saldo per rekening, dihitung dari saldo awal + transaksi.
- **Laba Rugi**: per bulan atau per tahun, per PT.
- **Pajak**: status setor/lapor per masa (PPh 21/23/4(2)/25/26, PPN), NTPN, dan batas waktunya.
- **Laporan Excel** dan **Pengaturan** (PT, jenis pajak, kategori).

## Akses
Akses diatur di aplikasi Prospek → menu **Pengguna**:
- **Admin** selalu punya akses penuh.
- Pengguna lain bisa diberi **Finance: lihat saja** atau **Finance: kelola**,
  untuk semua PT atau untuk satu PT saja.

## Pemasangan (sekali saja)
1. Buat Google Spreadsheet baru, misalnya "Finance". Jangan pakai spreadsheet Prospek.
2. Buka **Extensions → Apps Script**, lalu tempel isi `apps-script/Code.gs`.
   Cek konstanta `PROSPEK_API`: isinya harus URL Web App Prospek.
3. Pilih fungsi `setup`, klik **Run**, lalu izinkan aksesnya (Spreadsheet, Drive, dan memanggil server Prospek).
4. **Deploy → New deployment → Web app**, dengan **Execute as: Me** dan **Who has access: Anyone**. Salin URL `/exec`-nya.
5. Isi `API_URL` di `config.js` dengan URL tersebut.
6. Aktifkan GitHub Pages: Settings → Pages → Branch `main` / root.

Kalau nanti ada update `Code.gs`, deploy lewat **Manage deployments → Edit → Version: New version**
supaya URL-nya tetap sama.
