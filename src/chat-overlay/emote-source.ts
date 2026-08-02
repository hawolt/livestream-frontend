import type { ChatEmoteScope } from "../chat-emotes.ts";
import { EMOTE_SET_URL, ctx, emotes } from "./context.ts";
import { refreshEmoteRendering } from "./render.ts";

async function loadEmoteSet(url: string, scope: ChatEmoteScope): Promise<void> {
    try {
        const res = await fetch(url, { referrerPolicy: "no-referrer" });
        if (!res.ok) return;
        const payload: any = await res.json();
        const list = scope === "channel" ? payload?.emote_set?.emotes : payload?.emotes;
        emotes.replace(scope, list);
        refreshEmoteRendering();
    } catch {}
}

async function loadChannelEmoteSet(user: string): Promise<void> {
    try {
        const res = await fetch(`/api/live/channel/${encodeURIComponent(user)}`);
        if (res.ok) {
            const info: any = await res.json();
            if (info && typeof info.emoteTwitchId === "string") ctx.channelEmoteTwitchId = info.emoteTwitchId;
        }
    } catch {}
    if (!ctx.channelEmoteTwitchId) return;
    const url = `https://7tv.io/v3/users/twitch/${encodeURIComponent(ctx.channelEmoteTwitchId)}`;
    await loadEmoteSet(url, "channel");
}

export async function loadChannelEmotes(user: string): Promise<void> {
    await Promise.all([
        loadEmoteSet(EMOTE_SET_URL, "global"),
        loadChannelEmoteSet(user),
    ]);
}
