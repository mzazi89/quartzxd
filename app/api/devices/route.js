// QUARTZ XD — GET /api/devices
//
// No-login device list read from the shared Neon database (bot_status):
//   botOnline   — is the quartz bot heartbeating
//   ip          — the bot server's public IP (reported by quartz)
//   devices[]   — every paired number (session folders on the bot) with
//                 telemetry: online, battery, plugged (charging), lastSeen
//                 (battery/plugged show only when the Baileys build reports them)
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

// Lazy Neon client — must not throw at build/import time when DATABASE_URL is
// unset locally; it only needs to exist when the API is actually called.
let _sql = null;
function db() {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql;
}


export async function GET() {
  try {
    // Defensive: the telemetry columns are created by the quartz bot on its
    // heartbeat, but the site should work even before the bot is updated.
    // Same idempotent ADD COLUMN IF NOT EXISTS pattern — safe to run always.
    for (const q of [
      `ALTER TABLE bot_status ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT ''`,
      `ALTER TABLE bot_status ADD COLUMN IF NOT EXISTS devices_meta TEXT DEFAULT '{}'`,
    ]) {
      try { await db().unsafe(q); } catch (e) {}
    }

    const rows = await db()`
      SELECT online, version, uptime_seconds, session_numbers, ip_address, devices_meta, last_seen_at
      FROM bot_status
      WHERE bot_id = 'main'
      ORDER BY last_seen_at DESC
      LIMIT 1
    `;

    if (!rows.length) {
      return NextResponse.json({ botOnline: false, ip: null, devices: [] });
    }

    const r = rows[0];
    let numbers = [];
    try { numbers = JSON.parse(r.session_numbers || '[]'); } catch {}
    let meta = {};
    try { meta = JSON.parse(r.devices_meta || '{}'); } catch {}

    const devices = numbers.map((n) => ({
      number: n,
      online: !!(meta[n] && meta[n].online),
      battery: meta[n] && typeof meta[n].battery === 'number' ? meta[n].battery : null,
      plugged: meta[n] && typeof meta[n].plugged === 'boolean' ? meta[n].plugged : null,
      lastSeen: meta[n] && meta[n].lastSeen ? meta[n].lastSeen : null,
    }));

    return NextResponse.json({
      botOnline: !!r.online,
      ip: r.ip_address || null,
      version: r.version || null,
      uptimeSeconds: r.uptime_seconds ? Number(r.uptime_seconds) : null,
      devices,
    });
  } catch (e) {
    console.error('Devices error:', e.message);
    return NextResponse.json({ error: 'Failed to load devices' }, { status: 500 });
  }
}
