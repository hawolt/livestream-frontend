import { API_BASE } from "./api.ts";
import { initSiteNav } from "./nav.ts";
import { reportVisit } from "./visit-beacon.ts";
import {
    byline, nextVote, optimisticScore, podium, rankLabel, remainder,
    scoreText, viewsText, weekRangeText, type WeekClip, type WeekResponse,
} from "./clips-week/view.ts";

const podiumEl = document.getElementById("cw-podium") as HTMLElement;
const restEl = document.getElementById("cw-rest") as HTMLElement;
const rangeEl = document.getElementById("cw-range") as HTMLElement;
const emptyEl = document.getElementById("cw-empty") as HTMLElement;
const errorEl = document.getElementById("cw-error") as HTMLElement;

let signedIn = false;

function element(tag: string, className?: string, text?: string): HTMLElement {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

const ARROW = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 15 12 9 18 15"/></svg>`;

function buildVoteControl(clip: WeekClip, onChange: (value: 1 | -1) => void): HTMLElement {
    const wrap = element("div", "cw-vote");
    const up = document.createElement("button");
    up.type = "button";
    up.className = "cw-vote-btn cw-vote-up";
    up.innerHTML = ARROW;
    up.setAttribute("aria-label", `Upvote ${clip.title}`);
    const score = element("span", "cw-vote-score", scoreText(clip.score));
    const down = document.createElement("button");
    down.type = "button";
    down.className = "cw-vote-btn cw-vote-down";
    down.innerHTML = ARROW;
    down.setAttribute("aria-label", `Downvote ${clip.title}`);
    wrap.append(up, score, down);

    const paint = () => {
        score.textContent = scoreText(clip.score);
        up.setAttribute("aria-pressed", String(clip.myVote === 1));
        down.setAttribute("aria-pressed", String(clip.myVote === -1));
        up.classList.toggle("on", clip.myVote === 1);
        down.classList.toggle("on", clip.myVote === -1);
    };
    paint();
    wrap.addEventListener("cw-repaint", paint);
    up.addEventListener("click", () => onChange(1));
    down.addEventListener("click", () => onChange(-1));
    return wrap;
}

async function castVote(clip: WeekClip, clicked: 1 | -1, control: HTMLElement): Promise<void> {
    if (!signedIn) {
        location.href = `/login?return=${encodeURIComponent(location.pathname)}`;
        return;
    }
    const previousVote = clip.myVote;
    const previousScore = clip.score;
    const value = nextVote(previousVote, clicked);
    clip.myVote = value;
    clip.score = optimisticScore(previousScore, previousVote, value);
    control.dispatchEvent(new Event("cw-repaint"));
    try {
        const token = sessionStorage.getItem("dash_token") ?? "";
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/live/clips/${encodeURIComponent(clip.id)}/vote`, {
            method: "POST",
            credentials: "include",
            headers,
            body: JSON.stringify({ value }),
        });
        const data = await res.json().catch(() => null) as { score?: number; myVote?: number } | null;
        if (!res.ok || !data || typeof data.score !== "number") throw new Error("vote failed");
        clip.score = data.score;
        clip.myVote = typeof data.myVote === "number" ? data.myVote : value;
    } catch {
        clip.myVote = previousVote;
        clip.score = previousScore;
    }
    control.dispatchEvent(new Event("cw-repaint"));
}

function buildPoster(clip: WeekClip, className: string): HTMLElement {
    const link = document.createElement("a");
    link.className = className;
    link.href = clip.url;
    if (clip.poster) {
        const img = document.createElement("img");
        img.src = clip.poster;
        img.alt = "";
        img.loading = "lazy";
        link.appendChild(img);
    } else {
        link.appendChild(element("span", "cw-poster-empty"));
    }
    return link;
}

function buildCard(clip: WeekClip, index: number, featured: boolean): HTMLElement {
    const card = element("article", featured ? `cw-card cw-card-${index + 1}` : "cw-row");
    const rank = element("span", "cw-rank", rankLabel(index));
    const poster = buildPoster(clip, featured ? "cw-poster" : "cw-poster cw-poster-small");
    const body = element("div", "cw-body");
    const title = document.createElement("a");
    title.className = "cw-title";
    title.href = clip.url;
    title.textContent = clip.title;
    const meta = element("div", "cw-meta", `${byline(clip)} · ${viewsText(clip.views)}`);
    body.append(title, meta);
    if (clip.mature) body.appendChild(element("span", "cw-mature", "Mature"));
    let control: HTMLElement;
    control = buildVoteControl(clip, (clicked) => void castVote(clip, clicked, control));
    card.append(rank, poster, body, control);
    return card;
}

function render(data: WeekResponse): void {
    podiumEl.replaceChildren();
    restEl.replaceChildren();
    rangeEl.textContent = weekRangeText(data.from, data.to);
    const clips = Array.isArray(data.clips) ? data.clips : [];
    emptyEl.hidden = clips.length > 0;
    podium(clips).forEach((clip, i) => podiumEl.appendChild(buildCard(clip, i, true)));
    remainder(clips).forEach((clip, i) => restEl.appendChild(buildCard(clip, i + 3, false)));
}

async function load(): Promise<void> {
    try {
        const token = sessionStorage.getItem("dash_token") ?? "";
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(`${API_BASE}/live/clips/week`, { credentials: "include", headers });
        if (!res.ok) throw new Error("load failed");
        render(await res.json() as WeekResponse);
    } catch {
        errorEl.hidden = false;
    }
}

async function boot(): Promise<void> {
    try {
        const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
        if (res.ok) {
            const info = await res.json() as { kind?: string };
            signedIn = info.kind === "user";
        }
    } catch {}
    void initSiteNav(null);
    reportVisit("other");
    void load();
}

void boot();
