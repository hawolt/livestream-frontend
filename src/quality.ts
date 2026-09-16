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

export function parseLockedVariants(masterBody: string): string[] {
    const out: string[] = [];
    for (const line of masterBody.split(/\r?\n/)) {
        if (!line.startsWith("#EXT-X-ITZON-LOCKED:")) continue;
        const res = /RESOLUTION=(\d+)x(\d+)/.exec(line);
        if (!res) continue;
        const fpsMatch = /FRAME-RATE=([\d.]+)/.exec(line);
        const label = streamQualityText(Number(res[1]), Number(res[2]), fpsMatch ? Number(fpsMatch[1]) : 0);
        if (label && label !== "high quality" && !out.includes(label)) out.push(label);
    }
    return out;
}
