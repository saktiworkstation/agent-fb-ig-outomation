<div align="center">

# 🤖 Social Media Marketing Agent

### AI-Powered Facebook & Instagram Automation for Growing Brands

*Autonomous content creation, smart comment replies, and ad management — running 24/7.*

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![OpenAI](https://img.shields.io/badge/OpenAI-gpt--4o--mini-412991?logo=openai&logoColor=white)](https://openai.com)
[![Meta Graph API](https://img.shields.io/badge/Meta-Graph%20API-0866FF?logo=meta&logoColor=white)](https://developers.facebook.com)
[![SQLite](https://img.shields.io/badge/SQLite-WAL-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](#-license)

[Features](#-key-features) · [Demo](#-live-dashboard) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [Bahasa Indonesia](#-bahasa-indonesia)

</div>

---

## 🌟 Overview

**Social Media Marketing Agent** is a fully autonomous marketing assistant that runs your brand's
Facebook Page and Instagram Business account — without you lifting a finger.

It writes on-brand posts with AI, picks the right image for each post, publishes to both platforms,
replies to customer comments intelligently, and launches & monitors paid ad campaigns — all on a
schedule you control, with a clean real-time web dashboard to watch it all happen.

> 💡 **Built for businesses** that want consistent, high-quality social presence without a full-time
> social media team. Configure once, and the agent handles the daily grind.

---

## ✨ Key Features

| | Feature | What it does |
|---|---|---|
| 📝 | **AI Content Generation** | Generates fresh, on-brand captions in 4+ styles — *promo, testimonial, product highlight, educational* — powered by OpenAI. Never repeats the same pattern. |
| 🖼️ | **Smart Image Selection** | Automatically picks the most relevant image from your Cloudinary library for each post, avoiding recently-used ones for variety. |
| 📅 | **Scheduled Auto-Posting** | Publishes to Facebook **and** Instagram on a configurable cron schedule (e.g. twice daily). Rotates through content types automatically. |
| 💬 | **Intelligent Comment Replies** | Polls for new comments, classifies them (*question / compliment / complaint / spam*), and replies with context-aware, on-brand responses — or stays silent on spam. |
| 📊 | **Ad Campaign Automation** | Creates full Meta ad campaigns from any post (campaign → ad set → creative → ad), with audience targeting, budget, and duration. |
| 🚨 | **Performance Monitoring & Alerts** | Fetches daily ad metrics (spend, reach, CTR, clicks) and raises alerts when spend exceeds budget or CTR drops below threshold. |
| 🛡️ | **Brand Safety Guardrails** | Strips raw prices, enforces correct product URLs per content line, and keeps tone consistent with your brand voice. |
| 🖥️ | **Real-Time Web Dashboard** | Single-page control panel with live log streaming (SSE), connection status, manual triggers, and an in-browser config editor. |
| 💾 | **Local-First Persistence** | All posts, comments, campaigns, and metrics stored in a lightweight SQLite database (WAL mode) — no external DB required. |

---

## 🖥️ Live Dashboard

The built-in web UI (served at `http://localhost:3000`) gives you full visibility and control:

```
┌─────────────────────────────────────────────────────────────┐
│  🤖 Marketing Agent Dashboard            ● FB  ● IG  Connected │
├─────────────────────────────────────────────────────────────┤
│  [ Post Now ▾ ]   [ Check Comments ]   [ Refresh Ads ]        │
├─────────────────────────────────────────────────────────────┤
│  📡 Live Log Stream                                            │
│  ✓ Connected to Facebook Page "Your Brand"                    │
│  ✓ Photo post published! FB Post ID: 1090..._123             │
│  ✓ Post published to Instagram! IG Post ID: 178...           │
│  ℹ Comment classified as: question  →  replied                │
│  ℹ Daily Ad Metrics — reach: 12,430  CTR: 1.84%  spend: $4.20 │
└─────────────────────────────────────────────────────────────┘
```

**Dashboard capabilities:** live SSE log stream · one-click manual post/comment/ad triggers ·
FB & IG connection diagnostics · in-browser `config.json` editor · recent posts & ad metrics view.

---

## 🏗️ Architecture

```
                         ┌──────────────────────┐
                         │   Web Dashboard (UI)  │  ← live logs (SSE) + controls
                         └───────────┬──────────┘
                                     │
   ┌─────────────────────────────────────────────────────────────────┐
   │                      Express API  (src/server.ts)                 │
   └───────┬──────────────────┬───────────────────┬──────────────────┘
           │                  │                   │
   ┌───────▼──────┐   ┌───────▼───────┐   ┌───────▼────────┐
   │ Post         │   │ Comment       │   │ Ads            │
   │ Generator    │   │ Replier       │   │ Manager        │
   │ (cron)       │   │ (cron)        │   │ (cron)         │
   └───┬──────┬───┘   └───────┬───────┘   └───────┬────────┘
       │      │               │                   │
   ┌───▼──┐ ┌─▼─────────┐ ┌───▼──────────────────▼────────┐
   │OpenAI│ │Cloudinary │ │   Meta Graph API (FB + IG)     │
   │  AI  │ │  Images   │ │  publish · comments · ads      │
   └──────┘ └───────────┘ └────────────────────────────────┘
                                     │
                         ┌───────────▼──────────┐
                         │   SQLite  (agent.db)  │  posts · comments · campaigns · metrics
                         └──────────────────────┘
```

### Project Structure

```
src/
├── index.ts                  # Main entry — boots server + all schedulers
├── cli.ts                    # CLI for manual operations
├── server.ts                 # Express API + SSE log streaming
├── lib/
│   ├── config.ts             # Env vars + config.json loader
│   ├── facebook.ts           # Meta Graph API client (FB + IG + Ads)
│   ├── gemini.ts             # AI content generation & comment analysis (OpenAI)
│   ├── cloudinary.ts         # Smart image selection
│   ├── logger.ts             # Structured logging
│   └── logBroadcaster.ts     # Event bus for live log streaming
├── modules/
│   ├── postGenerator.ts      # AI posts → FB + IG (scheduled)
│   ├── commentReplier.ts     # Comment polling & auto-reply (scheduled)
│   └── adsManager.ts         # Ad creation & metrics monitoring (scheduled)
└── db/
    └── database.ts           # SQLite schema & queries
public/
└── index.html                # Single-page dashboard
config.json                   # Brand, product, posting & ads configuration
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- A **Facebook Page** + **Meta System User / Page Access Token**
- An **OpenAI API key**
- *(Optional)* **Instagram Business account** linked to the Page
- *(Optional)* **Cloudinary** account for automatic images
- *(Optional)* **Meta Ad Account** for ad automation

### 1. Install

```bash
git clone <your-repo-url>
cd agent-facebook-gym
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in your credentials:

```env
# Facebook Graph API
FB_PAGE_ID=your_page_id
FB_ACCESS_TOKEN=your_long_lived_access_token
FB_AD_ACCOUNT_ID=act_your_ad_account_id      # optional

# Instagram (uses the same FB token)
IG_USER_ID=your_ig_business_account_id        # optional

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Scheduling
POST_SCHEDULE=0 8,18 * * *                    # 8 AM & 6 PM daily
COMMENT_POLL_INTERVAL_MINUTES=15

# Ads
DAILY_AD_BUDGET_USD=5.00
AD_SPEND_ALERT_THRESHOLD_USD=10.00
AD_CTR_DROP_ALERT_THRESHOLD=0.01

PORT=3000
```

Then tailor `config.json` to your brand — product details, tone of voice, language,
hashtag groups, posting strategy, and ad audiences.

### 3. Run

```bash
npm start
```

Open **http://localhost:3000** to view the dashboard. The agent will authenticate,
start all schedulers, and begin working automatically.

### Production build

```bash
npm run build
npm run start:prod
```

---

## 🛠️ CLI Commands

Run any operation manually without waiting for the schedule:

```bash
npm run cli -- auth-test                  # Test Facebook connection
npm run cli -- post promo                 # Publish a post now (promo|testimonial|product_highlight|educational)
npm run cli -- poll-comments              # Run one comment poll & reply cycle
npm run cli -- create-ad <postId>         # Create an ad from a post (or the latest unpromoted post)
npm run cli -- metrics                    # Fetch today's ad metrics
npm run cli -- metrics-history            # Show stored metrics history
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/status` | FB & IG connection status |
| `GET`  | `/api/dashboard` | Today's posts, recent posts, latest metrics |
| `POST` | `/api/post-now` | Trigger a post (`{ postType }`) |
| `POST` | `/api/check-comments` | Run a comment poll cycle |
| `GET`  | `/api/ads-status` | Refresh & return ad metrics |
| `GET`  | `/api/fb-pages` | Diagnose page/token mismatches |
| `GET`  | `/api/config` · `POST` `/api/config` | Read / update `config.json` |
| `GET`  | `/api/logs` | Live log stream (Server-Sent Events) |

---

## ⚙️ Tech Stack

- **Runtime:** Node.js + TypeScript
- **Web:** Express 5 + Server-Sent Events
- **AI:** OpenAI (`gpt-4o-mini`) for content generation & comment analysis
- **Social:** Meta Graph API (Facebook Pages, Instagram Graph, Marketing API)
- **Media:** Cloudinary (smart image selection)
- **Database:** SQLite via `better-sqlite3` (WAL mode)
- **Scheduling:** `node-cron`

---

## 🔒 Security Notes

- Never commit your `.env` file — it's already in `.gitignore`.
- Use a **long-lived** Page/System User token; short-lived tokens expire quickly.
- The dashboard has no built-in auth — run it behind a reverse proxy or VPN in production.

---

## 🇮🇩 Bahasa Indonesia

### Apa ini?

**Social Media Marketing Agent** adalah asisten marketing otomatis yang menjalankan akun
**Facebook Page** dan **Instagram Business** brand Anda secara mandiri — 24 jam non-stop.

Agent ini menulis caption sesuai gaya brand dengan AI, memilih gambar yang tepat, mem-posting
ke FB & IG, membalas komentar pelanggan secara cerdas, serta membuat dan memantau iklan berbayar —
semuanya sesuai jadwal yang Anda atur, lengkap dengan **dashboard web real-time**.

### Fitur Utama

- 📝 **Generasi Konten AI** — caption otomatis dalam berbagai gaya (promo, testimoni, sorotan produk, edukasi), tidak pernah mengulang pola yang sama.
- 🖼️ **Pemilihan Gambar Cerdas** — otomatis memilih gambar paling relevan dari library Cloudinary.
- 📅 **Auto-Posting Terjadwal** — posting ke Facebook **dan** Instagram sesuai jadwal cron.
- 💬 **Balas Komentar Otomatis** — mengklasifikasi komentar (pertanyaan/pujian/keluhan/spam) lalu membalas sesuai konteks & tone brand.
- 📊 **Otomatisasi Iklan** — membuat campaign Meta lengkap dari sebuah post, dengan targeting & budget.
- 🚨 **Monitoring & Alert** — memantau metrik iklan harian dan memberi peringatan bila budget terlampaui atau CTR turun.
- 🛡️ **Brand Safety** — menyembunyikan harga mentah, memastikan URL produk benar, dan menjaga konsistensi tone.
- 🖥️ **Dashboard Real-Time** — panel kontrol satu halaman dengan log langsung (SSE) & editor konfigurasi.

### Cara Menjalankan

```bash
npm install            # 1. Pasang dependensi
cp .env.example .env   # 2. Isi kredensial (FB token, OpenAI key, dll.)
                       #    lalu sesuaikan config.json dengan brand Anda
npm start              # 3. Jalankan — buka http://localhost:3000
```

Agent akan otomatis login, menjalankan semua scheduler, dan mulai bekerja. Anda juga bisa
menjalankan tugas manual lewat CLI (`npm run cli -- post promo`, dll.).

> 💡 **Cocok untuk bisnis** yang ingin kehadiran media sosial yang konsisten dan berkualitas
> tanpa perlu tim social media penuh waktu. Atur sekali, sisanya biar agent yang kerja.

---

## 📄 License

Released under the **ISC License**.

---

<div align="center">

**Built with ❤️ for brands that want to grow on autopilot.**

*Dibangun dengan ❤️ untuk brand yang ingin berkembang secara otomatis.*

</div>
