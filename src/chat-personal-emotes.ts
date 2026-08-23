export interface PersonalEmoteRange {
    start: number;
    end: number;
}

export interface PersonalEmoteGroup {
    name: string;
    id: string;
    ranges: PersonalEmoteRange[];
}

export function parsePersonalEmoteTag(tag: string | undefined): PersonalEmoteGroup[] {
    if (!tag) return [];
    const groups: PersonalEmoteGroup[] = [];
    for (const group of tag.split("/")) {
        const parts = group.split(":");
        if (parts.length < 3) continue;
        const name = parts[0];
        const id = parts[1];
        if (!name || !id) continue;
        const rangesRaw = parts.slice(2).join(":");
        const ranges: PersonalEmoteRange[] = [];
        for (const span of rangesRaw.split(",")) {
            const dash = span.indexOf("-");
            if (dash <= 0) continue;
            const start = Number(span.slice(0, dash));
            const end = Number(span.slice(dash + 1));
            if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start) {
                ranges.push({ start, end });
            }
        }
        if (ranges.length) groups.push({ name, id, ranges });
    }
    return groups;
}

export function splicePersonalEmotes(
    text: string,
    groups: PersonalEmoteGroup[],
    renderPlain: (segment: string) => Node,
    buildEmoteNode: (name: string, id: string) => Node,
): DocumentFragment {
    const frag = document.createDocumentFragment();
    if (!groups.length) {
        frag.appendChild(renderPlain(text));
        return frag;
    }
    const cps = Array.from(text);
    const flat: { start: number; end: number; name: string; id: string }[] = [];
    for (const g of groups) {
        for (const r of g.ranges) flat.push({ start: r.start, end: r.end, name: g.name, id: g.id });
    }
    flat.sort((a, b) => a.start - b.start);
    let pos = 0;
    for (const range of flat) {
        if (range.start < pos || range.end >= cps.length) continue;
        if (range.start > pos) frag.appendChild(renderPlain(cps.slice(pos, range.start).join("")));
        frag.appendChild(buildEmoteNode(range.name, range.id));
        pos = range.end + 1;
    }
    if (pos < cps.length) frag.appendChild(renderPlain(cps.slice(pos).join("")));
    return frag;
}

export function resolveOwnPersonalEmoteTag(text: string, owned: Map<string, string>): string {
    if (owned.size === 0) return "";
    const cps = Array.from(text);
    const order: string[] = [];
    const spansByName = new Map<string, string[]>();
    let i = 0;
    while (i < cps.length) {
        if (/\s/.test(cps[i]!)) {
            i++;
            continue;
        }
        const start = i;
        while (i < cps.length && !/\s/.test(cps[i]!)) i++;
        const end = i - 1;
        const token = cps.slice(start, i).join("");
        const id = owned.get(token);
        if (id === undefined) continue;
        if (!spansByName.has(token)) order.push(token);
        const spans = spansByName.get(token) ?? [];
        spans.push(`${start}-${end}`);
        spansByName.set(token, spans);
    }
    if (!order.length) return "";
    return order.map((name) => `${name}:${owned.get(name)}:${spansByName.get(name)!.join(",")}`).join("/");
}

const PERSONAL_EMOTE_RENDITIONS = ["2x", "1x", "4x"];

export function personalEmoteUrl(id: string, rendition: string): string {
    return `/api/live/emote/${id}/${rendition}`;
}

export function buildPersonalEmoteImg(name: string, id: string, className: string): HTMLImageElement {
    const img = document.createElement("img");
    img.className = className;
    img.alt = name;
    img.title = name;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    let i = 0;
    img.src = personalEmoteUrl(id, PERSONAL_EMOTE_RENDITIONS[i]!);
    img.onerror = () => {
        i++;
        if (i < PERSONAL_EMOTE_RENDITIONS.length) {
            img.src = personalEmoteUrl(id, PERSONAL_EMOTE_RENDITIONS[i]!);
        } else {
            img.onerror = null;
            img.style.display = "none";
        }
    };
    return img;
}
