import { ctx } from "./chat-overlay/context.ts";
import { connect } from "./chat-overlay/connection.ts";
import { startDemo } from "./chat-overlay/demo.ts";
import { loadChannelEmotes } from "./chat-overlay/emote-source.ts";
import { parseOverlayFont } from "./overlay-font.ts";
import { parseOverlaySize } from "./overlay-size.ts";

function parseParams(): void {
    const qs = new URLSearchParams(location.search);
    const size = parseOverlaySize(qs.get("size"));
    if (size) {
        if ("step" in size) document.body.dataset.size = size.step;
        else document.body.style.fontSize = `${size.px}px`;
    }
    const font = parseOverlayFont(qs.get("font"));
    if (font) document.body.style.fontFamily = font;
    const fadeSec = Number(qs.get("fade"));
    ctx.fadeMs = Number.isFinite(fadeSec) && fadeSec > 0 ? fadeSec * 1000 : 0;
    ctx.showBadges = qs.get("badges") !== "0";
    ctx.showEmotes = qs.get("emotes") !== "0";
    ctx.showSystem = qs.get("system") === "1";
    if (qs.get("bg") === "1") document.body.dataset.bg = "1";
    if (qs.get("shadow") === "0") document.body.dataset.shadow = "0";
    if (qs.get("align") === "right") document.body.dataset.align = "right";
    ctx.demoMode = qs.get("demo") === "1";
}

function boot(): void {
    const m = location.pathname.match(/^\/chat\/([A-Za-z0-9_-]{3,32})\/?$/);
    if (!m) return;
    ctx.channel = `#${m[1].toLowerCase()}`;
    parseParams();
    if (ctx.showEmotes) void loadChannelEmotes(m[1].toLowerCase());
    if (ctx.demoMode) startDemo();
    else connect();
}

boot();

export {};
