# Setup and deployment

## Local quick start

Install Git and Node.js 22.14 or later; CI uses Node 22. macOS and Linux are the verified development targets. Windows/WSL testing is welcome. Python and Docker are needed only for optional model-server or audio-generation work.

```sh
git clone https://github.com/sulmatajb/paso.git
cd paso
npm ci
npm run build
npm run db:init
npm run dev
```

Open `http://127.0.0.1:5173`. The initial build generates the Worker configuration used to initialize local D1. `db:init` executes the checked-in SQL migrations against local storage in `.wrangler/state`; it never creates a remote database. Use it once on a **fresh** local database. It is not an idempotent migration runner.

Guest records are in the browser's IndexedDB. Development sign-in is available through the normal Account screen and uses the test identity `local_seedy`. It only operates on loopback in `npm run dev`. This permits account/sync development without an online account.

For later sessions, only `npm run dev` is needed. Stop the server with Ctrl+C. Keep the URL consistent: `localhost` and `127.0.0.1` have different browser storage origins.

## Community voice server

From the repository root:

```sh
cp .dev.vars.example .dev.vars
npm run dev
```

The example contains the non-secret ID `HUGGINGFACE_SPACE=bessi190/paso-voice-practice`. To use your own deployment, change it to `owner/space-name`. Restart after changes. No Hugging Face owner token is needed or accepted by this integration.

To confirm the local binding without spending GPU quota:

```sh
curl http://127.0.0.1:5173/api/account
```

The response should contain the selected `communitySpace` and `transcription`, `conversation`, and `voice` set to `true`. In the app, open **Speak → Conversations** and check **Community server ready**. This verifies configuration, not available GPU quota. The first real conversation also depends on Space availability.

Record a short message, stop, correct the transcript if necessary, then send it. Audio and text go to that public Space; read the [privacy policy](../PRIVACY.md). Free capacity is limited. A quota error preserves your reply for retry and links to the canonical Hugging Face page, where signed-in learners can use their own allowance.

To host the voice service yourself, follow [the Space guide](../self-host/huggingface/README.md). Upload only that folder. Choose hardware explicitly marked free. If free hardware is unavailable, stop; no paid hosting is required by this project.

## Other runtime configuration

Use `.dev.vars` for local Worker bindings. `.env.example` lists optional self-hosted inference settings; leave unused values unset. Do not commit `.dev.vars` or real `.env` files. [Cloudflare's local variable rules](https://developers.cloudflare.com/workers/local-development/environment-variables/) explain precedence.

| Variable                                                         | Purpose                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `HUGGINGFACE_SPACE`                                              | Public `owner/space`; takes priority over the other inference settings    |
| `CONVERSATION_URL`, `CONVERSATION_API_KEY`, `CONVERSATION_MODEL` | Authenticated chat endpoint; see [self-hosting](../self-host/SELFHOST.md) |
| `TRANSCRIPTION_URL`, `TRANSCRIPTION_API_KEY`                     | Authenticated recognition endpoint                                        |
| `VOICE_URL`, `VOICE_API_KEY`                                     | Authenticated text-to-speech endpoint                                     |

Only the public Space ID is sent to the browser. Provider keys stay on the Worker. Do not prefix secrets with `VITE_` or add them to client code. With all server settings unset, the app offers explicit on-device downloads; it does not download the chat model automatically.

## Production-build preview

```sh
npm run build
# On a fresh local database only:
npm run db:init
npm run preview -- --port 5173
```

Preview uses the production Worker, so the development sign-in is absent. For preview-only community configuration, pass the non-secret binding explicitly:

```sh
npm run preview -- --port 5173 --var HUGGINGFACE_SPACE:bessi190/paso-voice-practice
```

The preview command binds to `127.0.0.1`. Do not expose it as a public authentication service. Automated account tests send test identity headers only to this local Worker.

## Database changes

Change `db/schema.ts`, then run `npm run db:generate`. Review the generated SQL before applying it. For a database you have already initialized, apply **only the newly added migration**, for example:

```sh
# Replace the example filename with the actual newly generated file.
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/NEW_MIGRATION.sql
```

Never replay all SQL against an existing database or delete `.wrangler/state` to fix a migration without first preserving needed data. Browser course/progress migrations live separately in `src/storage.ts`; see [the content guide](courses.md).

## Hosting the full app

The voice Space and the learning app are separate deployments. A Space provides inference; it does not host Paso's courses, accounts, or progress database.

### Sites

Import this source as a **new** Site. The `.openai/hosting.json` template declares the `DB` D1 binding but deliberately has no deployment ID. Sites assigns a new project identity, provisions storage, applies checked-in migrations, and supplies Sign in with ChatGPT. Set inference variables in its server runtime settings, then build and deploy using that host's workflow. Do not reuse another maintainer's project identity.

### Other hosts

The frontend and API are built for a Worker runtime with D1. There is no supported static GitHub Pages deployment or one-click generic production account setup in this release.

Before deploying elsewhere:

1. Provision a D1 database, configure the `DB` binding for your own Worker, and apply the SQL migrations once using your deployment's migration tracking.
2. Replace `app/chatgpt-auth.ts` and reserved sign-in/out paths with a verified identity provider, or configure a trusted authentication gateway that strips client identity headers and makes the unprotected Worker unreachable.
3. Set the inference bindings, deploy over HTTPS, and test user isolation and sync with two distinct accounts.
4. Set a privacy policy appropriate to your host, retention/deletion process, and abuse/capacity controls before inviting learners.

These are integration requirements, not a claim that generic hosting is ready with `wrangler deploy`. The bundled development mock is not safe production authentication. See [SECURITY.md](../SECURITY.md).

## Verification

```sh
npm run check
npm test
npm run format:check
npm run build
# Fresh local DB only; omit if already initialized:
npm run db:init
npx playwright install chromium webkit
npm run test:e2e
```

Linux may also need `npx playwright install --with-deps chromium`. The default local suite runs Chromium on every platform and additionally WebKit on macOS. Playwright’s Linux WebKit build has no `MediaRecorder`; GitHub CI runs the complete WebKit recording journey on a standard macOS runner. Audio validation requires Python 3 and FFmpeg/ffprobe:

```sh
python3 scripts/audio/validate.py
```

Opt-in inference tests use real models and synthetic microphone audio, never a physical microphone:

```sh
# Downloads about 94 MB of recognition assets per fresh browser cache:
npm run test:speech
# Large local model download; compatible GPU and Chrome required:
npx playwright test -c playwright.models.config.ts
# Uses the selected Space's free allowance; not run by ordinary CI:
PASO_HF_SPACE=owner/space-name npx playwright test -c playwright.community.config.ts
```

The community-model command includes a WebKit recording case; on Linux add `--project=mobile-chromium`. Run its WebKit case on macOS.

Read [VERIFICATION.md](../VERIFICATION.md) before interpreting test results. Browser emulation does not substitute for real-device testing.

## Troubleshooting

| Symptom                                   | Check                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Missing `dist/server/wrangler.json`       | Run `npm run build` before initializing D1 or using preview.                                                                |
| `no such table`                           | Initialize the fresh local D1 database; ensure dev and preview use the same checkout/state.                                 |
| `table already exists` while initializing | Stop replaying migrations; the database was already initialized. Apply only pending SQL.                                    |
| Community server not shown                | Check `.dev.vars`, restart dev, and inspect `/api/account`. For preview use the explicit `--var` command above.             |
| Free allowance or queue error             | Wait for provider availability, or open the canonical Space using your own signed-in free allowance.                        |
| Sign-in does not work in preview          | Mock sign-in is development-only; production hosting must supply identity.                                                  |
| Microphone unavailable on a phone         | Microphone capture requires a supported browser, permission, and a secure HTTPS origin (loopback is the desktop exception). |
| Browser missing in tests                  | Run the Playwright browser installation command.                                                                            |
| Stale app after a new build               | Use the app's update notice. Keep guest backups before clearing site storage.                                               |
