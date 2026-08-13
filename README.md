# livestream-frontend

Frontend for the itzon.tv livestreaming site. It provides every public surface of the site:

- a stream **explorer** with category browsing and hover previews
- a **channel viewer** with low-latency playback, DVR rewind, live chat, and clip playback (the same page also serves clip URLs)
- a dedicated **clip editor** page for creating a clip in a new tab
- an **embeddable player** for any channel
- a transparent **OBS chat overlay**
- user **auth pages** (login, register, email verify, password reset)
- a user **dashboard** (stream keys, channel settings, chat overlay builder, health telemetry, account settings)
- static **legal pages** and an **API documentation** page

Everything is plain TypeScript compiled by Bun, one entry point per page, no framework and no runtime dependencies, with one sanctioned exception: `hls.js` is reachable only from `src/live.ts`, `src/embed.ts`, and `src/clip-editor.ts` (the channel viewer, the embed player, and the clip editor's preview player; see ARCHITECTURE.md's player and clip editor sections). Bundling stays per entry, so `hls.js` lands only in `public/live.js`, `public/embed.js`, and `public/clip-editor.js`; every other page stays dependency-free.

The dashboard renders only the tabs it carries loaders for. If the signed-in session grants a tab this repo has no loader for, the sidebar shows a single external link in its place instead of a broken tab.

## Requirements and workflow

Requires [Bun](https://bun.sh).

```bash
bun install
bun run build
bunx tsc --noEmit
```

`bun run build` runs two steps:

- `build:pages` bundles each page entry (`explore`, `live`, `embed`, `chat-overlay`, `follow-alerts`, `user-login`, `register`, `verify`, `reset-password`, `legal`, `wiki`, `clip-editor`, `clip-embed`) to `public/<name>.js`
- `build:dash` bundles `src/dashboard.ts` to `public/dash/` with code splitting, so tab modules load on demand

Build outputs (`public/*.js`, `public/dash/`) are gitignored; a fresh checkout has no servable bundles until the build runs. Both build steps delete their previous output first, so stale bundles never accumulate.

## Layout

| Path | Purpose |
|---|---|
| `src/` | TypeScript sources, one entry point per page |
| `src/dash/` | Dashboard shared runtime (`session.ts`, `modal.ts`, `format.ts`, `regions.ts`, `dom.ts`, `activity-events.ts`, `overlay-shared.ts`) and per-tab modules (`tabs/`) |
| `public/` | Page HTML at the root; build output lands here |
| `public/panes/` | Dashboard tab HTML fragments, fetched on first tab activation |
| `public/static/css/` | Stylesheets (`shared.css`, `site.css`, `explore.css`) |
| `public/static/img/` | Badge SVGs and favicon |
| `public/fonts/` | Self-hosted woff2 fonts (Inter, JetBrains Mono) |

## Pages

| Page | Entry | HTML | What it does |
|---|---|---|---|
| Explorer | `src/explore.ts` | `explore.html` | Live stream and category grid at `/`, hover live previews |
| Channel viewer | `src/live.ts` | `live.html` | `/<username>`: WS+MSE playback for the `watch_ll` perk, HLS (hls.js or native Safari) via the BunnyCDN-fronted origin otherwise, DVR rewind (WS only), cinema mode, browse picture-in-picture, chat; also serves clip playback at `/<username>/clip/<code>` in a reduced clip mode |
| Chat client | `src/live-chat.ts` | (part of `live.html`) | IRC over WebSocket: badges, 7TV emotes, replies, mentions, whispers, pins, moderation actions |
| Embed player | `src/embed.ts` | `embed.html` | `/embed/<username>`: minimal muted-autoplay player (same WS/HLS transport selection as the channel viewer), click to unmute, preview mode for the explorer |
| Chat overlay | `src/chat-overlay.ts` | `chat.html` | `/chat/<username>`: transparent read-only chat for OBS browser sources, styled via URL params |
| Follow alerts | `src/follow-alerts.ts` | `alerts.html` | `/alerts/<username>`: transparent OBS overlay popping up an animated card on new follows |
| Login | `src/user-login.ts` | `user-login.html` | Sign in, forgot-password flow, lockout countdown, `?return=` redirect |
| Register | `src/register.ts` | `register.html` | Account creation behind an invisible hCaptcha |
| Verify | `src/verify.ts` | `verify.html` | Consumes the emailed verification token |
| Reset password | `src/reset-password.ts` | `reset-password.html` | Consumes the emailed reset token |
| Dashboard | `src/dashboard.ts` | `dashboard.html` | Tab shell at `/dashboard/<tab>`; tabs in `src/dash/tabs/` |
| API docs | `src/wiki.ts` | `wiki.html` | Hash-routed topic sections with a generated sidebar |
| Legal | `src/legal.ts` | `terms.html`, `privacy.html`, `impressum.html` | Static pages, navbar only |
| Clip editor | `src/clip-editor.ts` | `clip-editor.html` | `/clip/create?channel=<name>`: dedicated clip creation page opened in a new tab, plays a pinned window through an `hls.js`-backed HLS VOD player (one of the repo's three sanctioned `hls.js` entries), in/out selection, submits and polls until the clip is ready at `/<channel>/clip/<code>` |
| Clip embed | `src/clip-embed.ts` | `clip-embed.html` | `/embed/clip/<channel>/<code>`: minimal cross-origin player X (Twitter) loads as its player-card iframe, native controls, muted autoplay, poster from `thumbnailUrl`, a small corner link to the full clip page |

The dashboard health tabs embed a `/details` telemetry page in an iframe. That page is not part of this repository; production deployments provide it separately, and without it those tabs show their loading state indefinitely.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how each page works internally, the shared runtime, and the endpoints the client calls.

## Conventions

See `CONVENTIONS.md`, which applies to every file including markdown: no code comments, no em dash characters, self-explanatory names instead of annotations.

## Contributing

1. Fork and branch.
2. Make your change in `src/` (and `public/` for HTML/CSS/panes).
3. Build and type-check: `bun run build` and `bunx tsc --noEmit`. Both must pass; the project compiles under `strict`.
4. Follow `CONVENTIONS.md`. Do not add comments, even in changed code you did not write; delete comments you encounter in files you edit.
5. Open a pull request against this repository with a short description of the behavior change.
