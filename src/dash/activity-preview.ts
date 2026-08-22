export interface ActivityPreviewInputs {
    toggledOn: boolean;
    tabActive: boolean;
    documentVisible: boolean;
    cardVisible: boolean;
}

export function shouldPreviewRun(inputs: ActivityPreviewInputs): boolean {
    return inputs.toggledOn && inputs.tabActive && inputs.documentVisible && inputs.cardVisible;
}
