export interface TransportBase {
    base: string;
    direct: boolean;
}

export function pickTransportBase(directBase: string, fallbackBase: string, directFailed: boolean): TransportBase {
    if (directBase && !directFailed) return { base: directBase, direct: true };
    return { base: fallbackBase, direct: false };
}

export function shouldMarkDirectFailed(direct: boolean, joined: boolean): boolean {
    return direct && !joined;
}

const failedDirectBases = new Set<string>();

export function isDirectFailed(base: string): boolean {
    return base ? failedDirectBases.has(base) : false;
}

export function markDirectFailed(base: string): void {
    if (base) failedDirectBases.add(base);
}

export function resetDirectFailedForTest(base: string): void {
    failedDirectBases.delete(base);
}

export function chooseTransportBase(directBase: string, fallbackBase: string): TransportBase {
    return pickTransportBase(directBase, fallbackBase, isDirectFailed(directBase));
}
