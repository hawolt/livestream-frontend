# Architecture

How each page in this repo works, based on the code in `src/` and `public/`. Every page is an independent Bun bundle loaded by its own HTML file; there is no router and no shared framework, only a handful of shared modules.

All API descriptions in this document are from the client's perspective: the request this code sends and the response fields this code reads.

## Shared runtime

### `src/api.ts`

- `API_BASE = "/api/main/v1"`. `apiFetch(path, init)` rewrites a leading `/api/` in the path to `API_BASE`, sends JSON, and throws an `Error` with a `.status` field on non-2xx responses (reading `{error}` from the body when present). `204` and empty bodies resolve to `undefined`.
- Declares the response shapes the dashboard consumes: `AccountSettings`, `LiveInfo`, `LiveCategory`, `LiveBan`, `LiveMod`, `RegionOption`.

### `src/dash/core.ts` (dashboard runtime)

- The session token lives in `sessionStorage` under `dash_token` (`token()` / `setToken()`), the session kind under `dash_kind`.
- `bootstrapSessionFromCookie()` calls `GET /api/auth/session` and, if it returns `{token, kind}`, stores both. This is how a session established elsewhere on the site (via the session cookie) is picked up without a login form.
- `authFetch()` wraps `apiFetch` with a `Bearer` header; a 401 or 403 triggers `logoutRedirect()` (best-effort `POST /api/auth/logout`, clear storage, `location.replace("/login")`).
- `loadRegions()` fetches `GET /api/regions` once and caches the `{regions: [{id, label}]}` list for the session.
- Also home to the modal (`openModal`/`closeModal` with focus trap and focus restore), `esc()` HTML escaping, secret masking, copy/reveal button wiring, and date/uptime formatters.

### `src/nav.ts` (site navbar)

`initSiteNav(active, pageControls?)` runs on every page with a navbar:

- Marks the active nav item (`markActive`), inserts the kebab menu (API `/wiki`, Terms `/terms`, Privacy `/privacy`), and appends Discord/GitHub icon links.
- Fetches `GET /api/auth/session` with credentials. A `kind === "user"` session renders the gear account menu (username, Dashboard link, Sign out); otherwise Login and Sign up links carrying `?return=<current URL>`.
- Sign out posts `/api/auth/logout` with the session token, clears `dash_token`/`dash_kind`, and reloads.
- Builds a hamburger menu that mirrors the page's own control buttons (`pageControls`): it clones each visible `HTMLButtonElement` as a menu item that forwards the click and rebuilds itself, so labels stay current. `setBurgerExtra()` lets a page (the dashboard) prepend its own items.

### `src/storage.ts`

`readLocalStorage` / `writeLocalStorage` / `removeLocalStorage`: localStorage wrappers that swallow exceptions (private browsing, blocked storage).

### `src/captcha.ts` (viewer captcha gate)

Used only by the viewer and embed player. `getCaptchaToken()`:

1. Fetches `GET /api/live/captcha/config` once; `{enabled, sitekey}`. Disabled or missing sitekey means every call resolves to `""` and nothing else happens.
2. Loads the Cloudflare Turnstile script, renders an `interaction-only` widget, and on success posts the provider token to `POST /api/live/captcha/token`, caching the returned `{token, ttl}` until 60 s before expiry. Failures resolve to `""` (fail-open on the client).

The widget container is normally invisible. `setCaptchaAnchor(el)` picks where an escalated interactive challenge appears: it is prepended into the anchor as an in-flow row (the viewer anchors the chat column), or falls back to a fixed top-right position when no usable anchor exists. A `ResizeObserver` styles the container only once the widget actually expands past 20 px, so the invisible auto-pass leaves no empty strip. `captchaQuery()` returns `"&t=<token>"` for splicing onto media URLs; `warmCaptcha()` pre-solves in the background.

## Explorer (`src/explore.ts`)

State is `mode` (`"streams" | "categories"`) plus an optional category selector, driven entirely by the URL (`/?category=<id>`, `/?category=none` for uncategorized, anything else renders a not-found view). Mode switches and category drill-downs `pushState`; `popstate` restores state, so back/forward work.

- **Polling**: `GET /api/live/explore` every 10 s. The response provides `streams` (`username`, `title`, `category`, `categoryId`, `viewers`, optional per-stream `mediaBase`), `categories` (`id`, `name`, `liveStreamCount`, `viewerCount`), and a default `mediaBase`. A request-id guard drops responses that arrive after a newer one was applied.
- **Stream cards** are cached per username and updated in place across polls (title, category tag, viewer count); a card leaving the live set is dropped from the cache. Cards are sorted by viewers.
- **Thumbnails** load from `<mediaBase>/thumb/<username>.jpg?t=<minute>`: the URL only changes once per minute, and `img.src` is only reassigned when the computed URL differs, so thumbnails do not flicker on every poll. Broken images hide themselves.
- **Hover live preview**: on devices matching `(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)`, hovering a card's thumbnail for 300 ms overlays an iframe of `/embed/<username>?preview=1`. The embed reports its state back via `postMessage` (`hawolt:stream-preview`, states `connecting`/`playing`/`unavailable`), which drives the card's status chip. Grid re-renders are deferred while a preview is active and applied when it ends; previews stop on pointer leave, page hide, or tab visibility loss.
- **Category mode** renders category cards (plus a synthetic "No category" card when uncategorized streams exist), sorted by summed viewers; clicking one drills into its stream list.
- **Framed mode**: when the page detects it is inside an iframe (or `?framed=1`), it skips the navbar, adds `explore-framed`, and stream card links get `target="_top"`. This is what the viewer's browse mode embeds.

## Channel viewer (`src/live.ts`)

Boot: the username is the first path segment, lowercased and validated against `^[a-z0-9_-]{3,32}$` (invalid means a terminal "No channel" state). `GET /api/live/channel/<username>` supplies `title`, `category`, `categoryId`, `mediaBase`, and `emoteTwitchId`; a 404 is terminal. Chat starts regardless of playback. `?chat=popout` puts the page in popout mode: chat only, no player boot, no layout persistence.

### Transport selection

- `MediaSource` supported: `transportKind = "ws"` (primary path).
- Otherwise, if `video.canPlayType("application/vnd.apple.mpegurl")`: `transportKind = "hls"` (native HLS, in practice Safari).
- Neither: terminal "Playback not supported". A mid-stream MSE failure (`NotSupportedError`, unsupported codec string) also falls back to HLS when available.

### Lifecycle

Player state is one of `offline`, `connecting`, `buffering`, `playing`, `reconnecting`, plus a terminal flag for unrecoverable cases. Every transport attempt bumps a generation counter; all async callbacks check `isCurrent(gen)` so a torn-down attempt cannot mutate the current one. Per-generation listeners are registered through `track()` and removed by `fullTeardown()`, which also closes the socket, drops the SourceBuffer, clears the append queue, and blanks the video element.

Retries use exponential backoff (1 s doubling to 15 s, reset on successful playback or on the first transition into offline). Before each retry the channel API is re-fetched (at most every 30 s) to pick up a changed `mediaBase`. A health timer (5 s, only while the tab is visible) restarts the transport when media stops arriving or playback stops progressing for 15 s while "playing", or when a non-playing state is stuck for 20 s. `visibilitychange`, `online`, and fullscreen settle also trigger a health check; `pagehide` tears down and `pageshow` (including back/forward cache restores) rebuilds.

### WS+MSE path

The socket URL is `<mediaBase as ws(s)>/ws/live?u=<username>&viewer_id=<id><captcha>`. The first text frame is JSON carrying `codecs` (used to build the `video/mp4; codecs="..."` SourceBuffer), plus optional `viewers`, `started` (drives the uptime readout), `width`/`height`/`fps` (seed the quality readout). Later text frames update the viewer count. Binary frames are fMP4 chunks pushed through an append queue into a single `segments`-mode SourceBuffer.

Close codes: `4404` means the channel is offline (retry loop with poster), `1000` means the stream ended (same), `4408` means the server dropped this viewer for falling behind (one immediate reconnect, then backoff), anything else is a reconnect with backoff.

A 500 ms chase timer manages latency: playback starts 0.8 s behind the live edge once enough is buffered; a gap over 1.3 s plays at 1.08x until it closes, a gap over 6 s snaps to the edge.

### DVR rewind (WS only)

The SourceBuffer keeps up to 300 s behind the playhead. Once at least 10 s is buffered, a seek bar appears with a draggable thumb, a "-m:ss" behind-live readout, and a LIVE / GO LIVE chip. Seeking more than 2 s behind the edge sets `behindLive`, which suspends the latency chase and edge snapping; a guard nudges the playhead forward if pruning approaches it. GO LIVE snaps back to the edge at rate 1. `QuotaExceededError` on append trims to the DVR horizon first and halves the kept window toward a 5 s floor only on repeated failures, restoring 300 s after a clean append. The DVR window is only what this client has received since connecting.

### Native HLS path

Sets `video.src = <mediaBase>/hls/<username>/live.m3u8` (after obtaining a captcha token so its cookie is in place) and listens for `playing`/`ended`. Since HLS fetches do not pass through this code, a viewer-presence beacon posts `<mediaBase>/hls/<username>/beat?id=<viewer id>` every 10 s. The viewer id is a random 16-hex value persisted in localStorage (`live_hid`) and also sent on the WS URL. The seek bar never shows on this path.

### Layout and modes

- **Layout**: `auto | horizontal | vertical`, cycled by a navbar button and persisted (`live-layout`); auto derives vertical from `(max-width: 900px) and (orientation: portrait)`. `syncLayout()` is the single function applying it, re-run on resize, orientation change, visual viewport resize, and after fullscreen exits settle (two rAFs plus a 120 ms timeout).
- **Chat column**: `fitChat()` sizes chat (300 to 560 px) so the video fills the remaining width at its real aspect ratio; collapsed state persists (`live-chat-collapsed`), side persists (`live-chat-side` toggles `body.chat-left`), and a chat fullscreen mode exists for mobile (native fullscreen when available, CSS lock otherwise).
- **Cinema mode**: a pure CSS body class hiding navbar and info bar; hidden and auto-exited in vertical layout and popout; Escape exits; never touches the Fullscreen API.
- **Browse picture-in-picture**: clicking Browse or the brand while actively watching intercepts navigation. The page `pushState`s to `/`, shows a full-viewport iframe of `/?framed=1`, and CSS shrinks the same stage (same video element, same socket, no interruption) into a mini player. The mini player's close button parks the player (full teardown, offline state, no retry scheduling); returning to the channel un-parks it and resumes the normal reconnect lifecycle. `popstate` re-syncs the mode for back/forward.
- **Viewer count** renders as a per-digit odometer; **uptime** ticks from the join frame's `started`; **fps** is measured client-side from `getVideoPlaybackQuality()` deltas over media time.
- **Controls**: play/pause, mute, volume slider (hidden on iOS and anywhere volume writes do not stick, probed by `volumeIsSettable()`), fullscreen with WebKit fallbacks down to `video.webkitEnterFullscreen()`, keyboard shortcuts (Space, M, F) when no interactive element has focus, tap-to-reveal controls with a 3 s fade on touch, and tap-to-unmute on the stage.

## Chat client (`src/live-chat.ts`)

Started by the viewer via `startChat(username, emoteTwitchId)`. Speaks the IRC line protocol over a WebSocket to `/ws/irc` on the page origin, one or more `\r\n`-separated lines per text frame.

### Connection and identity

On open the client sends `CAP REQ :message-tags echo-message draft/message-redaction`, then `NICK`/`USER` with a guest nick bid (a stored `guest_<8hex>` value under `live-chat-guest-nick`, generated if absent; a legacy key is migrated once). The server is the sole nick authority: the confirmed nick is read back from `001`, persisted only if it matches the guest pattern, and then the client joins `#<username>`. Signed-in state is checked separately via `GET /api/auth/session`; the session cookie also rides the WebSocket handshake, which is how an account gets its real name.

Reconnects: 5 s normally, 30 s after a flood kill (close 4400) or while banned, and a "Chat is open in too many windows." message plus 30 s on close reason `session-limit`. Close codes 4400/4401/4402/1009 render explanatory system lines. A new connection resets all member/role/pin state.

### Composer states

`updateComposer()` picks one of: disabled input before the own-JOIN echo arrives; a full-width "Log in to chat" link (with `?return=`) when the user is a guest (not signed in, or carrying the guest `?` prefix); an enabled textarea placeholder "Chat as <nick>" otherwise; and a terminal banned state (474 or being KICKed) that hides everything, closes the socket, and only retries slowly. The composer is a textarea that auto-grows to 120 px; Enter sends, Shift+Enter inserts a newline.

### Members, roles, badges

`NAMES` (353) replies and JOIN/PART/QUIT/KICK/MODE maintain the member map. A name's leading prefix run encodes roles: `@` owner, `%` staff, `&` bot, `+` mod, `~` VIP, `=` unverified account, `?` guest. Badges stack in the order staff, owner (computed as name equals channel), bot, mod, VIP, unverified, rendered from `public/static/img/badge-*.svg`. `MODE +v/-v` toggles mod, `+V/-V` toggles VIP. The viewer list panel (cog button) replaces the chat body and buckets members Staff / Broadcaster / Bots / Moderators / VIPs / Users / Guests; a help panel (`?` button) shows a static command reference, and the two panels are mutually exclusive.

### Messages

- Incoming `PRIVMSG` to the channel renders nick (colored by a per-user `color` tag when present, else a name-hash HSL color), badges, and the body. A `PRIVMSG` to any other target renders as a whisper line (outgoing `↪ <to>` or incoming `<from> whispers`).
- The body renderer splits on whitespace and per token emits: a 7TV emote image, a `@mention` span, a safe link anchor (`http(s)` only via `new URL`, `rel="noopener noreferrer nofollow ugc"`, no referrer, trailing punctuation and unbalanced closing brackets split off), or plain text. Everything is DOM-built; no innerHTML for user content.
- **Zero-width emotes**: every rendered emote is wrapped in an inline stack; a zero-width emote (7TV flag bit 0 or data flag bit 8) following another emote is absolutely centered on top of that stack.
- **Echo and local echo**: with `echo-message` acked, the server's tagged copy renders (carrying `@msgid`); otherwise the client echoes locally, except for messages the server intercepts (whispers always, any dot-command when the sender has a mod role).
- **Replies**: hover actions include a reply button that sets a reply bar; sending prepends `@+reply=<msgid>`. Incoming replies render a clickable quote of the parent (looked up by `data-msgid`, scroll-and-flash on click); a reply to you or an `@you` mention highlights the line.
- **Moderation**: with the redaction cap acked and a mod role, the message list gains hover delete (sends `.delete <msgid>`) and pin (sends `.pin <msgid>`) buttons; regular users get delete only on their own messages. An incoming `REDACT` rewrites the target line to a `<deleted message>` placeholder that keeps nick and badges but is no longer replyable. Messages tagged `automod=1` are shadow copies only mods receive; they render dimmed with a "blocked" chip, and are dropped entirely in popout mode.
- **Pins**: `PIN`/`UNPIN` lines maintain a multi-pin bar above the messages; each row jumps to the message on click; the close button unpins for everyone when the viewer is a mod, else dismisses locally.
- The DOM keeps at most 200 messages and auto-scrolls only when already at the bottom.

### Emotes and autocomplete

7TV global emotes load from `https://7tv.io/v3/emote-sets/global`; when the channel API provided `emoteTwitchId`, the channel's borrowed set from `https://7tv.io/v3/users/twitch/<id>` is merged on top. An emote picker (grid with filter) inserts at the caret. Autocomplete triggers on `:prefix` (emotes), `@prefix` (members), or a bare first argument after `.ban .unban .timeout .mod .unmod .vip .unvip .whisper .w` (members without the `@`); Tab/arrows cycle, Enter accepts the highlighted entry or sends.

## Embed player (`src/embed.ts`)

A reduced viewer for `/embed/<username>`: same generation-guarded transport machinery (WS+MSE primary, native HLS fallback, channel API for `mediaBase`, captcha, viewer-id beacon on HLS, backoff retries, pagehide/pageshow handling) but no chat, no seek bar, no health timer, a 30 s buffer, and a simple offline poster. Autoplays muted; a click on the unmute button or anywhere on the stage unmutes.

`?preview=1` puts it in preview mode for the explorer's hover previews: the unmute button is suppressed and state transitions are reported to the parent window via `postMessage` with type `hawolt:stream-preview` and state `connecting`, `playing`, or `unavailable`.

## OBS chat overlay (`src/chat-overlay.ts`)

`/chat/<username>` renders a transparent, read-only chat for use as an OBS browser source. It connects to `/ws/irc` as a fresh random guest, requests only `message-tags draft/message-redaction`, joins the channel, and renders `PRIVMSG` lines with the same badge and zero-width-emote logic as the main client. It sends nothing but the registration handshake, `PONG`, `JOIN`, and `NAMES`; NOTICEs are never rendered; a `REDACT` removes the line entirely (unlike the viewer's placeholder). Reconnects every 5 s, or 30 s after a 474/KICK.

URL parameters:

| Param | Effect |
|---|---|
| `size=s\|l` | Smaller or larger text (default medium) |
| `fade=N` | Fade each message out after N seconds |
| `badges=0` | Hide badges |
| `emotes=0` | Disable emote rendering (skips the 7TV fetch) |
| `bg=1` | Dark background panel instead of transparency |
| `shadow=0` | Disable text shadow |
| `align=right` | Right-align messages |
| `demo=1` | No connection; loops a scripted set of sample messages (used by the dashboard's overlay preview) |

## Auth pages

All four call `initSiteNav(null)` and talk to `API_BASE` directly.

- **Login** (`src/user-login.ts`): boots hidden; an existing valid `dash_token` or a cookie session (`GET /api/auth/session`, accepted only for `kind === "user"`) redirects immediately to the `?return=` target (validated same-origin http(s), no embedded credentials) or `/dashboard`. `POST /api/auth/login` with `{username, password}`; a 429 with `retryAfter` starts a visible lockout countdown; success stores `dash_token`/`dash_kind` and redirects. A forgot-password section posts `{email}` to `/api/auth/forgot-password` and always shows a neutral confirmation.
- **Register** (`src/register.ts`): same already-signed-in redirect logic. Submission runs an invisible hCaptcha (`hcaptcha.execute`, 20 s watchdog, reset on error/expiry); the resulting token is sent with `{username, password, email, captchaToken}` to `POST /api/auth/register`; success stores the token and redirects like login.
- **Verify** (`src/verify.ts`): reads `?token=`, calls `GET /api/auth/verify?token=`, and on `{ok}` logs out any stored session, then links and auto-redirects (2.5 s) to the sign-in page matching the returned account `kind` on the corresponding host.
- **Reset password** (`src/reset-password.ts`): reads `?token=`, validates the two password fields match, posts `{token, newPassword}` to `POST /api/auth/reset-password`, and on success shows a done section and redirects to `/login`.

## Dashboard

### Shell (`src/dashboard.ts`)

Boot sequence:

1. `initSiteNav("dashboard")`.
2. Session: use the stored `dash_token`, else `bootstrapSessionFromCookie()`; then `GET /api/auth/me` with the Bearer token (one cookie-bootstrap retry on failure); any dead end redirects to `/login`.
3. `me` provides `kind`, `username`, `flags`, `emailVerified`, and `tabs` (`[{id, label, pane, group?}]`), the sole source of which tabs exist. Boot also checks the session kind against the current hostname and redirects to the matching host when they disagree, preserving the requested tab; only `user` sessions are served by this dashboard.
4. Granted tabs are filtered to those with an entry in `TAB_LOADERS` (`stream`, `stream-manager`, `overlay`, `stream-health`, `stream-summary`, `settings`). Granted tabs without a local loader are not rendered as tabs; their presence makes the sidebar (and the mobile hamburger) show a single external link instead.
5. The sidebar is built with group headers (shown only when two or more distinct groups exist) plus a mobile toggle; `setBurgerExtra` injects the tab list into the shared navbar hamburger, as a one-open-at-a-time accordion when grouped.

Routing: the tab comes from `/dashboard/<tab>` (with `/dashboard.html/<tab>` and a legacy `#tab` hash fallback). `activateTab` fetches `/panes/<pane>.html` and dynamic-imports the tab module in parallel on first activation, inserts the pane, calls `init(pane)` once, then on every activation toggles pane visibility, calls the previous tab's `deactivate?()` and the new tab's `activate()`, and `pushState`s the URL. An activation sequence counter discards stale async completions; a failed load alerts and leaves the current tab. `popstate` re-activates from the URL; unknown or ungranted tabs normalize to the first granted tab via `replaceState`. Elements with `data-switch-tab` anywhere in the document switch tabs on click.

Tab modules export `init(pane)`, `activate()`, and optionally `deactivate()` (`TabModule` in `core.ts`). Panes live in `public/panes/<pane>.html` and contain only markup; all behavior is in the module.

### Tabs (`src/dash/tabs/`)

- **Stream** (`stream.ts`): loads `GET /api/live` (`LiveInfo`) and renders four cards. Ingest: RTMP URL, maskable stream key with rotate (`POST /api/live/rotate-key`), and, when `GET /api/regions` lists two or more regions, a region select that posts `{region}` to `/api/live/region` on change and re-renders the URLs. Playback: playback URL built from `ingestServer` plus `playbackKey` (rotate via `POST /api/live/playback-key/rotate`) and a public HLS playlist URL built from `mediaBase`. Channel: the public channel URL (or an explanation when the username cannot appear in a URL) and the 7TV borrow field posting `{twitch}` to `/api/live/emote-twitch`. Webhooks: start/end URLs saved via `PUT /api/live/webhooks`, signing secret with rotate (`POST /api/live/webhooks/rotate-secret`), and an integration modal documenting the delivery format (`X-Live-Signature`, `X-Live-Event-Id`, example payload).
- **Stream Manager** (`stream-manager.ts`): title and category editing (`GET /api/live` + `GET /api/live/categories`, saved via `PUT /api/live/info`), the moderator list (`GET /api/live/mods`, `DELETE /api/live/mods/{id}`), and the ban list (`GET /api/live/bans`, `DELETE /api/live/bans/{id}`; entries with `bannedByRank > 2` show as "Staff ban" without a remove button).
- **Overlay** (`overlay.ts`): a URL builder for the chat overlay. Controls map one-to-one to the overlay's URL params, the result is shown with a copy button, and a debounced (300 ms) preview iframe loads `/chat/<username>?...&demo=1` against a checkerboard or dark backdrop. `deactivate()` blanks the iframe.
- **Stream Health** (`stream-health.ts`) and **Stream Summary** (`stream-summary.ts`): fetch `GET /api/live` for `keyHash` and embed the `/details` page in an iframe (`#k=<keyHash>&n=<username>` plus `viewerEgress=1` for health, `charts=viewers` for summary). No `keyHash` shows a no-data state. The `/details` page itself is not part of this repository. An activation counter guards against stale async completions.
- **Settings** (`settings.ts`): account email (`GET/PUT /api/settings`, with verification banner and `POST /api/auth/resend-verification`), chat color (`PUT /api/settings/chat-color`, live preview), username change (`PUT /api/settings/username` with current password; the response's fresh token replaces the stored one; a 429 cooldown message renders muted; capitalization-only changes bypass the cooldown client-side), password change (`PUT /api/settings/password`, adopting a returned token), and the chat bot token card (`POST /api/settings/chat-bot-token/rotate`, with reveal/copy and connection instructions for the IRC endpoints).

## Endpoints the client calls

HTTP under `API_BASE = /api/main/v1` unless noted. Listed as consumed by this code.

| Endpoint | Used by | Client reads |
|---|---|---|
| `GET /auth/session` | nav, dashboard, login, register, chat | `{token, kind, username}` from the session cookie |
| `GET /auth/me` | dashboard, login, register | `{kind, username, flags, emailVerified, tabs}` |
| `POST /auth/login`, `POST /auth/register` | auth pages | `{token, kind}` or `{error, retryAfter}` |
| `POST /auth/logout` | nav, core, verify | fire and forget |
| `GET /auth/verify?token=` | verify | `{ok, kind, error}` |
| `POST /auth/forgot-password`, `POST /auth/reset-password` | auth pages | `{ok, error}` |
| `POST /auth/resend-verification` | settings | success/error |
| `GET /api/live/explore` (absolute path) | explorer | `{streams, categories, mediaBase}` |
| `GET /api/live/channel/<user>` (absolute path) | viewer, embed | `{title, category, categoryId, mediaBase, emoteTwitchId}`, 404 for no channel |
| `GET /api/live/captcha/config`, `POST /api/live/captcha/token` (absolute paths) | captcha | `{enabled, sitekey}`, `{token, ttl}` |
| `GET /live`, `PUT /live/info`, `POST /live/rotate-key`, `POST /live/playback-key/rotate`, `POST /live/region`, `POST /live/emote-twitch`, `PUT /live/webhooks`, `POST /live/webhooks/rotate-secret` | stream tabs | `LiveInfo` |
| `GET /live/categories`, `GET /live/mods`, `DELETE /live/mods/{id}`, `GET /live/bans`, `DELETE /live/bans/{id}` | stream manager | lists |
| `GET /regions` | stream tab | `{regions: [{id, label}]}` |
| `GET /settings`, `PUT /settings`, `PUT /settings/password`, `PUT /settings/username`, `PUT /settings/chat-color`, `POST /settings/chat-bot-token/rotate` | settings | `AccountSettings` and per-call results |

Media and chat transports (page or `mediaBase` origin):

| Endpoint | Used by |
|---|---|
| `WS /ws/live?u=&viewer_id=[&t=]` | viewer, embed (fMP4 over WebSocket) |
| `GET /hls/<user>/live.m3u8` | viewer, embed (native HLS fallback) |
| `POST /hls/<user>/beat?id=[&t=]` | viewer, embed (HLS viewer presence) |
| `GET /thumb/<user>.jpg` | explorer thumbnails |
| `WS /ws/irc` | chat client, chat overlay (IRC line protocol) |

Third-party: `7tv.io` (emote sets), `challenges.cloudflare.com` (Turnstile script), `js.hcaptcha.com` (registration captcha script, loaded by `register.html`).
