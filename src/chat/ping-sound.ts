import { ctx } from "./context.ts";
import { canPing } from "./ping-throttle.ts";

type AudioContextCtor = new () => AudioContext;

let audioContext: AudioContext | null = null;
let unlocked = false;
let lastPingAt: number | null = null;

function resolveAudioContextCtor(): AudioContextCtor | null {
    const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
    return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function primePingAudio(): void {
    if (unlocked) {
        if (audioContext && audioContext.state === "suspended") void audioContext.resume();
        return;
    }
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) return;
    audioContext = new Ctor();
    unlocked = true;
}

function playChirp(audio: AudioContext): void {
    const now = audio.currentTime;
    const gain = audio.createGain();
    gain.connect(audio.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now + 0.09);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.105);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    const first = audio.createOscillator();
    first.type = "sine";
    first.frequency.setValueAtTime(880, now);
    first.connect(gain);
    first.start(now);
    first.stop(now + 0.1);

    const second = audio.createOscillator();
    second.type = "sine";
    second.frequency.setValueAtTime(1318.51, now + 0.09);
    second.connect(gain);
    second.start(now + 0.09);
    second.stop(now + 0.23);
}

export function playMentionPing(): void {
    if (ctx.pingsMuted || !unlocked || !audioContext) return;
    const now = Date.now();
    if (!canPing(lastPingAt, now)) return;
    lastPingAt = now;
    if (audioContext.state === "suspended") void audioContext.resume();
    playChirp(audioContext);
}
