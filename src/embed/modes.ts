export interface EmbedModes {
    preview: boolean;
    controls: boolean;
    cleanfeed: boolean;
}

export function resolveEmbedModes(params: URLSearchParams): EmbedModes {
    const preview = params.get("preview") === "1";
    const controls = params.get("controls") === "1" && !preview;
    const cleanfeed = params.get("cleanfeed") === "1" && !controls;
    return { preview, controls, cleanfeed };
}
