import { SUBSCRIPTION_TAB_URL } from "./constants.ts";

export function loginModalSignupHref(intent: string, currentPageHref: string): string {
    const target = intent === "subscribe" ? SUBSCRIPTION_TAB_URL : currentPageHref;
    return `/register?return=${encodeURIComponent(target)}`;
}

export function postLoginRedirectTarget(intent: string): string | null {
    return intent === "subscribe" ? SUBSCRIPTION_TAB_URL : null;
}
