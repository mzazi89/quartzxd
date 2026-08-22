// QUARTZ XD — POST /api/pair | GET /api/pair?requestId=
//
// No-login WhatsApp pairing through the shared Neon database.
//   POST { number }      → creates a `pair` control row in bot_control; the
//                          running quartz bot picks it up (≤15s), requests the
//                          pairing code from WhatsApp and writes it back.
//   GET  ?requestId=      → polls the request status + pairing code.
//
// Unlike mzazi89/web there is NO accountId in the payload — pairing is open
// to anyone, no login, no subscription checks.
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
      return NextResponse.json(
        { error: 'Invalid phone number. Use format like 254785016388 (numbers only, no +, spaces or dashes).' },
        { status: 400 }
      );
    }

    // The bot must be online to generate a pairing code.
    const status = await db()`
      SELECT online FROM bot_status WHERE bot_id = 'main' ORDER BY last_seen_at DESC LIMIT 1
    `;
    if (!status.length || !status[0].online) {
      return NextResponse.json({ error: 'The bot is currently offline. Try again in a few minutes.' }, { status: 503 });
    }

    // One pairing request at a time per number.
    const pending = await db()`
      SELECT id FROM bot_control
      WHERE action = 'pair' AND status IN ('pending', 'claimed')
        AND payload->>'number' = ${number}
      ORDER BY id DESC LIMIT 1
    `;
    if (pending.length) {
      return NextResponse.json({ error: 'A pairing request for this number is already in progress.' }, { status: 409 });
    }

    const rows = await db()`
      INSERT INTO bot_control (action, payload, status)
      VALUES ('pair', ${JSON.stringify({ number })}::jsonb, 'pending')
      RETURNING id
    `;
    return NextResponse.json({ requestId: rows[0].id, number });
  } catch (e) {
    console.error('Pair POST error:', e.message);
    return NextResponse.json({ error: 'Failed to start pairing. Try again.' }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = Number(searchParams.get('requestId'));
    if (!requestId) {
      return NextResponse.json({ error: 'Missing requestId' }, { status: 400 });
    }

    const rows = await db()`
      SELECT id, status, result, created_at, done_at
      FROM bot_control
      WHERE id = ${requestId}
    `;
    if (!rows.length) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    const r = rows[0];
    let result = null;
    if (r.status === 'done' && r.result) {
      try { result = JSON.parse(r.result); } catch { result = { raw: r.result }; }
    }
    return NextResponse.json({
      status: r.status,
      result,
      error: r.status === 'failed' ? r.result : null,
    });
  } catch (e) {
    console.error('Pair GET error:', e.message);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}
