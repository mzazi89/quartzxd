// QUARTZ XD — POST /api/device/delete
//
// No-login device removal: asks the quartz bot to logout the WhatsApp device
// and wipe its session folder + DB row (bot_control action 'unpair',
// mode 'delete'). No accountId — ownership checks are skipped by design.
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


function normalizeNumber(n) {
  const digits = String(n || '').replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

export async function POST(request) {
  try {
    let body;
    try { body = await request.json(); } catch { body = {}; }

    const number = normalizeNumber(body.number);
    if (!number) {
      return NextResponse.json({ error: 'Invalid phone number.' }, { status: 400 });
    }

    const pending = await db()`
      SELECT id FROM bot_control
      WHERE action = 'unpair' AND status IN ('pending', 'claimed')
        AND payload->>'number' = ${number}
      ORDER BY id DESC LIMIT 1
    `;
    if (pending.length) {
      return NextResponse.json({ error: 'A request for this number is already in progress.' }, { status: 409 });
    }

    const rows = await db()`
      INSERT INTO bot_control (action, payload, status)
      VALUES ('unpair', ${JSON.stringify({ number, mode: 'delete' })}::jsonb, 'pending')
      RETURNING id
    `;
    return NextResponse.json({ requestId: rows[0].id, number });
  } catch (e) {
    console.error('Device delete error:', e.message);
    return NextResponse.json({ error: 'Failed to start deletion. Try again.' }, { status: 500 });
  }
}
