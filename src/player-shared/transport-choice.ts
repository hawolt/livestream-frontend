export type TransportChoice = "hls-native" | "hls-js" | "unsupported";

export interface TransportChoiceInput {
    nativeHls: boolean;
    hlsJsSupported: boolean;
}

export function chooseTransport(input: TransportChoiceInput): TransportChoice {
    if (input.hlsJsSupported) return "hls-js";
    if (input.nativeHls) return "hls-native";
    return "unsupported";
}
