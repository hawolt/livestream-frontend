import { amountText } from "../billing/catalog.ts";

export function minorToAmountText(minor: number, currency: string): string {
    const value = (Math.max(0, minor) / 100).toFixed(2);
    return amountText(value, currency);
}
