export function clipProcessingMessage(
    phase: string | null | undefined,
    queuePosition: number | null | undefined,
    fallback: string,
): string {
    if (phase === "queued" && typeof queuePosition === "number" && queuePosition > 0) {
        return `In queue, ${queuePosition} ahead`;
    }
    if (phase === "encoding" || queuePosition === 0) {
        return "Encoding";
    }
    return fallback;
}
