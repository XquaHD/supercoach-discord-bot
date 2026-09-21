/**
 * Runs on a schedule (via GitHub Actions). Uses your captured access token
 * to call SuperCoach's own API directly (no browser needed) and posts to
 * Discord the moment the gameweek rolls over (LIVE/FINAL tags clear,
 * prices/BEs/projected price changes update).
 *
 * If SuperCoach eventually invalidates the token, this will fail with a
 * clear 401 error in the GitHub Actions log — see README.md "Session
 * expired?" for how to fix it.
 */

const fs = require('fs');

const AUTH_STATE_PATH = process.env.AUTH_STATE_PATH || 'auth_state.json';
const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH || 'snapshot.json';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const DISCORD_ROLE_ID = process.env.DISCORD_ROLE_ID || '1404052060009140364';
const API_BASE = 'https://www.supercoach.com.au/2026/api/epl/classic/v1';
const LOWEST_BE_COUNT = 20;

// A realistic browser User-Agent, since some APIs behind bot-protection
// reject requests that look like they're coming from a bare script.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function loadSnapshot() {
  if (fs.existsSync(SNAPSHOT_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

function saveSnapshot(snap) {
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snap, null, 2));
}

function money(n) {
  if (n == null) return 'n/a';
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return `${sign}£${Math.abs(n).toLocaleString()}`;
}

async function api(token, path) {
  const r = await fetch(API_BASE + path, {
    headers: { Authorization: 'Bearer ' + token, 'User-Agent': UA, Accept: 'application/json' },
  });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) {
      throw new Error(
        `Session expired or rejected (${r.status}) on ${path}. ` +
          'Redo the "Capture your session" steps in README.md and update the SUPERCOACH_AUTH_STATE_B64 secret.'
      );
    }
    throw new Error(`API ${path} failed: ${r.status}`);
  }
  return r.json();
}

async function postToDiscord(content) {
  const chunks = [];
  let rest = content;
  while (rest.length > 1900) {
    let idx = rest.lastIndexOf('\n', 1900);
    if (idx <= 0) idx = 1900;
    chunks.push(rest.slice(0, idx));
    rest = rest.slice(idx);
  }
  chunks.push(rest);

  for (const chunk of chunks) {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: chunk,
        allowed_mentions: { parse: ['roles'] },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Discord webhook failed: ${res.status} ${t}`);
    }
  }
}

async function main() {
  if (!DISCORD_WEBHOOK_URL) throw new Error('DISCORD_WEBHOOK_URL env var is not set.');
  if (!fs.existsSync(AUTH_STATE_PATH)) {
    throw new Error(
      `${AUTH_STATE_PATH} not found. Follow README.md "Capture your session" first and set up the secret/cache.`
    );
  }

  const { accessToken: token } = JSON.parse(fs.readFileSync(AUTH_STATE_PATH, 'utf8'));

  const settings = await api(token, '/settings?min=false');
  const comp = settings.competition;

  const round = comp.next_round;
  const players = await api(token, `/players?round=${round}&embed=notes,odds,player_stats,positions`);

  const prev = loadSnapshot();
  const rolledOver = !!prev && comp.next_round > prev.next_round;

  const lowestBe = players
    .filter((p) => p.active !== false)
    .map((p) => {
      const s = (p.player_stats && p.player_stats[0]) || {};
      return {
        name: `${p.first_name} ${p.last_name}`,
        team: p.team ? p.team.abbrev : '',
        price: s.price,
        price_change: s.price_change,
        be: s.be1,
        proj_price_change: s.ppc1,
      };
    })
    .filter((p) => p.be != null && p.price != null)
    .sort((a, b) => a.be - b.be)
    .slice(0, LOWEST_BE_COUNT);

  saveSnapshot({
    current_round: comp.current_round,
    next_round: comp.next_round,
    is_lockout: comp.is_lockout,
    checked_at: new Date().toISOString(),
  });

  if (!prev) {
    console.log('First run: baseline snapshot saved. No notification sent.');
    return;
  }

  if (rolledOver) {
    const lines = lowestBe.map(
      (p, i) =>
        `${i + 1}. **${p.name}** (${p.team}) — BE ${p.be} · £${(p.price || 0).toLocaleString()} (${money(
          p.price_change
        )}) · proj next ${money(p.proj_price_change)}`
    );

    const content = [
      `<@&${DISCORD_ROLE_ID}>`,
      `🔔 Tim Michell has finally woken up... SuperCoach has rolled over to Week ${comp.next_round}!`,
      `Lowest ${LOWEST_BE_COUNT} breakevens for the new round:`,
      '',
      ...lines,
    ].join('\n');

    await postToDiscord(content);
    console.log('Rollover detected — Discord notified.');
  } else {
    console.log(`No rollover yet (current_round=${comp.current_round}, next_round=${comp.next_round}).`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
