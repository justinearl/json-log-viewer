import { HeaderActionKind, headerReducer } from './headerReducer';

describe('headerReducer', () => {
    it('adds a header', () => {
        const result = headerReducer(['level', 'message'], {
            header: 'timestamp',
            type: HeaderActionKind.ADD
        });
        expect(result).toEqual(['level', 'message', 'timestamp']);
    });

    it('deletes a header', () => {
        const result = headerReducer(['level', 'message', 'timestamp'], {
            header: 'message',
            type: HeaderActionKind.DELETE
        });
        expect(result).toEqual(['level', 'timestamp']);
    });

    it('shifts a header left', () => {
        const result = headerReducer(['level', 'message', 'timestamp'], {
            header: 'message',
            type: HeaderActionKind.SHIFT_LEFT
        });
        expect(result).toEqual(['message', 'level', 'timestamp']);
    });

    it('does not shift the first header left', () => {
        const result = headerReducer(['level', 'message'], {
            header: 'level',
            type: HeaderActionKind.SHIFT_LEFT
        });
        expect(result).toEqual(['level', 'message']);
    });

    it('does not shift a non-existent header', () => {
        const result = headerReducer(['level', 'message'], {
            header: 'nonexistent',
            type: HeaderActionKind.SHIFT_LEFT
        });
        expect(result).toEqual(['level', 'message']);
    });

    it('returns current state for unknown action', () => {
        const headers = ['level', 'message'];
        const result = headerReducer(headers, {
            header: 'test',
            type: 'UNKNOWN' as HeaderActionKind
        });
        expect(result).toBe(headers);
    });
});
