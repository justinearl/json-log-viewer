import * as vscode from 'vscode';
import * as fs from 'fs';


async function readFileContent(filename: string): Promise<string> {
    return fs.promises.readFile(filename, 'utf8');
}

async function sendLogsEntry(webView: vscode.Webview, doc: string) {
    try {
        const content = await readFileContent(doc);
        webView.postMessage({
            command: "initialData",
            data: content,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Unable to read ${doc}: ${message}`);
    }
}

function generateWebviewContent(context: vscode.ExtensionContext, webView: vscode.Webview) {
    const scriptSrc = webView.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "web", "dist", "index.js"));
    const cssSrc = webView.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "web", "dist", "index.css"));
    const nonce = getNonce();

    webView.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webView.cspSource}; script-src 'nonce-${nonce}';">
            <link rel="stylesheet" href="${cssSrc}" />
        </head>
        <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptSrc}"></script>
        </body>
        </html>
    `;
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function panel(context: vscode.ExtensionContext) {
    const document = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (document === undefined) {
        vscode.window.showWarningMessage('No active editor found. Open a JSON log file first.');
        return;
    }

    let panelResult = vscode.window.createWebviewPanel(
        "webview",
        "Logs",
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
            enableFindWidget: true,
            localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'web', 'dist')]
        }
    );

    generateWebviewContent(context, panelResult.webview);

    sendLogsEntry(panelResult.webview, document);

    const watcher = fs.watch(document, () => {
        sendLogsEntry(panelResult.webview, document);
    });

    panelResult.onDidDispose(
        () => { watcher.close(); },
        null,
        context.subscriptions
    );
}
