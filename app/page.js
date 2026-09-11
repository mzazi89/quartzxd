'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_MS = 4000;
const DEVICES_REFRESH_MS = 15000;

function formatNumber(n) {
  return String(n).replace(/(\d{3})(?=\d)/g, '$1 ');
}

function formatLastSeen(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const s = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return d.toLocaleDateString();
}

function formatUptime(sec) {
  if (!sec && sec !== 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const PAIR_TIMEOUT_MS = 90000;

export default function Home() {
  const [botOnline, setBotOnline] = useState(null);
  const [bots, setBots] = useState([]);
  const [botId, setBotId] = useState('');
  const [ip, setIp] = useState(null);
  const [botVersion, setBotVersion] = useState(null);
  const [botUptime, setBotUptime] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(true);

  const [number, setNumber] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | pairing | code | error
  const [code, setCode] = useState('');
  const [pairError, setPairError] = useState('');
  const [pairingNumber, setPairingNumber] = useState('');
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const pollRef = useRef(null);

  // Which bot the page is working with. Empty until /api/bots answers — with one
  // bot configured the selector never renders and every request goes out exactly
  // as it did before bots were selectable.
  const selectedBot = bots.find((b) => b.id === botId) || bots[0] || null;
  const botKey = selectedBot ? selectedBot.id : '';
  const multipleBots = bots.length > 1;

  const loadBots = useCallback(async () => {
    try {
      const res = await fetch('/api/bots', { cache: 'no-store' });
      const data = await res.json();
      if (data && Array.isArray(data.bots) && data.bots.length) {
        setBots(data.bots);
        // Keep the current choice if that bot still exists: a bot removed from
        // bot_profiles must not leave the page pointing at nothing.
        setBotId((prev) => (data.bots.some((b) => b.id === prev) ? prev : data.bots[0].id));
      }
    } catch (e) {
      // keep last known state
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const q = botKey ? `?bot=${encodeURIComponent(botKey)}` : '';
      const res = await fetch(`/api/devices${q}`, { cache: 'no-store' });
      const data = await res.json();
      if (data && Array.isArray(data.devices)) {
        setDevices(data.devices);
        setBotOnline(!!data.botOnline);
        setIp(data.ip || null);
        setBotVersion(data.version || null);
        setBotUptime(data.uptimeSeconds != null ? data.uptimeSeconds : null);
      }
    } catch (e) {
      // keep last known state
    } finally {
      setLoadingDevices(false);
    }
  }, [botKey]);

  useEffect(() => {
    loadBots();
    loadDevices();
    // Both on the same tick: the selector's online dots and the selected bot's
    // device list must never disagree about whether a bot is up.
    const t = setInterval(() => {
      loadBots();
      loadDevices();
    }, DEVICES_REFRESH_MS);
    return () => clearInterval(t);
  }, [loadBots, loadDevices]);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  async function startPair(e) {
    e.preventDefault();
    const digits = number.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      setPhase('error');
      setPairError('Enter a valid phone number (10–15 digits) — e.g. 254785016388.');
      return;
    }
    setPhase('pairing');
    setPairError('');
    setPairingNumber(digits);
    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // bot is omitted when there is only one — an untargeted row stays
        // claimable by any bot, which is what this posted before.
        body: JSON.stringify({ number: digits, bot: botKey || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase('error');
        setPairError(data.error || 'Failed to start pairing.');
        return;
      }
      pollCode(data.requestId);
    } catch (err) {
      setPhase('error');
      setPairError('Network error — check your connection and try again.');
    }
  }

  function pollCode(requestId) {
    if (pollRef.current) clearInterval(pollRef.current);
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      // Give the bot a bounded window to answer; surface a clear error after.
      if (Date.now() - startedAt > PAIR_TIMEOUT_MS) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setPhase('error');
        setPairError('The bot did not respond in time. Please try again.');
        return;
      }
      try {
        const res = await fetch(`/api/pair?requestId=${requestId}`);
        const data = await res.json();
        if (data.status === 'done') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          const c =
            data.result &&
            (data.result.code || data.result.pairingCode || data.result.pairing_code);
          if (c) {
            setCode(String(c));
            setPhase('code');
            loadDevices();
            setTimeout(() => {
              const el = document.getElementById('code-box');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          } else {
            setPhase('error');
            setPairError('The bot replied without a code. Please try again.');
          }
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPhase('error');
          setPairError(data.error || 'Pairing failed. Please try again.');
        }
      } catch (err) {
        // transient — keep polling
      }
    }, POLL_MS);
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  }

  async function deleteDevice(num) {
    if (
      !window.confirm(
        `Are you sure you want to remove device +${formatNumber(num)}?\n\nIt will be logged out of WhatsApp and its session wiped.`
      )
    )
      return;
    setDeleting(num);
    try {
      let res = await fetch('/api/device/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: num, bot: botKey || undefined }),
      });
      let data = await res.json();

      // Optional admin protection: if the site is configured with DELETE_PIN,
      // the API asks for it once — prompt and retry with the pin attached.
      if (res.status === 401 && data && data.pinRequired) {
        const pin = window.prompt('This action is protected. Enter the delete pin:');
        if (!pin) {
          setDeleting(null);
          return;
        }
        res = await fetch('/api/device/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-delete-pin': pin },
          body: JSON.stringify({ number: num, bot: botKey || undefined }),
        });
        data = await res.json();
      }

      if (!res.ok) {
        window.alert(data.error || 'Failed to delete device.');
      } else {
        // Optimistic UI: drop the card immediately, re-sync in the background.
        setDevices((prev) => prev.filter((d) => d.number !== num));
        setTimeout(loadDevices, 2000);
      }
    } catch (err) {
      window.alert('Network error while deleting.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <>
      {/* Ambient background — fixed layer, MUST be a sibling so its
          pointer-events:none never inherits into the content below */}
      <div className="ambient" aria-hidden="true" />
      <div className="wrap">
        <header className="site">
          <a className="brand" href="/">
            <span className="brand-mark">Q</span>
            <span>
              <span className="brand-name">
                QUARTZ <em>XD</em>
              </span>
              <span className="brand-sub">pairing station</span>
            </span>
          </a>
          <span className="pill">
            <span className={`dot ${botOnline === null ? 'offline' : botOnline ? 'online' : 'offline'}`} />
            {multipleBots && selectedBot ? `${selectedBot.name} · ` : ''}
            {botOnline === null ? 'BOT —' : botOnline ? 'BOT ONLINE' : 'BOT OFFLINE'}
          </span>
        </header>

        <section className="hero">
          <p className="kicker">WhatsApp · Multi-device · No login</p>
          <h1>
            Pair your number
            <br />
            <span className="gold">in seconds</span>
          </h1>
          <p>
            Get an 8-character pairing code from the QUARTZ XD engine, link it in WhatsApp, and
            watch your device go live — battery, charging and connection status included.
          </p>
        </section>

        <section className="card">
          <div className="card-title">
            <h2>Generate pairing code</h2>
            <span className="mono">POST /api/pair</span>
          </div>
          {/* Above the number deliberately: which bot you are pairing into
              decides where the code comes from, so it is the first decision.
              With one bot there is nothing to choose and this renders nothing. */}
          {multipleBots && (
            <div className="bot-switch">
              <span className="bot-switch-label">Bot</span>
              <div className="bot-switch-tabs" role="tablist" aria-label="Choose a bot">
                {bots.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    role="tab"
                    className="bot-tab"
                    aria-selected={selectedBot ? selectedBot.id === b.id : false}
                    disabled={phase === 'pairing'}
                    onClick={() => setBotId(b.id)}
                  >
                    {b.name}
                    <span
                      className={`dot ${b.online ? 'online' : 'offline'}`}
                      title={b.online ? 'Online' : b.known ? 'Offline' : 'Never seen'}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <form className="pair-row" onSubmit={startPair}>
            <input
              type="tel"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="Phone number — e.g. 254785016388"
              autoComplete="tel"
              inputMode="numeric"
              maxLength={15}
              disabled={phase === 'pairing'}
            />
            <button className="btn primary" type="submit" disabled={phase === 'pairing'}>
              {phase === 'pairing' ? (
                <>
                  <span className="spinner" /> Requesting…
                </>
              ) : (
                'Generate code'
              )}
            </button>
          </form>
          {botOnline === false && (
            <div className="notice">
              🔴 {multipleBots && selectedBot ? `${selectedBot.name} is` : 'The bot is'} currently
              offline — pairing will not work until it comes back. Devices below may be stale.
            </div>
          )}
          <p className="hint">
            Open <b>WhatsApp → Linked devices → Pair a device</b> and enter the code when it
            appears.
          </p>

          {phase === 'code' && (
            <div className="code-box" id="code-box">
              <div className="code">{code}</div>
              <div className="code-steps">
                <span className="step">1 · Open WhatsApp on the phone</span>
                <span className="step">2 · Linked devices</span>
                <span className="step">3 · Pair a device</span>
              </div>
              <button className="btn" onClick={copyCode}>
                {copied ? '✓ Copied' : 'Copy code'}
              </button>
              <p className="hint">
                Pairing +{formatNumber(pairingNumber)} — the code expires shortly.
              </p>
            </div>
          )}

          {phase === 'error' && <div className="error-box">⚠ {pairError}</div>}
        </section>

        <section className="card" style={{ marginTop: 22 }}>
          <div className="card-title">
            <h2>Paired devices</h2>
            <span className="mono">
              {multipleBots && selectedBot ? `${selectedBot.name} · ` : ''}
              {ip ? `bot ip ${ip}` : 'bot ip —'} · {devices.length} device{devices.length === 1 ? '' : 's'}
            </span>
          </div>
          {loadingDevices && devices.length === 0 ? (
            <div className="empty">
              <span className="spinner" /> Loading devices…
            </div>
          ) : devices.length === 0 ? (
            <div className="empty">
              No paired devices yet. Generate a code above to pair your first number.
            </div>
          ) : (
            <div className="device-grid">
              {devices.map((d) => (
                <div className="device" key={d.number}>
                  <div className="device-top">
                    <span className="device-number">+{formatNumber(d.number)}</span>
                    <span className={`badge ${d.online ? 'online' : 'offline'}`}>
                      <span className={`dot ${d.online ? 'online' : 'offline'}`} />
                      {d.online ? 'Online' : 'Offline'}
                    </span>
                  </div>
                  <div className="metrics">
                    <div className="metric">
                      <span className="k">Battery</span>
                      <span className={`v ${d.battery == null ? 'muted-v' : 'gold-v'}`}>
                        {d.battery == null ? '—' : `${d.battery}%`}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="k">Charging</span>
                      <span className={`v ${d.plugged == null ? 'muted-v' : d.plugged ? 'green-v' : ''}`}>
                        {d.plugged == null ? '—' : d.plugged ? '⚡ Yes' : 'No'}
                      </span>
                    </div>
                    <div className="metric">
                      <span className="k">IP</span>
                      <span className="v muted-v">{ip || '—'}</span>
                    </div>
                  </div>
                  <div className="device-footer">
                    <span className="last-seen">last seen {formatLastSeen(d.lastSeen)}</span>
                    <button
                      className="btn danger small"
                      onClick={() => deleteDevice(d.number)}
                      disabled={deleting === d.number}
                    >
                      {deleting === d.number ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="site">
          <span>
            QUARTZ XD — pairing station · part of the MZAZI TECH ecosystem
            {botUptime != null && (
              <span style={{ marginLeft: 8, opacity: 0.7 }}>
                · uptime {formatUptime(botUptime)}
                {botVersion ? ` · v${botVersion}` : ''}
              </span>
            )}
          </span>
          <span>
            <a href="https://mzazi.shop" target="_blank" rel="noreferrer">
              mzazi.shop
            </a>
          </span>
        </footer>
      </div>
    </>
  );
}
