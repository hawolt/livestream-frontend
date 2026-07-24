export function readLocalStorage(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function writeLocalStorage(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {}
}

export function removeLocalStorage(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {}
}
