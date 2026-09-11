// QUARTZ XD — which bots this site can pair into.
//
// Read from the SAME `settings` row the bot itself reads — `bot_profiles` —
// rather than from a list kept here. Two lists would drift, and the morning they
// disagree the site would either offer a bot that cannot serve the request or
// hide one that can. One source of truth, read from both sides.
//
// The parsing mirrors lib/profiles.js on the bot and lib/bots.js on the mzazi89
// link site, including the fallback, so all three agree on the primary bot.
import { neon } from '@neondatabase/serverless';

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

const SETTINGS_KEY = 'bot_profiles';
const NAME_KEY = 'bot_name';

// Matches the bot's own staticConfig default for botName. If the site and the
// bot ever disagreed about the single-bot fallback, the selector would show a
// bot the bot does not think exists.
const FALLBACK_NAME = 'MZAZI TECH QUARTZ BOT';
const FALLBACK_ID = 'main';

function parseProfiles(raw) {
  if (!raw) return [];

  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[quartzxd][bots] bot_profiles is not valid JSON — treating it as unset');
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];

  const cleaned = parsed
    .filter((p) => p && typeof p === 'object')
    .map((p) => ({
      id: String(p.id ?? '').trim(),
      name: String(p.name ?? '').trim(),
    }))
    .filter((p) => p.id && p.name);

  // Duplicate ids would make two bots indistinguishable and let a pairing land
  // somewhere the user did not choose. Keep the first of each.
  const seen = new Set();
  return cleaned.filter((p) => (seen.has(p.id) ? false : seen.add(p.id)));
}

/**
 * The selectable bots, always at least one.
 *
 * Never throws: the `settings` table belongs to the bot, and if it is missing or
 * unreadable this site still has to work — it simply cannot know about a second
 * bot, which is exactly the single-bot behaviour that existed before this file.
 */
export async function listBots() {
  const settings = {};

  try {
    // Literal keys rather than an array parameter: two values, no driver
    // array-serialisation to get wrong on a path that must not fail.
    const rows = await db()`
      SELECT key, value FROM settings
      WHERE key IN ('bot_profiles', 'bot_name')
    `;
    for (const row of rows) settings[row.key] = row.value || '';
  } catch (err) {
    console.warn('[quartzxd][bots] could not read the settings table:', err.message);
  }

  const configured = parseProfiles(settings[SETTINGS_KEY]);
  if (configured.length) return configured;

  return [{ id: FALLBACK_ID, name: settings[NAME_KEY] || FALLBACK_NAME }];
}

/**
 * Resolve a caller's requested bot.
 *
 * A caller that names one is held to it: an unknown name is refused rather than
 * quietly falling back, because a pairing that lands on the wrong bot looks
 * successful and cannot be undone from this page.
 *
 * A caller that names none is the request this site always accepted. That is
 * only unambiguous while there is one bot, so with several configured a choice
 * is required rather than guessed — guessing would queue an untargeted row and
 * then report a bot that may not be the one that takes it.
 *
 * `named` tells the caller whether to stamp bot_id on the control row.
 */
export async function resolveBot(requested) {
  const bots = await listBots();
  const wanted = String(requested || '').trim();

  if (wanted) {
    const found = bots.find((b) => b.id === wanted);
    if (!found) {
      return { ok: false, error: 'That bot is not available.' };
    }
    return { ok: true, bot: found, named: true };
  }

  if (bots.length > 1) {
    return { ok: false, error: 'Choose which bot to link to.' };
  }

  return { ok: true, bot: bots[0], named: false };
}

/**
 * The most recent telemetry row for one bot.
 *
 * Ordered by last_seen_at because a bot that was renamed leaves its old row
 * behind; taking the newest keeps a rename from looking like an outage.
 */
export async function statusFor(botId) {
  try {
    const rows = await db()`
      SELECT bot_id, online, version, uptime_seconds, session_numbers,
             ip_address, devices_meta, last_seen_at
      FROM bot_status
      WHERE bot_id = ${botId}
      ORDER BY last_seen_at DESC
      LIMIT 1
    `;
    return rows.length ? rows[0] : null;
  } catch (err) {
    // Telemetry columns are created by the bot; before it has ever heartbeated
    // the wider SELECT can fail. Distinguish that from a genuinely missing bot
    // by falling back to the columns that always exist.
    try {
      const rows = await db()`
        SELECT bot_id, online, version, uptime_seconds, session_numbers, last_seen_at
        FROM bot_status
        WHERE bot_id = ${botId}
        ORDER BY last_seen_at DESC
        LIMIT 1
      `;
      return rows.length ? rows[0] : null;
    } catch (err2) {
      console.warn('[quartzxd][bots] could not read bot_status:', err2.message);
      return null;
    }
  }
}

/** Every bot with its live state, for the selector. */
export async function listBotsWithStatus() {
  const bots = await listBots();

  // One query for all of them, newest first, then first-wins per id — so the
  // selector costs a fixed two queries whether there is one bot or five.
  const byId = {};
  try {
    const rows = await db()`
      SELECT bot_id, online, session_numbers, last_seen_at
      FROM bot_status
      ORDER BY last_seen_at DESC
    `;
    for (const r of rows) {
      if (!Object.prototype.hasOwnProperty.call(byId, r.bot_id)) byId[r.bot_id] = r;
    }
  } catch (err) {
    console.warn('[quartzxd][bots] could not read bot_status:', err.message);
  }

  const withStatus = bots.map((b) => {
    const row = byId[b.id] || null;
    let count = 0;
    try {
      const parsed = JSON.parse((row && row.session_numbers) || '[]');
      if (Array.isArray(parsed)) count = parsed.length;
    } catch {}
    return {
      id: b.id,
      name: b.name,
      // A bot with no row has never reported in, which is not the same as
      // reporting that it is offline — both mean "cannot serve a pairing now",
      // and `known` lets the UI say which.
      known: !!row,
      online: !!(row && row.online),
      deviceCount: count,
    };
  });

  return { bots: withStatus, multiple: withStatus.length > 1 };
}
