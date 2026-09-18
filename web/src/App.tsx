import { useEffect, useReducer, useState } from 'react';
import { Layout, LoadingState, LogTable } from './filebeatTableComponents';
import { LogEntry, LogStore } from './customTypes';
import { parseChunk } from './parse';
import { vscode } from './vscode';

interface Store extends LogStore {
    /** Source lines consumed so far, so appended chunks keep true line numbers. */
    lines: number;
    /** Bumped on a full reload so the table can reset its per-row state. */
    generation: number;
}

type StoreAction =
    | { type: 'replace'; raw: string }
    | { type: 'append'; raw: string };

const EMPTY: Store = { entries: [], allKeys: [], rawCount: 0, lines: 0, generation: 0 };

function storeReducer(store: Store, action: StoreAction): Store {
    if (action.type === 'replace') {
        const chunk = parseChunk(action.raw, 1);
        return {
            entries: chunk.entries,
            allKeys: chunk.keys,
            rawCount: chunk.rawCount,
            lines: chunk.lines,
            generation: store.generation + 1,
        };
    }

    const chunk = parseChunk(action.raw, store.lines + 1);
    if (chunk.entries.length === 0) {
        return chunk.lines === 0 ? store : { ...store, lines: store.lines + chunk.lines };
    }

    let allKeys = store.allKeys;
    const known = new Set(allKeys);
    const fresh = chunk.keys.filter(key => !known.has(key));
    if (fresh.length > 0) allKeys = [...allKeys, ...fresh];

    const entries: LogEntry[] = store.entries.concat(chunk.entries);
    return {
        entries,
        allKeys,
        rawCount: store.rawCount + chunk.rawCount,
        lines: store.lines + chunk.lines,
        generation: store.generation,
    };
}

function App() {
    const [store, dispatch] = useReducer(storeReducer, EMPTY);
    const [layout, setLayout] = useState<Partial<Layout> | null>(null);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const message = event.data ?? {};
            switch (message.command) {
                case 'layout':
                    setLayout(message.layout ?? null);
                    break;
                case 'initialData':
                    dispatch({ type: 'replace', raw: message.data ?? '' });
                    setLoaded(true);
                    break;
                case 'append':
                    dispatch({ type: 'append', raw: message.data ?? '' });
                    break;
            }
        };
        window.addEventListener('message', onMessage);
        vscode.postMessage({ command: 'ready' });
        return () => window.removeEventListener('message', onMessage);
    }, []);

    if (!loaded) return <LoadingState />;

    return <LogTable key={store.generation} data={store} initialLayout={layout ?? undefined} />;
}

export default App;
