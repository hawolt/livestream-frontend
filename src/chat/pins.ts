import { ctx } from "./context.ts";
import { pinnedEl } from "./dom.ts";
import { send } from "./connection.ts";
import { hasModRole } from "./members.ts";
import { jumpToMessage } from "./messages.ts";
import { buildRenderedBody } from "./render.ts";

export const pinnedMsgs = new Map<string, { from: string; text: string }>();
export const dismissedPins = new Set<string>();

export function addPin(msgid: string, from: string, text: string): void {
    pinnedMsgs.set(msgid, { from, text });
    renderPins();
}

export function removePin(msgid: string): void {
    pinnedMsgs.delete(msgid);
    renderPins();
}

export function clearPins(): void {
    pinnedMsgs.clear();
    renderPins();
}

export function renderPins(): void {
    pinnedEl.replaceChildren();
    const canMod = hasModRole();
    let shown = 0;
    for (const [msgid, p] of pinnedMsgs) {
        if (dismissedPins.has(msgid)) continue;
        shown++;
        const row = document.createElement("div");
        row.className = "live-chat-pin";
        const icon = document.createElement("span");
        icon.className = "live-chat-pin-icon";
        icon.textContent = "📌";
        const body = document.createElement("span");
        body.className = "live-chat-pin-body";
        body.title = "Jump to message";
        const who = document.createElement("b");
        who.textContent = p.from;
        body.append(who, document.createTextNode(": "), buildRenderedBody(p.text));
        body.addEventListener("click", () => jumpToMessage(msgid));
        const close = document.createElement("button");
        close.type = "button";
        close.className = "live-chat-pin-close";
        close.title = canMod ? "Unpin for everyone" : "Dismiss";
        close.textContent = "×";
        close.addEventListener("click", () => {
            if (canMod) {
                send(`PRIVMSG ${ctx.channel} :.unpin ${msgid}`);
            } else {
                dismissedPins.add(msgid);
                renderPins();
            }
        });
        row.append(icon, body, close);
        pinnedEl.appendChild(row);
    }
    pinnedEl.hidden = shown === 0;
}
