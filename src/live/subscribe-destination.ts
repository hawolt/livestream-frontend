import { SUBSCRIPTION_TAB_URL } from "./constants.ts";

export function subscriptionDestination(channelPath: string): string {
    return channelPath ? `${SUBSCRIPTION_TAB_URL}?return=${encodeURIComponent(channelPath)}` : SUBSCRIPTION_TAB_URL;
}

export function loginModalSignupHref(intent: string, currentPageHref: string, channelPath: string): string {
    const target = intent === "subscribe" ? subscriptionDestination(channelPath) : currentPageHref;
    return `/register?return=${encodeURIComponent(target)}`;
}

export function postLoginRedirectTarget(intent: string, channelPath: string): string | null {
    return intent === "subscribe" ? subscriptionDestination(channelPath) : null;
}
