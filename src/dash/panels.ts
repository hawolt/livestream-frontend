export interface ChannelPanel {
    id: number;
    title: string;
    body: string;
    linkUrl: string;
    imageUrl?: string;
    position: number;
}

export interface PanelFormInput {
    title: string;
    body: string;
    linkUrl: string;
}

export interface PanelFormErrors {
    title?: string;
    body?: string;
    linkUrl?: string;
}

export const MAX_PANELS = 12;
export const MAX_PANEL_TITLE = 80;
export const MAX_PANEL_BODY = 300;

export function validatePanelForm(input: PanelFormInput): PanelFormErrors {
    const errors: PanelFormErrors = {};
    const title = input.title.trim();
    const body = input.body.trim();
    const linkUrl = input.linkUrl.trim();
    if (title.length > MAX_PANEL_TITLE) errors.title = `Title must be ${MAX_PANEL_TITLE} characters or fewer.`;
    if (body.length > MAX_PANEL_BODY) errors.body = `Body must be ${MAX_PANEL_BODY} characters or fewer.`;
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) errors.linkUrl = "Link must start with http:// or https://";
    if (!title && !body && !errors.title) errors.title = "Add a title or body.";
    return errors;
}

export function sortPanels(panels: ChannelPanel[]): ChannelPanel[] {
    return [...panels].sort((a, b) => a.position - b.position);
}

export function computeReorderSwap(
    panels: ChannelPanel[],
    id: number,
    direction: "up" | "down",
): [ChannelPanel, ChannelPanel] | null {
    const sorted = sortPanels(panels);
    const idx = sorted.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sorted.length) return null;
    const current = sorted[idx]!;
    const target = sorted[targetIdx]!;
    return [
        { ...current, position: target.position },
        { ...target, position: current.position },
    ];
}
