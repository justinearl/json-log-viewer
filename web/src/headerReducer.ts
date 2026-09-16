export enum HeaderActionKind {
    SHIFT_LEFT = "SHIFT_LEFT",
    DELETE = "DELETE",
    ADD = "ADD",
    SET = "SET"
}

export type HeaderAction =
    | { type: HeaderActionKind.SHIFT_LEFT; header: string }
    | { type: HeaderActionKind.DELETE; header: string }
    | { type: HeaderActionKind.ADD; header: string }
    | { type: HeaderActionKind.SET; headers: string[] };

export function headerReducer(currentHeaders: string[], action: HeaderAction): string[] {
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
                return currentHeaders
            }

            const newHeaders = [...currentHeaders]
            newHeaders[hIndex] = newHeaders[hIndex - 1]
            newHeaders[hIndex - 1] = action.header

            return newHeaders
        }
        case HeaderActionKind.SET: {
            return action.headers
        }
        default:
            return currentHeaders
    }
}
