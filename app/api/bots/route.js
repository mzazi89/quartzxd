// QUARTZ XD — GET /api/bots
//
// The bots this site can pair into, with their live state, so the page can offer
// a selector. `multiple` is the switch the UI reads: with one bot there is
// nothing to choose and the form stays exactly as it was before.
//
// Always at least one bot, even when the settings table is missing or holds no
// valid list — see lib/bots.js.
import { NextResponse } from 'next/server';
import { listBotsWithStatus } from '@/lib/bots';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { bots, multiple } = await listBotsWithStatus();
    return NextResponse.json(
      { bots, multiple },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (e) {
    console.error('Bots error:', e.message);
    return NextResponse.json({ error: 'Failed to load bots' }, { status: 500 });
  }
}
