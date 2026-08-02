export async function copyText(value: string): Promise<boolean> {
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
            await navigator.clipboard.writeText(value);
            return true;
        }
    } catch {}
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.readOnly = true;
    textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try {
        copied = document.execCommand("copy");
    } catch {}
    textarea.remove();
    previousFocus?.focus();
    return copied;
}
