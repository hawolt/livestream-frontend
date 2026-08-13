import Hls from "hls.js";
import { video } from "../dom.ts";

export function mseSupported(): boolean {
    return typeof MediaSource === "function" && typeof MediaSource.isTypeSupported === "function";
}

export function canUseNativeHLS(): boolean {
    return video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

export function canUseHlsJs(): boolean {
    return Hls.isSupported();
}
