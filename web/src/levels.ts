const LEVEL_KEYS = ['log.level', 'level', 'severity', 'loglevel'];

export type LevelBand = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const BAND_ORDER: LevelBand[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

export function levelBand(value: unknown): LevelBand | null {
    switch (String(value ?? '').toUpperCase().trim()) {
        case 'FATAL': case 'CRITICAL': case 'EMERGENCY': return 'fatal';
        case 'ERROR': case 'ERR': return 'error';
        case 'WARNING': case 'WARN': return 'warn';
        case 'INFO': case 'INFORMATION': return 'info';
        case 'DEBUG': case 'DBG': return 'debug';
        case 'TRACE': case 'VERBOSE': return 'trace';
        default: return null;
    }
}

export function getLevelClass(value: unknown): string {
    const band = levelBand(value);
    return band ? `level-${band}` : '';
}

/** Lower is more severe; unknown levels sort last. */
export function levelRank(value: unknown): number {
    const band = levelBand(value);
    return band ? BAND_ORDER.indexOf(band) : BAND_ORDER.length;
}

export function detectLevelKey(allKeys: string[]): string | null {
    const lookup = new Map(allKeys.map(k => [k.toLowerCase(), k]));
    for (const candidate of LEVEL_KEYS) {
        const hit = lookup.get(candidate);
        if (hit) return hit;
    }
    return null;
}
