import * as vscode from 'vscode';
import { panel } from './logPanel';

export function activate(context: vscode.ExtensionContext) {
    const webview = vscode.commands.registerCommand('logviewer.jsonview', () => {panel(context);});
    context.subscriptions.push(webview);
}

export function deactivate() { }
