export enum HeaderActionKind {
    SHIFT_LEFT = "SHIFT_LEFT",
    DELETE = "DELETE",
    ADD = "ADD"
}

export interface HeaderAction {
    type: HeaderActionKind,
    header: string,
}

export function headerReducer(currentHeaders: string[], action: HeaderAction) {
    switch (action.type) {
        case HeaderActionKind.ADD: {
            return [...currentHeaders, action.header]
        }
        case HeaderActionKind.DELETE: {
            return currentHeaders.filter(h => h !== action.header)
        }
        case HeaderActionKind.SHIFT_LEFT: {
            const hIndex = currentHeaders.indexOf(action.header)

            if (hIndex === 0 || hIndex === -1) {
                // No need to do anything
                return currentHeaders
            }

            const newHeaders = [...currentHeaders]
            newHeaders[hIndex] = newHeaders[hIndex - 1]
            newHeaders[hIndex - 1] = action.header

            return newHeaders
        }
        default:
            return currentHeaders
    }
}
