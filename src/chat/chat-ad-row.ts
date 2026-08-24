import { adVisitUrl, advertiserLine, currentAdLabel, trackAdImpression, type AdSpot } from "../ads.ts";
import { chatAdClickArmed } from "./chat-ad-pacing.ts";

export const CHAT_AD_HOUSE_LABEL = "Support the site with a cosmetic subscription.";

export function chatAdText(label: string, advertiserName: string): string | null {
    const text = label.trim();
    if (text) return text;
    return advertiserName.trim() ? null : CHAT_AD_HOUSE_LABEL;
}

export function buildChatAdRow(ad: AdSpot, id: number, channel: string, insertedAt: number, onDismiss: () => void): HTMLElement | null {
    const text = chatAdText(ad.label ?? "", ad.advertiserName ?? "");
    if (text === null) return null;
    const line = document.createElement("div");
    line.className = "live-chat-sys live-chat-ad";
    const tag = document.createElement("span");
    tag.className = "live-chat-ad-tag";
    tag.textContent = currentAdLabel("Ad");
    const label = document.createElement("span");
    label.className = "live-chat-ad-label";
    label.textContent = text;
    const byline = advertiserLine(ad.advertiserName);
    const advertiser = document.createElement("span");
    advertiser.className = "live-chat-ad-advertiser";
    advertiser.textContent = byline;
    advertiser.hidden = byline === "";
    const cta = document.createElement("a");
    cta.className = "live-chat-ad-cta";
    cta.href = adVisitUrl(id, channel);
    cta.target = "_blank";
    cta.rel = "noopener nofollow sponsored";
    cta.textContent = "Learn more";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "live-chat-ad-close";
    close.title = "Dismiss";
    close.setAttribute("aria-label", "Dismiss ad");
    close.textContent = "×";
    line.append(tag, label, advertiser, cta, close);
    const impression = trackAdImpression(line, id, channel, ad.token ?? "");
    cta.addEventListener("click", (event) => {
        if (chatAdClickArmed(insertedAt, Date.now())) return;
        event.preventDefault();
        impression.reportFastClick();
    });
    close.addEventListener("click", () => {
        impression.stop();
        line.remove();
        onDismiss();
    });
    return line;
}
