import { loadAds, type AdSpot } from "../ads.ts";
import { ctx } from "./context.ts";
import { append } from "./messages.ts";
import { pinnedToLive } from "./scroll.ts";
import { buildChatAdRow } from "./chat-ad-row.ts";
import { CHAT_AD_PACING, chatAdDismissedUntil, chatAdDue, type ChatAdState } from "./chat-ad-pacing.ts";

export { CHAT_AD_PACING, chatAdDue };
export type { ChatAdState };

export const chatAdState: ChatAdState = {
    messagesSinceAd: 0,
    lastAdAt: 0,
    dismissedUntil: 0,
    inFlight: false,
};

export function chatAdChannel(): string {
    return ctx.channel.replace(/^#/, "");
}

export function recordChatMessageForAds(): void {
    if (document.body.classList.contains("chat-popout")) return;
    if (chatAdState.lastAdAt === 0) chatAdState.lastAdAt = Date.now();
    chatAdState.messagesSinceAd++;
    if (!ctx.joined || !chatAdDue(chatAdState, Date.now(), pinnedToLive())) return;
    chatAdState.inFlight = true;
    void showChatAd();
}

async function showChatAd(): Promise<void> {
    let ads: AdSpot[] = [];
    try {
        ads = await loadAds("chatline");
    } finally {
        chatAdState.inFlight = false;
        chatAdState.messagesSinceAd = 0;
        chatAdState.lastAdAt = Date.now();
    }
    const ad = ads[0];
    if (!ad || !ctx.joined || !pinnedToLive()) return;
    const id = Number(ad.id);
    if (!Number.isInteger(id) || id < 0) return;
    const row = buildChatAdRow(ad, id, chatAdChannel(), Date.now(), () => {
        chatAdState.dismissedUntil = chatAdDismissedUntil(Date.now());
    });
    if (row) append(row);
}
