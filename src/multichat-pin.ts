export const NEAR_BOTTOM_PX = 40;

export interface ScrollGeometry {
    scrollHeight: number;
    scrollTop: number;
    clientHeight: number;
}

export function isNearBottom(g: ScrollGeometry): boolean {
    return g.scrollHeight - g.scrollTop - g.clientHeight < NEAR_BOTTOM_PX;
}

export function pinnedAfterScroll(pinned: boolean, g: ScrollGeometry): boolean {
    return isNearBottom(g) ? true : pinned;
}

export function canUnpin(overlay: boolean, g: ScrollGeometry): boolean {
    if (overlay) return false;
    return g.scrollHeight > g.clientHeight;
}
