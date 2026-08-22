import { API_BASE } from "../api.ts";
import { applyRedeemedBalance } from "../live/points.ts";
import { ctx, myNickLower } from "./context.ts";
import { inputEl } from "./dom.ts";
import { guests } from "./members.ts";
import { removeNotice, showNotice } from "./notices.ts";
import {
    armHighlight,
    canAfford,
    MAX_REDEEM_TEXT,
    parseChipBalance,
    parseViewerRewards,
    promptsForText,
    redeemRequestBody,
    redeemText,
    type ArmedHighlight,
    type ViewerReward,
} from "./redeem-wire.ts";

const REDEEM_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="8.5" width="17" height="4"/><path d="M5.5 12.5v7.5h13v-7.5M12 8.5v11.5M12 8.5c-1.8 0-4.4-.7-4.4-2.6 0-1.2 1-2 2.1-2 1.7 0 2.3 1.9 2.3 4.6zm0 0c1.8 0 4.4-.7 4.4-2.6 0-1.2-1-2-2.1-2-1.7 0-2.3 1.9-2.3 4.6z"/></svg>`;

const ARM_NOTICE_ID = "redeem-arm";
const ERROR_NOTICE_ID = "redeem-error";

let buttonEl: HTMLButtonElement | null = null;
let popEl: HTMLDivElement | null = null;
let outsideHandler: ((e: MouseEvent) => void) | null = null;
let armed: ArmedHighlight | null = null;
let redeemInFlight = false;

function channelName(): string {
    return ctx.channel.slice(1);
}

function eligible(): boolean {
    if (!ctx.joined || !ctx.isAccount || !ctx.accountSessionToken) return false;
    return !guests.has(myNickLower());
}

function showRedeemError(message: string): void {
    showNotice(ERROR_NOTICE_ID, (root) => {
        const text = document.createElement("span");
        text.textContent = message;
        root.appendChild(text);
    }, { ttlMs: 8000 });
}

async function fetchRewards(): Promise<ViewerReward[] | null> {
    const token = ctx.accountSessionToken;
    if (!token) return null;
    try {
        const res = await fetch(`${API_BASE}/points/${encodeURIComponent(channelName())}/rewards`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        return parseViewerRewards(await res.json());
    } catch {
        return null;
    }
}

async function postRedeem(rewardId: number, text?: string): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
    const token = ctx.accountSessionToken;
    if (!token) return { ok: false, error: "Log in to redeem rewards." };
    try {
        const res = await fetch(`${API_BASE}/points/${encodeURIComponent(channelName())}/redeem`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: redeemRequestBody(rewardId, text),
        });
        const data = await res.json().catch(() => null) as { ok?: unknown; balance?: unknown; error?: unknown } | null;
        if (res.ok && data && data.ok === true && typeof data.balance === "number") {
            return { ok: true, balance: data.balance };
        }
        const message = data && typeof data.error === "string" && data.error ? data.error : "Could not redeem right now.";
        return { ok: false, error: message };
    } catch {
        return { ok: false, error: "Could not redeem right now." };
    }
}

export function closeRedeemPop(): void {
    if (popEl) {
        popEl.remove();
        popEl = null;
    }
    if (outsideHandler) {
        document.removeEventListener("mousedown", outsideHandler);
        outsideHandler = null;
    }
    buttonEl?.classList.remove("active");
    buttonEl?.setAttribute("aria-expanded", "false");
}

export function isRedeemPopOpen(): boolean {
    return popEl !== null;
}

export function isHighlightArmed(): boolean {
    return armed !== null;
}

export function disarmHighlight(): void {
    armed = null;
    removeNotice(ARM_NOTICE_ID);
}

function showArmedNotice(reward: ArmedHighlight): void {
    showNotice(ARM_NOTICE_ID, (root) => {
        const text = document.createElement("span");
        text.textContent = `Your next message will be highlighted for ${reward.cost.toLocaleString()} points.`;
        root.appendChild(text);
        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "live-chat-pin-close";
        cancel.title = "Cancel";
        cancel.setAttribute("aria-label", "Cancel highlighted message");
        cancel.textContent = "✕";
        cancel.addEventListener("click", disarmHighlight);
        root.appendChild(cancel);
    });
}

function armForHighlight(reward: ViewerReward): void {
    const next = armHighlight(reward);
    if (!next) return;
    armed = next;
    showArmedNotice(next);
    closeRedeemPop();
    if (!inputEl.disabled) inputEl.focus();
}

function redeemCustom(reward: ViewerReward, row: HTMLButtonElement): void {
    if (redeemInFlight) return;
    redeemInFlight = true;
    row.disabled = true;
    void postRedeem(reward.id).then((result) => {
        redeemInFlight = false;
        if (!result.ok) {
            row.disabled = false;
            showRedeemError(result.error);
            return;
        }
        applyRedeemedBalance(channelName(), result.balance);
        closeRedeemPop();
    });
}

function renderPrompt(reward: ViewerReward, rewards: ViewerReward[]): void {
    const pop = popEl;
    if (!pop) return;
    const form = document.createElement("form");
    form.className = "live-chat-redeem-prompt";

    const title = document.createElement("div");
    title.className = "live-chat-redeem-prompt-title";
    title.textContent = reward.title;

    const input = document.createElement("input");
    input.type = "text";
    input.className = "live-chat-redeem-prompt-input";
    input.maxLength = MAX_REDEEM_TEXT;
    input.placeholder = "Your answer";
    input.autocomplete = "off";

    const error = document.createElement("div");
    error.className = "live-chat-redeem-prompt-error";

    const actions = document.createElement("div");
    actions.className = "live-chat-redeem-prompt-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "live-chat-redeem-prompt-cancel";
    cancel.textContent = "Back";
    cancel.addEventListener("click", () => renderRewardList(rewards));
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "live-chat-redeem-prompt-submit";
    submit.textContent = `Redeem for ${reward.cost.toLocaleString()}`;
    actions.append(cancel, submit);

    form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        if (redeemInFlight) return;
        const body = redeemText(input.value);
        if (!body) {
            error.textContent = `Enter 1 to ${MAX_REDEEM_TEXT} characters.`;
            return;
        }
        error.textContent = "";
        redeemInFlight = true;
        submit.disabled = true;
        void postRedeem(reward.id, body).then((result) => {
            redeemInFlight = false;
            if (!result.ok) {
                submit.disabled = false;
                showRedeemError(result.error);
                return;
            }
            applyRedeemedBalance(channelName(), result.balance);
            closeRedeemPop();
        });
    });

    form.append(title, input, error, actions);
    pop.replaceChildren(form);
    input.focus();
}

function buildRewardRow(reward: ViewerReward, balance: number | null, rewards: ViewerReward[]): HTMLButtonElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "live-chat-redeem-row";
    const title = document.createElement("span");
    title.className = "live-chat-redeem-title";
    title.textContent = reward.title;
    const cost = document.createElement("span");
    cost.className = "live-chat-redeem-cost";
    cost.textContent = reward.cost.toLocaleString();
    row.append(title, cost);
    if (!canAfford(reward.cost, balance)) {
        row.disabled = true;
        row.title = "Not enough points";
    }
    row.addEventListener("click", () => {
        if (reward.kind === "highlight") armForHighlight(reward);
        else if (promptsForText(reward)) renderPrompt(reward, rewards);
        else redeemCustom(reward, row);
    });
    return row;
}

function renderRewardList(rewards: ViewerReward[]): void {
    const pop = popEl;
    if (!pop) return;
    if (rewards.length === 0) {
        const empty = document.createElement("span");
        empty.className = "live-chat-redeem-empty";
        empty.textContent = "No rewards available";
        pop.replaceChildren(empty);
        return;
    }
    const balance = parseChipBalance(document.getElementById("live-chat-points-value")?.textContent);
    pop.replaceChildren(...rewards.map(reward => buildRewardRow(reward, balance, rewards)));
}

function renderPop(rewards: ViewerReward[]): void {
    if (!buttonEl) return;
    closeRedeemPop();
    const pop = document.createElement("div");
    pop.className = "live-chat-redeem-pop";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Redeem channel points");

    buttonEl.parentElement?.appendChild(pop);
    buttonEl.classList.add("active");
    buttonEl.setAttribute("aria-expanded", "true");
    outsideHandler = (e: MouseEvent): void => {
        const target = e.target as Node;
        if (pop.contains(target) || buttonEl?.contains(target)) return;
        closeRedeemPop();
    };
    document.addEventListener("mousedown", outsideHandler);
    popEl = pop;
    renderRewardList(rewards);
}

function togglePop(): void {
    if (popEl) {
        closeRedeemPop();
        return;
    }
    void fetchRewards().then((rewards) => {
        if (rewards) renderPop(rewards);
    });
}

export function syncRedeemPicker(): void {
    if (!buttonEl) return;
    const show = eligible();
    buttonEl.hidden = !show;
    if (!show) {
        closeRedeemPop();
        disarmHighlight();
    }
}

export function interceptComposerSubmit(text: string, onSent: () => void): boolean {
    const target = armed;
    if (!target) return false;
    if (redeemInFlight) return true;
    const body = redeemText(text);
    if (!body) return false;
    redeemInFlight = true;
    void postRedeem(target.rewardId, body).then((result) => {
        redeemInFlight = false;
        if (!result.ok) {
            showRedeemError(result.error);
            return;
        }
        applyRedeemedBalance(channelName(), result.balance);
        disarmHighlight();
        onSent();
    });
    return true;
}

export function initRedeemPicker(settingsBtn: HTMLButtonElement): void {
    if (buttonEl) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "btn-chat-redeem";
    btn.className = "live-chat-gear-btn";
    btn.title = "Redeem channel points";
    btn.setAttribute("aria-label", "Redeem channel points");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = REDEEM_ICON;
    btn.hidden = true;
    btn.addEventListener("click", togglePop);
    settingsBtn.parentElement?.insertBefore(btn, settingsBtn);
    buttonEl = btn;
    syncRedeemPicker();
}

export function destroyRedeemPicker(): void {
    closeRedeemPop();
    disarmHighlight();
    redeemInFlight = false;
    if (buttonEl) {
        buttonEl.remove();
        buttonEl = null;
    }
}
