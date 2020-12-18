import * as vscode from 'vscode';
import { ComposerTaskProvider } from './composerTaskProvider';

let composerTaskProvider: vscode.Disposable | undefined;

export function activate(_context: vscode.ExtensionContext): void {
	const workspaceRoot = vscode.workspace.rootPath;
	if (!workspaceRoot) {
		return;
	}
		
	composerTaskProvider = vscode.tasks.registerTaskProvider(ComposerTaskProvider.ComposerType, new ComposerTaskProvider(workspaceRoot));
}

export function deactivate(): void {
	if (composerTaskProvider) {
		composerTaskProvider.dispose();
	}
}
