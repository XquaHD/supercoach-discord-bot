/**
 * Converts a raw_session.json (downloaded by pasting a snippet into your
 * REAL Chrome's DevTools console — see README.md "Capture your session")
 * into auth_state.json, the file this project actually uses.
 *
 * Usage:
 *   node login_and_save_state.js
 *
 * (Expects raw_session.json to already be in this folder, e.g. moved here
 * from your Downloads folder.)
 */

const fs = require('fs');

const IN_PATH = 'raw_session.json';
const OUT_PATH = 'auth_state.json';

if (!fs.existsSync(IN_PATH)) {
  console.error(
    `\nCouldn't find ${IN_PATH} in this folder.\n\n` +
      'Follow the "Capture your session" steps in README.md first: open SuperCoach\n' +
      'in your normal Chrome (already logged in), paste the snippet into DevTools\n' +
      'Console, then move the downloaded raw_session.json into this folder.\n'
  );
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));

if (!raw.localStorage || !raw.localStorage['VMLS:news:accessToken']) {
  console.error('raw_session.json does not look right — missing the access token. Re-run the capture steps.');
  process.exit(1);
}

const accessToken = JSON.parse(raw.localStorage['VMLS:news:accessToken']);

const authState = {
  accessToken,
  capturedAt: new Date().toISOString(),
};

fs.writeFileSync(OUT_PATH, JSON.stringify(authState, null, 2));
console.log(`\nSaved ${OUT_PATH}.`);
console.log('Next: follow README.md to turn this into the SUPERCOACH_AUTH_STATE_B64 GitHub secret.');
console.log(`You can now delete ${IN_PATH} and ${OUT_PATH} from this folder — they're only needed to make the secret.`);
