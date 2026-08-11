const TICK_MS = 250;

let deadline = 0;
let timer: number | null = null;
let currentTarget = "";

function bannerEl(): HTMLElement | null {
    return document.getElementById("live-raid-banner");
}

function remainingSeconds(): number {
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

function renderCountdown(): void {
    const count = document.getElementById("live-raid-count");
    if (count) count.textContent = String(remainingSeconds());
}

function stopTimer(): void {
    if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
    }
}

function joinRaid(): void {
    const target = currentTarget;
    hideRaidBanner();
    if (target) window.location.assign(`/${target}`);
}

function tick(): void {
    if (remainingSeconds() <= 0) {
        joinRaid();
        return;
    }
    renderCountdown();
}

export function showRaidBanner(target: string, seconds: number): void {
    const el = bannerEl();
    if (!el) return;
    currentTarget = target;
    deadline = Date.now() + seconds * 1000;
    const name = document.getElementById("live-raid-target");
    if (name) name.textContent = target;
    renderCountdown();
    if (!el.dataset["wired"]) {
        el.dataset["wired"] = "1";
        document.getElementById("live-raid-join")?.addEventListener("click", joinRaid);
        document.getElementById("live-raid-stay")?.addEventListener("click", hideRaidBanner);
    }
    el.hidden = false;
    stopTimer();
    timer = window.setInterval(tick, TICK_MS);
}

export function hideRaidBanner(): void {
    stopTimer();
    currentTarget = "";
    const el = bannerEl();
    if (el) el.hidden = true;
}
