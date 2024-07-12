import * as vscode from 'vscode';
import * as fs from 'fs';


function readFileContent(filename: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(filename, 'utf8', (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(data);
        });
    });
}

function sendLogsEntry(webView: vscode.Webview, doc: string) {
    readFileContent(doc).then(m => {
        webView.postMessage({
            command: "initialData",
            data: m,
        });
    }).catch(err => {
        vscode.window.showErrorMessage(`Unable to read ${doc}: ${err.message}`);
    });
}

function generateWebviewContent(context: vscode.ExtensionContext, webView: vscode.Webview) {
    const scriptSrc = webView.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "web", "dist", "index.js"));
    const cssSrc = webView.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "web", "dist", "index.css"));

    webView.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <link rel="stylesheet" href="${cssSrc}" />
        </head>
        <body>
            <noscript>You need to enable JavaScript to run this app.</noscript>
            <div id="root"></div>
            <script src="${scriptSrc}"></script>
        </body>
        </html>
    `;
}

export function panel(context: vscode.ExtensionContext) {
    let panelResult = vscode.window.createWebviewPanel(
        "webview",
        "Logs",
        vscode.ViewColumn.One,
        {enableScripts: true, retainContextWhenHidden: true, enableFindWidget: true}
    );

    generateWebviewContent(context, panelResult.webview);

    const document = vscode.window.activeTextEditor?.document.uri.fsPath;
    if (document !== undefined) {
        sendLogsEntry(panelResult.webview, document);
        const messageSender = setInterval(() => {sendLogsEntry(panelResult.webview, document);}, 1000);

        panelResult.onDidDispose(
            () => {clearInterval(messageSender);},
            null,
            context.subscriptions
        );
    }
}
