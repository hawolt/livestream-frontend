import { buildAvatar, buildProfileLinks, followerLabel, loadProfile, type Profile, type ProfilePanel } from "../profile-card.ts";
import { isSafeHttpLink } from "./about/panels.ts";
import { cardImageError, validateCardForm, type CardType } from "./about/card-form.ts";
import { subscriberBadgeAssetPath, subscriberBadgeTitle } from "../chat/badges.ts";
import { loadChannelClips, type AboutClip, type ClipsSort } from "./about/clips.ts";
import { relativeDate } from "./about/relative-date.ts";
import {
    activityDayTitle,
    activityLevel,
    activityNote,
    ACTIVITY_LEVELS,
    ACTIVITY_LEVEL_LABELS,
    monthLabel,
    normalizeActivityPayload,
    shiftDayKey,
    todayKey,
    weekSpan,
    weekStart,
    WEEKDAY_LABELS,
    type ActivityDay,
} from "./about/activity.ts";
import { emoteCountLabel, emoteSignature, sortAboutEmotes, type AboutEmote } from "./about/emotes.ts";
import { ctx as chatCtx, emotes } from "../chat/context.ts";
import { formatCompactCount } from "./format.ts";
import { viewerOwnsChannel } from "./points.ts";
import { API_BASE } from "../api.ts";
import { ctx } from "./player/context.ts";
import { openDismissibleSurface, closeDismissibleSurface } from "../dismissible-surface.ts";
import {
    aboutBioEl,
    aboutBoxEl,
    aboutClipsEl,
    aboutClipsRowEl,
    aboutClipsSortNewestEl,
    aboutClipsSortViewsEl,
    aboutFollowersEl,
    aboutHeadingEl,
    aboutLinksEl,
    aboutPanelsActionsEl,
    aboutPanelsEl,
    aboutPanelsSectionEl,
    aboutAddCardBtnEl,
    cardModalCloseEl,
    cardModalBodyInputEl,
    cardModalErrorEl,
    cardModalEl,
    cardModalFileBtnEl,
    cardModalFileInputEl,
    cardModalFileNameEl,
    cardModalFormEl,
    cardModalImageGroupEl,
    cardModalLinkInputEl,
    cardModalSubmitEl,
    cardModalTitleInputEl,
    cardModalTypeImageEl,
    cardModalTypeTextEl,
    channelAvatarWrapEl,
} from "./dom.ts";

let currentPanels: ProfilePanel[] = [];
let ownerChannel = "";
let isOwner = false;

export function applyChannelIdentity(profile: Profile | null): void {
    channelAvatarWrapEl.replaceChildren();
    if (profile) channelAvatarWrapEl.appendChild(buildAvatar(profile));
}

function buildPanelCard(panel: ProfilePanel, owner: boolean): HTMLElement {
    const card = document.createElement("div");
    card.className = "live-about-panel";
    if (panel.title) {
        const title = document.createElement("div");
        title.className = "live-about-panel-title";
        title.textContent = panel.title;
        card.appendChild(title);
    }
    if (panel.imageUrl) {
        const img = document.createElement("img");
        img.className = "live-about-panel-img";
        img.src = panel.imageUrl;
        img.alt = "";
        img.loading = "lazy";
        if (panel.linkUrl && isSafeHttpLink(panel.linkUrl)) {
            const a = document.createElement("a");
            a.href = panel.linkUrl;
            a.target = "_blank";
            a.rel = "noopener";
            a.appendChild(img);
            card.appendChild(a);
        } else {
            card.appendChild(img);
        }
    }
    if (panel.body) {
        const body = document.createElement("div");
        body.className = "live-about-panel-body";
        body.textContent = panel.body;
        card.appendChild(body);
    }
    if (owner) {
        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "live-about-panel-delete live-about-panel-edit";
        edit.setAttribute("aria-label", "Edit card");
        edit.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`;
        edit.addEventListener("click", () => openEditCardModal(panel));
        card.appendChild(edit);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "live-about-panel-delete";
        del.setAttribute("aria-label", "Delete card");
        del.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`;
        del.addEventListener("click", () => void deleteCard(panel.id));
        card.appendChild(del);
    }
    return card;
}


let activityEntries: ActivityDay[] = [];
let activityByDay = new Map<string, ActivityDay>();
let activityLoadedFor = "";

const ACTIVITY_EPOCH = "2026-08-16";
const ACTIVITY_CARD_WEEKS = 12;
const ACTIVITY_HISTORY_MIN_WEEKS = 20;

const EXPAND_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;

function buildActivityCell(key: string): HTMLElement {
    const entry = activityByDay.get(key);
    const today = todayKey();
    const cell = document.createElement("div");
    let cls = "live-activity-cell";
    if (entry) cls += entry.secondsKnown ? ` on level-${activityLevel(entry.seconds)}` : " unknown";
    else if (key > today) cls += " future";
    if (key === today) cls += " today";
    cell.className = cls;
    cell.title = activityDayTitle(key, entry);
    return cell;
}

function buildActivityPadCell(): HTMLElement {
    const pad = document.createElement("div");
    pad.className = "live-activity-cell pad";
    return pad;
}

function buildActivityWeekdays(withMonths: boolean): HTMLElement {
    const column = document.createElement("div");
    column.className = withMonths ? "live-activity-weekdays has-months" : "live-activity-weekdays";
    for (const label of WEEKDAY_LABELS) {
        const item = document.createElement("div");
        item.className = "live-activity-weekday";
        item.textContent = label;
        column.appendChild(item);
    }
    return column;
}

function buildActivityMonths(startKey: string, weeks: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "live-activity-months";
    let previous = "";
    for (let week = 0; week < weeks; week++) {
        const key = shiftDayKey(startKey, week * 7);
        const month = key.slice(0, 7);
        const cell = document.createElement("div");
        cell.className = "live-activity-month";
        if (month !== previous) cell.textContent = monthLabel(key);
        previous = month;
        row.appendChild(cell);
    }
    return row;
}

function buildActivityCalendar(startKey: string, weeks: number, withMonths: boolean): HTMLElement {
    const calendar = document.createElement("div");
    calendar.className = "live-activity-cal";
    const scroll = document.createElement("div");
    scroll.className = "live-activity-cal-scroll";
    if (withMonths) scroll.appendChild(buildActivityMonths(startKey, weeks));
    const grid = document.createElement("div");
    grid.className = "live-activity-grid";
    grid.setAttribute("role", "img");
    grid.setAttribute("aria-label", "Stream activity by weekday");
    for (let week = 0; week < weeks; week++) {
        for (let weekday = 0; weekday < 7; weekday++) {
            const key = shiftDayKey(startKey, week * 7 + weekday);
            grid.appendChild(key < ACTIVITY_EPOCH ? buildActivityPadCell() : buildActivityCell(key));
        }
    }
    scroll.appendChild(grid);
    calendar.append(buildActivityWeekdays(withMonths), scroll);
    return calendar;
}

function buildActivityLegendLabel(text: string): HTMLElement {
    const label = document.createElement("span");
    label.className = "live-activity-legend-label";
    label.textContent = text;
    return label;
}

function buildActivityLegend(): HTMLElement {
    const legend = document.createElement("div");
    legend.className = "live-activity-legend";
    legend.appendChild(buildActivityLegendLabel("Less"));
    for (const level of ACTIVITY_LEVELS) {
        const swatch = document.createElement("span");
        swatch.className = `live-activity-cell on level-${level}`;
        swatch.title = ACTIVITY_LEVEL_LABELS[level] ?? "";
        legend.appendChild(swatch);
    }
    legend.appendChild(buildActivityLegendLabel("More"));
    const unknown = document.createElement("span");
    unknown.className = "live-activity-cell unknown";
    unknown.title = "was live, duration unknown";
    legend.append(unknown, buildActivityLegendLabel("duration unknown"));
    return legend;
}

function activityCardStart(): string {
    const epochStart = weekStart(ACTIVITY_EPOCH);
    const windowStart = weekStart(shiftDayKey(todayKey(), -(ACTIVITY_CARD_WEEKS - 1) * 7));
    return windowStart > epochStart ? windowStart : epochStart;
}

function openActivityHistory(): void {
    document.getElementById("live-activity-history")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "live-activity-history";
    overlay.className = "login-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    const box = document.createElement("div");
    box.className = "login-modal-box live-activity-history-box";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "login-modal-close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "\u00d7";
    close.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) overlay.remove();
    });
    const heading = document.createElement("h3");
    heading.textContent = "Stream activity";
    box.append(close, heading);
    const start = weekStart(ACTIVITY_EPOCH);
    const weeks = Math.max(ACTIVITY_HISTORY_MIN_WEEKS, weekSpan(start, shiftDayKey(todayKey(), 7)));
    const wrap = document.createElement("div");
    wrap.className = "live-activity-grid-wrap";
    wrap.appendChild(buildActivityCalendar(start, weeks, true));
    const note = document.createElement("p");
    note.className = "live-activity-note";
    note.textContent = activityNote(activityEntries);
    box.append(wrap, buildActivityLegend(), note);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function buildActivityCard(): HTMLElement {
    const card = document.createElement("div");
    card.className = "live-about-panel live-activity-card";
    const head = document.createElement("div");
    head.className = "live-activity-head";
    const title = document.createElement("div");
    title.className = "live-about-panel-title";
    title.textContent = "Stream activity";
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "live-activity-expand";
    expand.setAttribute("aria-label", "Open full stream activity");
    expand.title = "Full view";
    expand.innerHTML = EXPAND_ICON;
    expand.addEventListener("click", openActivityHistory);
    head.append(title, expand);
    const start = activityCardStart();
    card.append(head, buildActivityCalendar(start, weekSpan(start, todayKey()), false), buildActivityLegend());
    return card;
}

const EMOTE_PREVIEW_MAX = 24;
const EMOTE_POLL_MS = 500;
const EMOTE_POLL_TICKS = 40;

function buildEmoteTile(emote: AboutEmote): HTMLElement {
    const tile = document.createElement("span");
    tile.className = "live-about-emote";
    tile.title = emote.name;
    const img = document.createElement("img");
    img.src = emote.url;
    img.referrerPolicy = "no-referrer";
    img.alt = emote.name;
    img.title = emote.name;
    img.loading = "lazy";
    tile.appendChild(img);
    return tile;
}

function openEmoteList(list: AboutEmote[]): void {
    document.getElementById("live-about-emote-list")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "live-about-emote-list";
    overlay.className = "login-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    const box = document.createElement("div");
    box.className = "login-modal-box live-about-emote-box";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "login-modal-close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "\u00d7";
    close.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) overlay.remove();
    });
    const heading = document.createElement("h3");
    heading.textContent = "Emotes";
    box.append(close, heading);
    const all = document.createElement("div");
    all.className = "live-about-emote-all";
    for (const emote of list) {
        const item = document.createElement("div");
        item.className = "live-about-emote-item";
        item.title = emote.name;
        const name = document.createElement("div");
        name.className = "live-about-emote-name";
        name.textContent = emote.name;
        item.append(buildEmoteTile(emote), name);
        all.appendChild(item);
    }
    const note = document.createElement("p");
    note.className = "live-activity-note";
    note.textContent = emoteCountLabel(list.length);
    box.append(all, note);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function buildEmoteCard(list: AboutEmote[]): HTMLElement {
    const card = document.createElement("div");
    card.className = "live-about-panel live-emote-card";
    const head = document.createElement("div");
    head.className = "live-activity-head";
    const title = document.createElement("div");
    title.className = "live-about-panel-title";
    title.textContent = "Emotes";
    const expand = document.createElement("button");
    expand.type = "button";
    expand.className = "live-activity-expand";
    expand.setAttribute("aria-label", "Open the full emote list");
    expand.title = "Full view";
    expand.innerHTML = EXPAND_ICON;
    expand.addEventListener("click", () => openEmoteList(list));
    head.append(title, expand);
    const grid = document.createElement("div");
    grid.className = "live-about-emote-grid";
    for (const emote of list.slice(0, EMOTE_PREVIEW_MAX)) grid.appendChild(buildEmoteTile(emote));
    const note = document.createElement("div");
    note.className = "live-about-emote-note";
    note.textContent = emoteCountLabel(list.length);
    card.append(head, grid, note);
    return card;
}

let emoteCardRef: HTMLElement | null = null;
let emoteChannel = "";
let emoteListSignature = "";
let emotePollTimer: number | null = null;
let emotePollTicks = 0;

function channelEmoteList(): AboutEmote[] {
    if (!chatCtx.channelEmoteTwitchId) return [];
    return sortAboutEmotes(emotes.channelEntries());
}

function stopEmotePoll(): void {
    if (emotePollTimer === null) return;
    window.clearInterval(emotePollTimer);
    emotePollTimer = null;
}

function refreshEmoteCard(): void {
    const list = channelEmoteList();
    const signature = emoteSignature(list);
    if (signature === emoteListSignature) return;
    emoteListSignature = signature;
    emoteCardRef = list.length ? buildEmoteCard(list) : null;
    layoutAboutCards();
}

function watchChannelEmotes(channel: string): void {
    if (emoteChannel !== channel) {
        emoteChannel = channel;
        emoteCardRef = null;
        emoteListSignature = "";
        stopEmotePoll();
    }
    refreshEmoteCard();
    if (emotePollTimer !== null) return;
    emotePollTicks = 0;
    emotePollTimer = window.setInterval(() => {
        emotePollTicks++;
        refreshEmoteCard();
        if (emotePollTicks >= EMOTE_POLL_TICKS) stopEmotePoll();
    }, EMOTE_POLL_MS);
}

let activityCardRef: HTMLElement | null = null;
let panelCardRefs: HTMLElement[] = [];
let aboutLayoutWired = false;
let aboutLayoutTimer: number | null = null;

function scheduleAboutLayout(): void {
    if (aboutLayoutTimer !== null) return;
    aboutLayoutTimer = window.setTimeout(() => {
        aboutLayoutTimer = null;
        layoutAboutCards();
    }, 50);
}

function layoutAboutCards(): void {
    if (!aboutLayoutWired) {
        aboutLayoutWired = true;
        window.addEventListener("resize", scheduleAboutLayout);
    }
    const cards: HTMLElement[] = [];
    if (activityCardRef) cards.push(activityCardRef);
    if (emoteCardRef) cards.push(emoteCardRef);
    cards.push(...panelCardRefs);
    aboutPanelsEl.replaceChildren();
    if (!cards.length) return;
    const width = aboutPanelsEl.clientWidth || 640;
    const count = Math.max(1, Math.floor((width + 14) / 234));
    const cols: HTMLElement[] = [];
    for (let i = 0; i < count; i++) {
        const col = document.createElement("div");
        col.className = "live-about-col";
        cols.push(col);
        aboutPanelsEl.appendChild(col);
    }
    for (const card of cards) {
        let target = cols[0]!;
        for (const col of cols) {
            if (col.offsetHeight < target.offsetHeight) target = col;
        }
        target.appendChild(card);
        for (const img of Array.from(card.querySelectorAll("img"))) {
            if (!img.complete && !img.dataset["relayout"]) {
                img.dataset["relayout"] = "1";
                img.addEventListener("load", scheduleAboutLayout, { once: true });
            }
        }
    }
}

function mountActivityCard(): void {
    activityCardRef = buildActivityCard();
    layoutAboutCards();
    aboutPanelsEl.hidden = false;
    aboutPanelsSectionEl.hidden = false;
}

function applyActivityEntries(entries: ActivityDay[]): void {
    activityEntries = entries.filter(entry => entry.day >= ACTIVITY_EPOCH);
    activityByDay = new Map(activityEntries.map((entry): [string, ActivityDay] => [entry.day, entry]));
}

export function loadStreamActivity(username: string): void {
    if (activityLoadedFor === username) {
        mountActivityCard();
        return;
    }
    applyActivityEntries([]);
    mountActivityCard();
    void fetch(`/api/live/activity/${encodeURIComponent(username)}`)
        .then(res => res.ok ? res.json() as Promise<unknown> : null)
        .then(data => {
            if (!data) return;
            activityLoadedFor = username;
            applyActivityEntries(normalizeActivityPayload(data));
            mountActivityCard();
        })
        .catch(() => {});
}

function updatePanelsSectionVisibility(): void {
    aboutPanelsSectionEl.hidden = false;
    aboutPanelsActionsEl.hidden = !isOwner;
}

function renderPanels(panels: ProfilePanel[]): void {
    currentPanels = panels;
    panelCardRefs = panels.map(panel => buildPanelCard(panel, isOwner));
    updatePanelsSectionVisibility();
    layoutAboutCards();
}

function buildClipCard(channel: string, clip: AboutClip): HTMLAnchorElement {
    const a = document.createElement("a");
    a.className = "live-about-clip";
    a.href = `/${channel}/clip/${encodeURIComponent(clip.id)}`;
    const thumb = document.createElement("div");
    thumb.className = "live-about-clip-thumb";
    if (clip.poster) {
        const img = document.createElement("img");
        img.className = "live-about-clip-poster";
        img.src = clip.poster;
        img.alt = "";
        img.loading = "lazy";
        thumb.appendChild(img);
    }
    const date = document.createElement("div");
    date.className = "live-about-clip-date";
    date.textContent = relativeDate(clip.createdAt);
    thumb.appendChild(date);
    const views = document.createElement("div");
    views.className = "live-about-clip-views";
    views.textContent = `${formatCompactCount(clip.views)} views`;
    thumb.appendChild(views);
    a.appendChild(thumb);
    const title = document.createElement("div");
    title.className = "live-about-clip-title";
    title.textContent = clip.title;
    a.appendChild(title);
    return a;
}

function renderClips(channel: string, clips: AboutClip[]): void {
    aboutClipsRowEl.replaceChildren();
    if (!clips.length) {
        aboutClipsEl.hidden = true;
        return;
    }
    for (const clip of clips) aboutClipsRowEl.appendChild(buildClipCard(channel, clip));
    aboutClipsEl.hidden = false;
}

export function mountAboutCard(profile: Profile | null): void {
    applyChannelIdentity(profile);
    const username = profile?.username || ctx.displayUsername;
    aboutHeadingEl.textContent = username ? `About ${username}` : "";
    aboutFollowersEl.textContent = profile ? followerLabel(profile.followers) : "";
    aboutBioEl.textContent = profile?.bio ?? "";
    aboutBioEl.hidden = !profile?.bio;
    const badgesEl = document.getElementById("live-about-badges");
    if (badgesEl) {
        badgesEl.replaceChildren();
        const badges = profile?.badges ?? [];
        badgesEl.hidden = badges.length === 0;
        for (const badge of badges) {
            const img = document.createElement("img");
            img.src = subscriberBadgeAssetPath(badge);
            img.alt = badge;
            img.title = subscriberBadgeTitle(badge);
            img.loading = "lazy";
            img.addEventListener("error", () => img.remove());
            badgesEl.appendChild(img);
        }
    }
    aboutLinksEl.replaceChildren();
    const links = profile ? buildProfileLinks(profile.links) : null;
    if (links) aboutLinksEl.appendChild(links);
    aboutBoxEl.hidden = !profile;
    renderPanels(profile?.panels ?? []);
    if (username) watchChannelEmotes(username.toLowerCase());
}

let clipsChannel = "";
let clipsSort: ClipsSort = "newest";
let clipsSortWired = false;

function setClipsSort(sort: ClipsSort): void {
    clipsSort = sort;
    aboutClipsSortNewestEl.classList.toggle("active", sort === "newest");
    aboutClipsSortViewsEl.classList.toggle("active", sort === "views");
}

function wireClipsSortOnce(): void {
    if (clipsSortWired) return;
    clipsSortWired = true;
    aboutClipsSortNewestEl.addEventListener("click", () => {
        if (clipsSort === "newest") return;
        setClipsSort("newest");
        void loadChannelClips(clipsChannel, clipsSort).then(clips => renderClips(clipsChannel, clips));
    });
    aboutClipsSortViewsEl.addEventListener("click", () => {
        if (clipsSort === "views") return;
        setClipsSort("views");
        void loadChannelClips(clipsChannel, clipsSort).then(clips => renderClips(clipsChannel, clips));
    });
}

export function loadAboutClips(username: string): void {
    clipsChannel = username;
    setClipsSort("newest");
    wireClipsSortOnce();
    aboutClipsEl.hidden = true;
    aboutClipsRowEl.replaceChildren();
    void loadChannelClips(username, clipsSort).then(clips => renderClips(username, clips));
}

function dashAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = sessionStorage.getItem("dash_token");
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return headers;
}

function cardModalHeaders(): Record<string, string> {
    return { "Content-Type": "application/json", ...dashAuthHeaders() };
}

let cardType: CardType = "text";
let selectedCardFile: File | null = null;
let editingPanelId: string | null = null;

function setCardType(type: CardType): void {
    cardType = type;
    cardModalTypeTextEl.classList.toggle("active", type === "text");
    cardModalTypeImageEl.classList.toggle("active", type === "image");
    cardModalBodyInputEl.hidden = type !== "text";
    cardModalImageGroupEl.hidden = type !== "image";
    cardModalErrorEl.textContent = "";
}

function resetCardModal(): void {
    cardModalTitleInputEl.value = "";
    cardModalBodyInputEl.value = "";
    cardModalLinkInputEl.value = "";
    cardModalFileInputEl.value = "";
    cardModalFileNameEl.textContent = "No file selected";
    selectedCardFile = null;
    editingPanelId = null;
    cardModalErrorEl.textContent = "";
    cardModalSubmitEl.disabled = false;
    cardModalTypeTextEl.disabled = false;
    cardModalTypeImageEl.disabled = false;
    const heading = document.getElementById("live-card-modal-title");
    if (heading) heading.textContent = "Add card";
    cardModalSubmitEl.textContent = "Add card";
    setCardType("text");
}

function closeCardModal(): void {
    if (cardModalEl.hidden) return;
    cardModalEl.hidden = true;
    closeDismissibleSurface(cardModalEl);
}

function openCardModal(): void {
    resetCardModal();
    cardModalEl.hidden = false;
    openDismissibleSurface(cardModalEl, closeCardModal);
    cardModalTitleInputEl.focus();
}

function openEditCardModal(panel: ProfilePanel): void {
    resetCardModal();
    editingPanelId = panel.id;
    setCardType(panel.imageUrl ? "image" : "text");
    cardModalTypeTextEl.disabled = true;
    cardModalTypeImageEl.disabled = true;
    cardModalTitleInputEl.value = panel.title;
    cardModalBodyInputEl.value = panel.body;
    cardModalLinkInputEl.value = panel.linkUrl;
    if (panel.imageUrl) cardModalFileNameEl.textContent = "Keeping current image";
    const heading = document.getElementById("live-card-modal-title");
    if (heading) heading.textContent = "Edit card";
    cardModalSubmitEl.textContent = "Save";
    cardModalEl.hidden = false;
    openDismissibleSurface(cardModalEl, closeCardModal);
    cardModalTitleInputEl.focus();
}

async function refreshOwnedProfile(): Promise<void> {
    const profile = await loadProfile(ownerChannel);
    mountAboutCard(profile);
}

async function deleteCard(id: string): Promise<void> {
    if (!id) return;
    if (!confirm("Delete this card? This cannot be undone.")) return;
    try {
        await fetch(`${API_BASE}/profile/me/panels/${id}`, {
            method: "DELETE",
            credentials: "include",
            headers: dashAuthHeaders(),
        });
    } catch {}
    void refreshOwnedProfile();
}

async function uploadCardImage(id: string, file: File): Promise<{ ok: boolean; error: string | null }> {
    try {
        const bytes = await file.arrayBuffer();
        const res = await fetch(`${API_BASE}/profile/me/panels/${id}/image`, {
            method: "POST",
            credentials: "include",
            headers: { ...dashAuthHeaders(), "Content-Type": file.type },
            body: bytes,
        });
        if (res.ok) return { ok: true, error: null };
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        return { ok: false, error: errBody.error && errBody.error.trim() ? errBody.error : null };
    } catch {
        return { ok: false, error: null };
    }
}

async function submitCardModal(): Promise<void> {
    const title = cardModalTitleInputEl.value.trim();
    const body = cardModalBodyInputEl.value.trim();
    const linkUrl = cardType === "image" ? cardModalLinkInputEl.value.trim() : "";
    const errors = validateCardForm({ type: cardType, body, linkUrl, hasFile: selectedCardFile !== null || editingPanelId !== null });
    cardModalErrorEl.textContent = "";
    const firstError = errors.body ?? errors.file ?? errors.linkUrl;
    if (firstError) {
        cardModalErrorEl.textContent = firstError;
        return;
    }
    if (cardType === "image" && selectedCardFile) {
        const sizeError = cardImageError(selectedCardFile);
        if (sizeError) {
            cardModalErrorEl.textContent = sizeError;
            return;
        }
    }
    cardModalSubmitEl.disabled = true;
    const editing = editingPanelId;
    const payload: Record<string, string> = {};
    if (editing) {
        payload["title"] = title;
        if (cardType === "text") payload["body"] = body;
        if (cardType === "image") payload["linkUrl"] = linkUrl;
    } else {
        if (title) payload["title"] = title;
        if (cardType === "text") payload["body"] = body;
        if (cardType === "image" && linkUrl) payload["linkUrl"] = linkUrl;
    }
    try {
        const res = await fetch(editing
            ? `${API_BASE}/profile/me/panels/${editing}`
            : `${API_BASE}/profile/me/panels`, {
            method: editing ? "PATCH" : "POST",
            credentials: "include",
            headers: cardModalHeaders(),
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            if (res.status === 409) {
                cardModalErrorEl.textContent = "You've reached the 12 card limit. Delete a card to add a new one.";
            } else if (res.status === 401) {
                cardModalErrorEl.textContent = "Your session expired. Sign in again to add cards.";
            } else {
                const errBody = await res.json().catch(() => ({})) as { error?: string };
                cardModalErrorEl.textContent = errBody.error || "Could not add this card. Try again.";
            }
            cardModalSubmitEl.disabled = false;
            return;
        }
        const created = await res.json().catch(() => ({})) as { id?: string | number };
        const imageTarget = editing ?? (created.id !== undefined ? String(created.id) : "");
        if (cardType === "image" && selectedCardFile && imageTarget) {
            const uploaded = await uploadCardImage(imageTarget, selectedCardFile);
            if (!uploaded.ok) {
                if (!editing) {
                    await fetch(`${API_BASE}/profile/me/panels/${imageTarget}`, {
                        method: "DELETE",
                        credentials: "include",
                        headers: dashAuthHeaders(),
                    }).catch(() => {});
                }
                cardModalErrorEl.textContent = uploaded.error || "Could not upload the image. Try again.";
                cardModalSubmitEl.disabled = false;
                return;
            }
        }
        closeCardModal();
        void refreshOwnedProfile();
    } catch {
        cardModalErrorEl.textContent = "Could not reach the server. Try again.";
        cardModalSubmitEl.disabled = false;
    }
}

let ownerCardsWired = false;

function wireOwnerCardsOnce(): void {
    if (ownerCardsWired) return;
    ownerCardsWired = true;
    aboutAddCardBtnEl.addEventListener("click", openCardModal);
    cardModalCloseEl.addEventListener("click", closeCardModal);
    cardModalEl.addEventListener("click", (event) => {
        if (event.target === cardModalEl) closeCardModal();
    });
    cardModalTypeTextEl.addEventListener("click", () => setCardType("text"));
    cardModalTypeImageEl.addEventListener("click", () => setCardType("image"));
    cardModalFileBtnEl.addEventListener("click", () => cardModalFileInputEl.click());
    cardModalFileInputEl.addEventListener("change", () => {
        const file = cardModalFileInputEl.files?.[0] ?? null;
        selectedCardFile = file;
        cardModalFileNameEl.textContent = file ? file.name : "No file selected";
        cardModalErrorEl.textContent = "";
    });
    cardModalFormEl.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitCardModal();
    });
}

export function initOwnerCards(channel: string): void {
    ownerChannel = channel.toLowerCase();
    isOwner = false;
    updatePanelsSectionVisibility();
    void (async () => {
        try {
            const res = await fetch(`${API_BASE}/auth/session`, { credentials: "include" });
            if (!res.ok) return;
            const info = (await res.json()) as { kind?: unknown; username?: unknown } | null;
            if (ownerChannel !== channel.toLowerCase()) return;
            isOwner = viewerOwnsChannel(info, ownerChannel);
            if (isOwner) wireOwnerCardsOnce();
            renderPanels(currentPanels);
        } catch {}
    })();
}
