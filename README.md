# livestream-frontend

Frontend for the hawolt livestreaming platform: stream explorer, viewer with chat, OBS chat overlay, embed player, user auth pages, and the user dashboard (stream settings, channel management, health telemetry).

Some dashboard tabs of the production deployment are not part of this repository; `src/dash/private/index.ts` is an empty loader registry the deployment replaces, and the dashboard skips any granted tab whose loader is absent.

## Layout

| Path | Purpose |
|---|---|
| `src/` | TypeScript sources, one entry point per page |
| `src/dash/` | Dashboard shell, shared runtime, and per-tab modules |
| `public/` | Page HTML at the root; build output lands here |
| `public/static/css/` | Stylesheets (shared.css, site.css, explore.css) |
| `public/static/img/` | Badge SVGs, favicon |
| `public/fonts/` | Self-hosted woff2 fonts |
| `public/panes/` | Dashboard tab HTML fragments |

## Building

Requires [Bun](https://bun.sh).

```bash
bun install
bun run build
```

Build outputs (`public/*.js`, `public/dash/`) are gitignored; a fresh checkout has no servable bundles until the build runs. Type-check with `bunx tsc --noEmit`.

The `/details` telemetry page the dashboard health tabs embed is not part of this repository; production deployments provide it separately.

## Conventions

See `CONVENTIONS.md`: no code comments, no em dash characters, names over annotations.
