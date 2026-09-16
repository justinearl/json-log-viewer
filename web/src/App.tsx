import { useEffect, useMemo, useState } from 'react';
import { LogTable } from './filebeatTableComponents';
import { LogEntry, ProcessedLogs } from './customTypes';
import { flattenMap } from './utils';

function processLogs(raw: string): ProcessedLogs {
    const entries: LogEntry[] = [];
    let skippedLines = 0;
    const keySet = new Set<string>();

    if (!raw.trim()) {
        return { entries, skippedLines, allKeys: [] };
    }

    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            const parsed = JSON.parse(trimmed);
            const flat = flattenMap(parsed);
            entries.push(flat);
            for (const key of Object.keys(flat)) {
                keySet.add(key);
            }
        } catch {
            skippedLines++;
        }
    }

    return { entries, skippedLines, allKeys: Array.from(keySet) };
}

function App() {
    const [logs, setLogs] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.command === 'initialData') {
                setLogs(message.data || '');
                setIsLoading(false);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const processedLogs = useMemo(() => processLogs(logs), [logs]);

    return <LogTable data={processedLogs} isLoading={isLoading} />;
}

export default App;
