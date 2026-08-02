export function motionScrollBehavior(): ScrollBehavior {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
