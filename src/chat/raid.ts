import { ctx } from "./context.ts";
import { send } from "./connection.ts";
import { removeNotice, showNotice } from "./notices.ts";

const TICK_MS = 250;

let deadline = 0;
let timer: number | null = null;
let currentTarget = "";
let raiderCount = 0;
let stayed = false;
let countdownEl: HTMLElement | null = null;
let countEl: HTMLElement | null = null;

export interface RaidHandover {
    begin(target: string): void;
    cancel(): void;
    join(target: string): boolean;
}

let handover: RaidHandover | null = null;

export function setRaidHandover(h: RaidHandover | null): void {
    handover = h;
}

function remainingSeconds(): number {
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function stopTimer(): void {
    if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
    }
}

function reset(): void {
    stopTimer();
    currentTarget = "";
    raiderCount = 0;
    stayed = false;
    countdownEl = null;
    countEl = null;
    removeNotice("raid");
}

function renderLive(): void {
    if (countdownEl) countdownEl.textContent = String(remainingSeconds());
    if (countEl) countEl.textContent = String(raiderCount);
}

function transfer(): void {
    const target = currentTarget;
    reset();
    if (!target) return;
    if (handover && handover.join(target)) return;
    window.location.assign(`/${target}`);
}

function tick(): void {
    if (remainingSeconds() <= 0) {
        transfer();
        return;
    }
    renderLive();
}

function onStay(): void {
    send(`PRIVMSG ${ctx.channel} :.raidstay`);
    stayed = true;
    stopTimer();
    handover?.cancel();
    removeNotice("raid");
}

function onJoin(): void {
    send(`PRIVMSG ${ctx.channel} :.raidjoin`);
    stayed = false;
}

function buildRaidNotice(root: HTMLDivElement): void {
    root.classList.add("live-chat-notice-raid");
    const body = document.createElement("span");
    body.className = "live-chat-pin-body";
    const name = document.createElement("b");
    name.textContent = currentTarget;
    const cd = document.createElement("span");
    cd.textContent = String(remainingSeconds());
    const cnt = document.createElement("span");
    cnt.textContent = String(raiderCount);
    countdownEl = cd;
    countEl = cnt;
    body.append(
        document.createTextNode("Raiding "),
        name,
        document.createTextNode(" in "),
        cd,
        document.createTextNode("s with "),
        cnt,
        document.createTextNode(" raiders"),
    );
    const actions = document.createElement("span");
    actions.className = "live-chat-notice-actions";
    const join = document.createElement("button");
    join.type = "button";
    join.className = "live-chat-notice-btn live-chat-notice-btn-primary";
    join.textContent = "Join";
    join.addEventListener("click", onJoin);
    const stayBtn = document.createElement("button");
    stayBtn.type = "button";
    stayBtn.className = "live-chat-notice-btn";
    stayBtn.textContent = "Stay";
    stayBtn.addEventListener("click", onStay);
    actions.append(join, stayBtn);
    root.append(body, actions);
}

export function showRaidStart(target: string, seconds: number, count: number): void {
    currentTarget = target;
    deadline = Date.now() + seconds * 1000;
    raiderCount = count;
    stayed = false;
    showNotice("raid", buildRaidNotice);
    renderLive();
    stopTimer();
    timer = window.setInterval(tick, TICK_MS);
    handover?.begin(target);
}

export function updateRaidCount(count: number): void {
    if (!currentTarget) return;
    raiderCount = count;
    renderLive();
}

export function raidGo(target: string): void {
    if (stayed) {
        reset();
        return;
    }
    currentTarget = target;
    transfer();
}

export function hideRaidBanner(): void {
    reset();
    handover?.cancel();
}
