import { loadAds } from "../ads.ts";
import { ctx } from "./context.ts";
import { append } from "./messages.ts";
import { CHAT_AD_PACING, chatAdDue, type ChatAdState } from "./chat-ad-pacing.ts";

export { CHAT_AD_PACING, chatAdDue };
export type { ChatAdState };

export const chatAdState: ChatAdState = {
    messagesSinceAd: 0,
    lastAdAt: 0,
    dismissed: false,
    inFlight: false,
};

export function recordChatMessageForAds(): void {
    if (document.body.classList.contains("chat-popout")) return;
    if (chatAdState.lastAdAt === 0) chatAdState.lastAdAt = Date.now();
    chatAdState.messagesSinceAd++;
    if (!ctx.joined || !chatAdDue(chatAdState, Date.now())) return;
    chatAdState.inFlight = true;
    void showChatAd();
}

async function showChatAd(): Promise<void> {
    let ads: Awaited<ReturnType<typeof loadAds>> = [];
    try {
        ads = await loadAds("chatline");
    } finally {
        chatAdState.inFlight = false;
        chatAdState.messagesSinceAd = 0;
        chatAdState.lastAdAt = Date.now();
    }
    const ad = ads[0];
    if (!ad || !ctx.joined) return;
    const id = Number(ad.id);
    if (!Number.isInteger(id) || id < 0) return;
    const line = document.createElement("div");
    line.className = "live-chat-sys live-chat-ad";
    const tag = document.createElement("span");
    tag.className = "live-chat-ad-tag";
    tag.textContent = "Ad";
    const label = document.createElement("span");
    label.className = "live-chat-ad-label";
    label.textContent = ad.label || "Support the site with a cosmetic subscription.";
    const cta = document.createElement("a");
    cta.className = "live-chat-ad-cta";
    cta.href = `/api/live/spots/visit/${id}`;
    cta.target = "_blank";
    cta.rel = "noopener nofollow sponsored";
    cta.textContent = "Learn more";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "live-chat-ad-close";
    close.title = "Dismiss";
    close.setAttribute("aria-label", "Dismiss ad");
    close.textContent = "×";
    close.addEventListener("click", () => {
        chatAdState.dismissed = true;
        line.remove();
    });
    line.append(tag, label, cta, close);
    append(line);
}
