import { describe, expect, test } from "bun:test";
import { createPollLoop } from "../src/explore/poll-loop.ts";

interface Deferred<T> {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
}

interface ScheduledRun {
    run: () => void;
    delayMs: number;
    cancelled: boolean;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function scheduler(): {
    runs: ScheduledRun[];
    schedule: (run: () => void, delayMs: number) => ScheduledRun;
    cancel: (handle: unknown) => void;
    runNext: () => number;
} {
    const runs: ScheduledRun[] = [];
    return {
        runs,
        schedule(run, delayMs) {
            const scheduled = { run, delayMs, cancelled: false };
            runs.push(scheduled);
            return scheduled;
        },
        cancel(handle) {
            (handle as ScheduledRun).cancelled = true;
        },
        runNext() {
            const scheduled = runs.find((run) => !run.cancelled);
            if (!scheduled) throw new Error("No scheduled run");
            scheduled.cancelled = true;
            scheduled.run();
            return scheduled.delayMs;
        },
    };
}

describe("createPollLoop", () => {
    test("starts immediately and serializes lifecycle restarts", async () => {
        const first = deferred<number>();
        const second = deferred<number>();
        const pending = [first, second];
        const signals: AbortSignal[] = [];
        const applied: number[] = [];
        const timers = scheduler();
        let calls = 0;
        const loop = createPollLoop({
            request(signal) {
                signals.push(signal);
                return pending[calls++]!.promise;
            },
            apply(value) {
                applied.push(value);
            },
            onInitialError() {},
            schedule: timers.schedule,
            cancel: timers.cancel,
            pollDelayMs: 20_000,
            retryDelayMs: 5_000,
        });

        loop.start();
        loop.start();
        expect(calls).toBe(1);

        loop.stop();
        expect(signals[0]!.aborted).toBe(true);
        loop.start();
        expect(calls).toBe(1);

        first.resolve(1);
        await settle();
        expect(calls).toBe(2);
        expect(applied).toEqual([]);

        second.resolve(2);
        await settle();
        expect(applied).toEqual([2]);
        expect(timers.runs[timers.runs.length - 1]?.delayMs).toBe(20_000);
        loop.stop();
    });

    test("retries failures and retains the last successful value", async () => {
        const outcomes: Array<() => Promise<number>> = [
            () => Promise.reject(new Error("offline")),
            () => Promise.resolve(7),
            () => Promise.reject(new Error("offline again")),
        ];
        const applied: number[] = [];
        const timers = scheduler();
        let calls = 0;
        let initialErrors = 0;
        const loop = createPollLoop({
            request() {
                return outcomes[calls++]!();
            },
            apply(value) {
                applied.push(value);
            },
            onInitialError() {
                initialErrors += 1;
            },
            schedule: timers.schedule,
            cancel: timers.cancel,
            pollDelayMs: 20_000,
            retryDelayMs: 5_000,
        });

        loop.start();
        await settle();
        expect(initialErrors).toBe(1);
        expect(timers.runNext()).toBe(5_000);

        await settle();
        expect(applied).toEqual([7]);
        expect(timers.runNext()).toBe(20_000);

        await settle();
        expect(applied).toEqual([7]);
        expect(initialErrors).toBe(1);
        expect(timers.runs[timers.runs.length - 1]?.delayMs).toBe(5_000);
        loop.stop();
    });
});
