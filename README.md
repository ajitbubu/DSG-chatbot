# ID-PRIVACY® Chatbot Widget

Embeddable, self-contained chat widget (vanilla JS, no framework, no runtime
dependencies) for the Data Safeguard / ID-PRIVACY® site. Captures qualified leads
into Firebase and shows a short intro video at the top of the chat panel.

## Layout

| Path | Role |
|------|------|
| `idprivacy-chatbot.js` | **Source** — the widget. Edit this. |
| `cdn-deploy/DataSafeguard-webflow_540.mp4` | Compressed intro video (~1.7MB, 540×960). The single tracked copy. |
| `DataSafeguard-webflow_1080p.mp4` | Uncompressed master (git-ignored; re-encode source → cdn-deploy/). |
| `config.example.js` | Config template (safe to commit). |
| `config.local.js` | Real local config incl. Firebase URL (git-ignored). |
| `disposable-domains.js` | Optional extra disposable-email blocklist. |
| `index.html` | Local demo that loads the widget like production. |
| `intro-video-demo.html` | Standalone, single-file demo of the video panel. |
| `build.sh` | Copies the production files into `cdn-deploy/`. |
| **`cdn-deploy/`** | **Build output** that gets hosted (tracked in git). |
| `*.md` | Embed guide, payload spec, production checklist. |

## Local testing

Serve the folder and open `index.html`:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000/index.html
```

(First copy `config.example.js` → `config.local.js` and fill in your Firebase URL.)

## Build & deploy

The widget has no transpile step — the "build" just stages the deployable files in
`cdn-deploy/`:

```bash
./build.sh
```

Then publish `cdn-deploy/` to the CDN (currently **Netlify**, `dsg-chatbot.netlify.app`):
drag the `cdn-deploy/` folder into the site's **Deploys** tab. `cdn-deploy/_headers`
sets cache (`max-age` for JS, `immutable` for the video) and CORS.

Finally, embed on the Webflow site — see [WEBFLOW_EMBED.md](WEBFLOW_EMBED.md).

## Where data goes

- **Leads** → Firebase Realtime Database (`/leads`), via the `webhookUrl` POST.
- **Conversation state** → visitor `localStorage` (`idp_chatbot_session_v1`); never leaves the browser.

See [PRODUCTION_CHECKLIST.md](PRODUCTION_CHECKLIST.md) before going live.
