import { expect, test } from "bun:test";
import { stepperAtBound, stepperNext, stepperStep } from "../src/dash/stepper.ts";

test("steps by the step attribute and defaults to 1", () => {
    expect(stepperStep("")).toBe(1);
    expect(stepperStep("100")).toBe(100);
    expect(stepperNext("5", 1, "1", "120", "")).toBe("6");
    expect(stepperNext("800", 1, "1", "100000", "50")).toBe("850");
    expect(stepperNext("200", 1, "200", "10000", "100")).toBe("300");
});

test("clamps at min and max", () => {
    expect(stepperNext("1", -1, "1", "120", "")).toBe("1");
    expect(stepperNext("120", 1, "1", "120", "")).toBe("120");
    expect(stepperNext("119", 1, "1", "120", "5")).toBe("120");
});

test("unbounded sides never clamp and allow negatives", () => {
    expect(stepperNext("0", -1, "", "", "")).toBe("-1");
    expect(stepperNext("0", -1, "0", "", "")).toBe("0");
    expect(stepperNext("9999", 1, "", "", "")).toBe("10000");
});

test("empty value lands on min when set, else steps from zero", () => {
    expect(stepperNext("", 1, "1", "65535", "")).toBe("1");
    expect(stepperNext("", -1, "1", "65535", "")).toBe("1");
    expect(stepperNext("", 1, "", "", "")).toBe("1");
    expect(stepperNext("", -1, "", "", "")).toBe("-1");
});

test("decimal steps keep the step precision", () => {
    expect(stepperNext("0.5", 1, "0", "1", "0.1")).toBe("0.6");
});

test("alertbox background opacity round trips on a 0.05 step", () => {
    expect(stepperNext("0.85", -1, "0", "1", "0.05")).toBe("0.80");
    expect(stepperNext("0.85", 1, "0", "1", "0.05")).toBe("0.90");
    expect(stepperNext("0.95", 1, "0", "1", "0.05")).toBe("1.00");
    expect(stepperNext("0.05", -1, "0", "1", "0.05")).toBe("0.00");
});

test("alertbox card scale avoids binary floating point artifacts", () => {
    expect(stepperNext("1", 1, "0.5", "2", "0.1")).toBe("1.1");
    expect(stepperNext("1.1", 1, "0.5", "2", "0.1")).toBe("1.2");
    expect(stepperNext("1.9", 1, "0.5", "2", "0.1")).toBe("2.0");
});

test("fractional steps clamp at their bounds", () => {
    expect(stepperNext("0.5", -1, "0.5", "2", "0.1")).toBe("0.5");
    expect(stepperNext("2", 1, "0.5", "2", "0.1")).toBe("2.0");
    expect(stepperNext("1", -1, "0", "1", "0.05")).toBe("0.95");
});

test("bound detection drives button disabling", () => {
    expect(stepperAtBound("1", -1, "1", "120")).toBe(true);
    expect(stepperAtBound("120", 1, "1", "120")).toBe(true);
    expect(stepperAtBound("60", 1, "1", "120")).toBe(false);
    expect(stepperAtBound("", -1, "1", "120")).toBe(false);
    expect(stepperAtBound("5", -1, "", "120")).toBe(false);
});
