export type TransportChoice = "ws" | "hls-native" | "hls-js" | "unsupported";

export interface TransportChoiceInput {
    mseSupported: boolean;
    nativeHls: boolean;
    hlsJsSupported: boolean;
    lowLatency: boolean;
    llDenied: boolean;
    override: string | null;
}

function hlsChoice(input: TransportChoiceInput): TransportChoice {
    if (input.hlsJsSupported) return "hls-js";
    if (input.nativeHls) return "hls-native";
    return "unsupported";
}

export function chooseTransport(input: TransportChoiceInput): TransportChoice {
    if (input.override === "ws") return input.mseSupported ? "ws" : hlsChoice(input);
    if (input.override === "hls") return hlsChoice(input);
    if (input.mseSupported && input.lowLatency && !input.llDenied) return "ws";
    return hlsChoice(input);
}
