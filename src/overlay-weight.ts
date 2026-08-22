export type OverlayWeightKey = "normal" | "bold" | "extrabold";

const OVERLAY_WEIGHT_KEYS: readonly OverlayWeightKey[] = ["normal", "bold", "extrabold"];

export function parseOverlayWeight(raw: string | null): OverlayWeightKey | undefined {
    if (raw === null) return undefined;
    return (OVERLAY_WEIGHT_KEYS as readonly string[]).includes(raw) ? (raw as OverlayWeightKey) : undefined;
}
