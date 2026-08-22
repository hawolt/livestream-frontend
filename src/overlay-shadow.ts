export type OverlayShadowKey = "0" | "dropsm" | "dropmd" | "droplg";

const OVERLAY_SHADOW_KEYS: readonly OverlayShadowKey[] = ["0", "dropsm", "dropmd", "droplg"];

export function parseOverlayShadow(raw: string | null): OverlayShadowKey | undefined {
    if (raw === null) return undefined;
    return (OVERLAY_SHADOW_KEYS as readonly string[]).includes(raw) ? (raw as OverlayShadowKey) : undefined;
}
