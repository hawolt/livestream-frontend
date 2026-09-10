export function qualityRowParts(label: string): { res: string; fps: string | null } {
    const match = /^(\d+p|4K)(\d+)$/i.exec(label);
    if (!match) return { res: label, fps: null };
    return { res: match[1]!, fps: `${match[2]} FPS` };
}

export function streamQualityText(width: number, height: number, fps: number): string {
    const side = width > 0 && height > 0 ? Math.min(width, height) : Math.max(width, height, 0);
    const res = side > 1440 ? "4K" : side > 1080 ? "1440p" : side > 0 ? `${side}p` : "";
    const rate = fps > 0 ? String(Math.round(fps)) : "";
    if (!res) return "high quality";
    return rate ? `${res}${rate}` : res;
}
