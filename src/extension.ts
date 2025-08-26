import * as vscode from 'vscode';
import { TasksProvider } from './tasks';

export function activate(context: vscode.ExtensionContext) {
	console.log('Activate task-trigger extension.');

	const taskTreeDataProvider = new TasksProvider();
	vscode.window.registerTreeDataProvider('taskTriggerView', taskTreeDataProvider);

	vscode.commands.registerCommand('tasktrigger.triggerTask', (task: vscode.Task) => {
		vscode.tasks.executeTask(task);
	});
}

export function deactivate(): void {
}
