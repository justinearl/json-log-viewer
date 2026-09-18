import * as vscode from 'vscode';
import { EDITOR_VIEW_TYPE, LogEditorProvider, openViewer } from './logPanel';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('logviewer.jsonview', (uri?: vscode.Uri) => {
            openViewer(context, uri instanceof vscode.Uri ? uri : undefined);
        }),
        vscode.window.registerCustomEditorProvider(EDITOR_VIEW_TYPE, new LogEditorProvider(context), {
            webviewOptions: { retainContextWhenHidden: true },
            supportsMultipleEditorsPerDocument: false,
        }),
    );
}

export function deactivate() { }
