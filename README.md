<div align="center">

# ⚡ QUARTZ XD — Pairing Station

### A no-login WhatsApp pairing site for the QUARTZ bot

**Pair numbers · live device status · one-click delete**

</div>

---

## 🚀 Overview

QUARTZ XD is a **simple, standalone Next.js site** for pairing WhatsApp numbers with the
QUARTZ bot (mzazi89/quartz). No login, no accounts, no subscription checks — open the site,
enter a number, get an 8-character pairing code, and link the device in WhatsApp.

It talks to the **same Neon PostgreSQL database** as the rest of the MZAZI TECH ecosystem, so
everything stays in sync with the bot automatically:

- **Pairing** — writes a `bot_control` row (`action: 'pair'`, no `accountId`); the running bot
  picks it up within ~15s and writes the WhatsApp pairing code back.
- **Devices** — reads `bot_status.session_numbers` (the bot's real session folders) plus
  per-device telemetry (`devices_meta`): online, battery, charging, last-seen.
- **Delete** — writes a `bot_control` row (`action: 'unpair'`, `mode: 'delete'`); the bot logs
  the device out of WhatsApp and wipes the session folder + DB row.

## ✨ Features

| | |
|---|---|
| 🔓 **No login** | Open pairing — no accounts, no auth, no plan checks |
| 🔑 **Pairing codes** | Same flow as the main site: POST `/api/pair` → poll → code |
| 📱 **Paired devices** | Live list of every paired number on the bot |
| 🟢 **Online status** | Per-device connection state, refreshed every 15s |
| 🔋 **Battery / ⚡ Charging** | Wired end-to-end from `bot_status.devices_meta` (see note below) |
| 🌐 **Bot IP** | Server public IP reported by the bot's heartbeat |
| 🗑 **Delete** | One-click logout + full wipe of a device |
| 🎨 **Design** | Dark charcoal + amber, matching the MZAZI ecosystem |

> **Battery / charging note:** the current Baileys build (mzazi89/baileys) does not deliver
> phone battery/charging data, so these fields show "—". The pipeline (quartz telemetry →
> `bot_status.devices_meta` → site) is already in place — the moment the library reports
> `battery` / `plugged`, the values light up automatically.

## ⚙️ Getting Started

```bash
npm install
cp .env.example .env.local   # fill in your values
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string (**same DB as mzazi89/web + quartz**) |
| `NEXT_PUBLIC_BASE_URL` | Public site URL (meta/OG tags) |

## 🗂 Pages & API

- `/` — the whole app: pair form, code display, paired devices grid
- `GET /api/devices` — bot status + device list (online/battery/charging/ip/lastSeen)
- `POST /api/pair` — start pairing `{ number }` → `{ requestId }`
- `GET /api/pair?requestId=` — poll pairing status + code
- `POST /api/device/delete` — delete a device `{ number }`

## 🏗 Architecture

```
quartzxd (this repo)   → no-login pairing site @ your domain
quartz/                → the bot that executes pair/unpair + reports telemetry
web / admin            → the rest of the MZAZI ecosystem (same DB)
      └── all share the same Neon database (bot_control, bot_status, …)
```

Requires the quartz bot to run the telemetry heartbeat (already in `lib/botTelemetry.js` —
adds `ip_address` + `devices_meta` columns on its own via `ADD COLUMN IF NOT EXISTS`).

## ☁️ Deployment

1. Add this repo as a **new Vercel project**.
2. Set `DATABASE_URL` identical to the main site + bot.
3. Deploy — done. No other services required.

---

<div align="center"><sub>QUARTZ XD — MZAZI TECH INC · Power Your Digital World ⚡</sub></div>
