# Kas RT03 — refactor struktur frontend

## Struktur
- `index.html`: markup dan urutan pemuatan library.
- `assets/css/app.css`: stylesheet.
- `assets/js/images.js`: aset gambar inline yang sebelumnya tertanam dalam HTML.
- `assets/js/vendor-jszip.js`: library JSZip yang sebelumnya tertanam dalam HTML.
- `assets/js/login-core.js`: logika tema/pengingat login.
- `assets/js/app.js`: logika aplikasi.
- `assets/js/config.js`: konfigurasi browser Supabase.

## Penting tentang Supabase
`supabaseUrl` dan publishable key sengaja dipisahkan dari kode aplikasi, tetapi tetap dapat dibaca pengunjung karena aplikasi berjalan di browser. Publishable key bukan pengganti autentikasi dan bukan rahasia. Jangan pernah memasukkan `service_role` key atau secret key ke file frontend.

Sebelum produksi, verifikasi di Supabase: (1) RLS aktif pada semua tabel yang berisi data warga/transaksi; (2) policy membatasi akses per role dan per rumah; (3) operasi admin memeriksa role di sisi database, bukan hanya menyembunyikan tombol; (4) Storage buckets dan RPC/function juga punya policy yang sesuai; (5) audit log dan data sensitif tidak dapat dibaca pengguna biasa. Jika key berprivilege tinggi pernah masuk ke repositori, rotasi segera.

## Deploy
Upload seluruh isi folder ini ke hosting static yang sama dengan path relatif dipertahankan. Jangan hanya upload `index.html`. Tes di staging terlebih dahulu.

## Batas verifikasi
Refactor ini mempertahankan logika aplikasi dan memindahkan aset inline ke file terpisah. Pengujian otomatis statis tidak dapat membuktikan seluruh alur aplikasi berhasil tanpa koneksi ke proyek Supabase, akun admin/pengurus/warga, skema tabel, dan data uji. Jalankan checklist manual sebelum mengganti situs produksi.
