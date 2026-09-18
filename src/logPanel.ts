import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export const PANEL_VIEW_TYPE = 'logviewer.panel';
export const EDITOR_VIEW_TYPE = 'logviewer.jsonLog';

/** Wait this long after a change event before reading, so bursts of writes coalesce. */
const CHANGE_DEBOUNCE_MS = 120;
/** A trailing line with no newline yet is shown after this quiet period. */
const PARTIAL_FLUSH_MS = 500;
/** Files untouched for this long are treated as complete, trailing newline or not. */
const SETTLED_MS = 1000;

const NEWLINE = 0x0a;

/**
 * Streams a log file into a webview. The first read sends the whole file;
 * after that only the bytes appended since the last read are sent, split on
 * newlines so the webview never sees half a line. A file that shrinks
 * (truncated or rotated) is reloaded from the start.
 */
class LogFeed {
    private offset = 0;
    private pending: Buffer | null = null;
    private flushTimer: NodeJS.Timeout | undefined;
    private changeTimer: NodeJS.Timeout | undefined;
    private watcher: fs.FSWatcher | undefined;
    private disposed = false;

    constructor(private readonly file: string, private readonly webview: vscode.Webview) { }

    start(): void {
        try {
            this.watcher = fs.watch(this.file, () => this.scheduleChange());
        } catch {
            // Some mounts cannot be watched; the poll below still covers them.
        }
        fs.watchFile(this.file, { interval: 1000 }, () => this.scheduleChange());
        void this.loadAll();
    }

    dispose(): void {
        this.disposed = true;
        this.watcher?.close();
        fs.unwatchFile(this.file);
        clearTimeout(this.flushTimer);
        clearTimeout(this.changeTimer);
    }

    private scheduleChange(): void {
        clearTimeout(this.changeTimer);
        this.changeTimer = setTimeout(() => void this.onChange(), CHANGE_DEBOUNCE_MS);
    }

    private async loadAll(): Promise<void> {
        try {
            const [buffer, stat] = await Promise.all([fs.promises.readFile(this.file), fs.promises.stat(this.file)]);
            if (this.disposed) { return; }
            this.offset = buffer.length;
            const settled = Date.now() - stat.mtimeMs > SETTLED_MS;
            if (settled) {
                this.pending = null;
                this.post('initialData', buffer.toString('utf8'));
            } else {
                this.emit(buffer, 'initialData');
            }
        } catch (err) {
            this.report(err);
        }
    }

    private async onChange(): Promise<void> {
        if (this.disposed) { return; }

        let size: number;
        try {
            size = (await fs.promises.stat(this.file)).size;
        } catch (err) {
            this.report(err);
            return;
        }

        if (size < this.offset) {
            await this.loadAll();
            return;
        }
        if (size === this.offset) { return; }

        let chunk: Buffer;
        try {
            const handle = await fs.promises.open(this.file, 'r');
            try {
                chunk = Buffer.alloc(size - this.offset);
                const { bytesRead } = await handle.read(chunk, 0, chunk.length, this.offset);
                chunk = chunk.subarray(0, bytesRead);
            } finally {
                await handle.close();
            }
        } catch (err) {
            this.report(err);
            return;
        }
        if (this.disposed) { return; }

        this.offset += chunk.length;
        this.emit(this.pending ? Buffer.concat([this.pending, chunk]) : chunk, 'append');
    }

    /** Sends every complete line in `data`; holds back a trailing partial line briefly. */
    private emit(data: Buffer, command: 'initialData' | 'append'): void {
        clearTimeout(this.flushTimer);
        const cut = data.lastIndexOf(NEWLINE);

        let complete: Buffer;
        if (cut === -1) {
            complete = Buffer.alloc(0);
            this.pending = data.length > 0 ? data : null;
        } else {
            complete = data.subarray(0, cut + 1);
            this.pending = cut + 1 < data.length ? data.subarray(cut + 1) : null;
        }

        if (complete.length > 0 || command === 'initialData') {
            this.post(command, complete.toString('utf8'));
        }

        if (this.pending) {
            this.flushTimer = setTimeout(() => {
                const tail = this.pending;
                this.pending = null;
                if (tail && !this.disposed) { this.post('append', tail.toString('utf8')); }
            }, PARTIAL_FLUSH_MS);
        }
    }

    private post(command: 'initialData' | 'append', data: string): void {
        void this.webview.postMessage({ command, data });
    }

    private report(err: unknown): void {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Unable to read ${this.file}: ${message}`);
    }
}

/* ------------------------------------------------------------------ html */

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function buildHtml(context: vscode.ExtensionContext, webview: vscode.Webview): string {
    const scriptSrc = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'web', 'dist', 'index.js'));
    const cssSrc = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'web', 'dist', 'index.css'));
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${cssSrc}" />
</head>
<body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptSrc}"></script>
</body>
</html>`;
}

/* ---------------------------------------------------------------- attach */

function layoutKey(file: string): string {
    return `logviewer.layout:${file}`;
}

async function revealLine(file: string, line: number): Promise<void> {
    try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
        const position = new vscode.Position(Math.max(0, line - 1), 0);
        await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Beside,
            selection: new vscode.Range(position, position),
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Unable to open ${file}: ${message}`);
    }
}

/** Wires a webview panel to a log file: content, saved layout, live feed, and messages back. */
export function attachViewer(context: vscode.ExtensionContext, panel: vscode.WebviewPanel, file: string): void {
    panel.title = path.basename(file);
    panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'web', 'dist')],
    };
    panel.webview.html = buildHtml(context, panel.webview);

    const feed = new LogFeed(file, panel.webview);
    let started = false;

    const messages = panel.webview.onDidReceiveMessage((message: { command?: string; line?: number; layout?: unknown }) => {
        switch (message?.command) {
            case 'ready': {
                if (started) { return; }
                started = true;
                const layout = context.workspaceState.get(layoutKey(file));
                void panel.webview.postMessage({ command: 'layout', layout: layout ?? null });
                feed.start();
                return;
            }
            case 'saveLayout':
                void context.workspaceState.update(layoutKey(file), message.layout);
                return;
            case 'reveal':
                if (typeof message.line === 'number') { void revealLine(file, message.line); }
                return;
        }
    });

    panel.onDidDispose(() => {
        feed.dispose();
        messages.dispose();
    }, null, context.subscriptions);
}

/* --------------------------------------------------------------- command */

const openPanels = new Map<string, vscode.WebviewPanel>();

/** Opens (or reveals) the viewer for a file: the one passed in, else the active editor's. */
export function openViewer(context: vscode.ExtensionContext, target?: vscode.Uri): void {
    const uri = target ?? vscode.window.activeTextEditor?.document.uri;
    if (!uri) {
        vscode.window.showWarningMessage('No file selected. Open or right-click a JSON log file first.');
        return;
    }
    if (uri.scheme !== 'file') {
        vscode.window.showWarningMessage('JSON Log Viewer can only open files on disk.');
        return;
    }

    const file = uri.fsPath;
    const existing = openPanels.get(file);
    if (existing) {
        existing.reveal();
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        PANEL_VIEW_TYPE,
        path.basename(file),
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            enableFindWidget: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'web', 'dist')],
        }
    );
    openPanels.set(file, panel);
    panel.onDidDispose(() => openPanels.delete(file), null, context.subscriptions);

    attachViewer(context, panel, file);
}

/* --------------------------------------------------------- custom editor */

class LogDocument implements vscode.CustomDocument {
    constructor(public readonly uri: vscode.Uri) { }
    dispose(): void { }
}

/** Lets a log file be opened straight into the viewer via "Open With…". */
export class LogEditorProvider implements vscode.CustomReadonlyEditorProvider<LogDocument> {
    constructor(private readonly context: vscode.ExtensionContext) { }

    openCustomDocument(uri: vscode.Uri): LogDocument {
        return new LogDocument(uri);
    }

    resolveCustomEditor(document: LogDocument, panel: vscode.WebviewPanel): void {
        if (document.uri.scheme !== 'file') {
            panel.webview.html = '<p>JSON Log Viewer can only open files on disk.</p>';
            return;
        }
        attachViewer(this.context, panel, document.uri.fsPath);
    }
}
