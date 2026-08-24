export interface ToastArrival {
    documentHidden: boolean;
    alreadyKnown: boolean;
    read: boolean;
}

export function shouldShowToast(arrival: ToastArrival): boolean {
    if (arrival.documentHidden) return false;
    if (arrival.alreadyKnown) return false;
    return !arrival.read;
}
