# PaperAlive

PaperAlive adalah aplikasi berbasis peramban (browser) yang memungkinkan Anda untuk menghidupkan gambar 2D statis menjadi animasi bergerak menggunakan teknologi deformasi ARAP (As-Rigid-As-Possible). Anda dapat menggambar sebuah karakter di atas kertas putih, memfotonya, dan membiarkan aplikasi ini menari-nari dengan gambar Anda!

## Prasyarat
Pastikan komputer Anda sudah terpasang perangkat lunak berikut:
- **Node.js** (direkomendasikan versi 16 atau lebih baru)
- Peramban web modern yang mendukung **WebGL 2.0** (Google Chrome, Firefox, Edge, atau Safari versi terbaru)

## Langkah Instalasi

1. Buka terminal atau *command prompt* di dalam *folder* `paperalive` ini.
2. Pasang semua dependensi proyek dengan menjalankan perintah:
   ```bash
   npm install
   ```
   *(Tunggu hingga proses instalasi selesai 100%)*

## Menjalankan Aplikasi

Aplikasi ini menggunakan Vite sebagai peladen pengembangnya (*development server*). Untuk menjalankannya:

1. Pada terminal yang sama, ketikkan perintah:
   ```bash
   npm run dev
   ```
2. Terminal akan menampilkan tautan lokal (biasanya `http://localhost:5173`).
3. Buka tautan tersebut di peramban (browser) web Anda.

## Cara Penggunaan Aplikasi (Langkah-demi-Langkah)

### Tahap 1: Unggah Gambar (Upload)
- Siapkan gambar karakter Anda (disarankan berlatar belakang putih atau transparan, dan tidak memiliki bayangan tebal).
- Klik tombol "**Pilih Gambar**" atau seret gambar Anda ke dalam area yang disediakan.
- Klik "**Lanjut: Masking**".

### Tahap 2: Masking (Menghapus Latar Belakang)
- Pada tahap ini, latar belakang putih pada gambar Anda akan dihapus secara otomatis.
- Gunakan *slider* **Threshold** (Ambang Batas) untuk mengatur seberapa banyak warna putih/terang yang dianggap sebagai latar belakang.
- Jika ada bagian penting karakter yang terhapus atau latar yang masih tersisa, gunakan **Mode Kuas (+ Tambah / - Hapus)** untuk merapikannya.
- Jika sudah rapi (karakter diselimuti warna hijau transparan), klik "**Lanjut: Pasang Sendi**".

### Tahap 3: Rigging (Memasang Sendi)
- Di bagian kanan, pilih **Tipe Karakter**:
  - **Manusia**: Pilih ini jika gambar Anda berbentuk layaknya manusia (memiliki kepala, 2 tangan, dan 2 kaki). Aplikasi akan memunculkan kerangka standar manusia (`head`, `neck`, dll). Geser titik-titik sendi tersebut agar posisinya pas dengan persendian karakter Anda. **(Catatan: Jika Anda ingin menggunakan animasi otomatis, Anda WAJIB memilih tipe ini!)**
  - **Hewan / Lainnya (Freeform)**: Pilih ini untuk bentuk abstrak. Anda bebas menambahkan titik sendi sesuka hati dengan mengeklik area karakter, atau menghapusnya dengan klik kanan.
- Setelah kerangka selesai diatur, klik tombol "**🎭 Bring to Life!**".

### Tahap 4: Pentas (Animasi)
- **Menggerakkan Manual**: Anda bisa mengeklik dan menahan (drag) titik sendi kuning pada karakter Anda untuk menggerakkannya secara manual seperti wayang kulit.
- **Menggunakan Animasi Otomatis**: Pilih gerakan yang Anda inginkan pada menu *dropdown* (misal: "Jalan", "Lari", "Menari"), lalu **KLIK TOMBOL ▶ Play** untuk memutar animasinya. 
- Anda bisa menghentikannya dengan tombol **⏹ Stop**.
- Jika Anda ingin merekam gerakannya menjadi video, klik tombol **Mulai Rekam** dan **Berhenti Rekam** di panel kontrol.

## Dokumentasi

Dokumentasi lengkap proyek tersedia di folder [`docs/`](./docs/):

### Panduan Umum
- [Getting Started](./docs/Getting%20Started.md) — Pengenalan, struktur proyek, dan alur kerja
- [Development and Implementation](./docs/Development%20and%20Implementation.md) — Rencana implementasi, milestones, dan manajemen risiko
- [Testing and Quality Assurance](./docs/Testing%20and%20Quality%20Assurance.md) — Strategi pengujian dan jaminan kualitas
- [Utility Systems](./docs/Utility%20Systems.md) — Sistem utilitas pendukung

### Arsitektur & Komponen
- [Architecture Overview](./docs/Architecture%20Overview/Architecture%20Overview.md) — Gambaran umum arsitektur
- [Core Application Components](./docs/Core%20Application%20Components/Core%20Application%20Components.md) — Komponen inti aplikasi
- [State Management System](./docs/Core%20Application%20Components/State%20Management%20System.md) — Sistem manajemen state

### Pipeline & Sistem
- [Image Processing Pipeline](./docs/Image%20Processing%20Pipeline/Image%20Processing%20Pipeline.md) — Pipeline pemrosesan gambar
- [Preprocessing Pipeline](./docs/Preprocessing%20Pipeline/Preprocessing%20Pipeline.md) — Pipeline preprocessing (Worker)
- [Character Rigging System](./docs/Character%20Rigging%20System/Character%20Rigging%20System.md) — Sistem rigging karakter
- [Physics Simulation System](./docs/Physics%20Simulation%20System/Physics%20Simulation%20System.md) — Simulasi fisika (ARAP)
- [Rendering System](./docs/Rendering%20System/Rendering%20System.md) — Sistem rendering NPR
- [Motion and Animation System](./docs/Motion%20and%20Animation%20System/Motion%20and%20Animation%20System.md) — Sistem animasi dan motion
- [Data Storage and Export](./docs/Data%20Storage%20and%20Export/Data%20Storage%20and%20Export.md) — Penyimpanan data dan ekspor

## Lisensi
Proyek ini dibuat untuk keperluan demonstrasi dan pembelajaran grafika komputer.
