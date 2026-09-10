import { video } from "../dom.ts";

export function bufferedEnd(): number {
    const b = video.buffered;
    return b.length ? b.end(b.length - 1) : 0;
}

export function bufferedStart(): number {
    const b = video.buffered;
    return b.length ? b.start(b.length - 1) : 0;
}
