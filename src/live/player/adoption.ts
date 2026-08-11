export interface AdoptedTransport {
    sock: WebSocket;
    mediaSource: MediaSource;
    sourceBuffer: SourceBuffer;
    queue: ArrayBuffer[];
    started: number;
    fps: number;
    width: number;
    height: number;
}
