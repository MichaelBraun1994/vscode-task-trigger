import * as assert from 'assert';
import * as vscode from 'vscode';
import { TasksProvider } from '../tasks'; // adjust path as needed
import sinon from 'sinon';
import { config } from 'process';

function createMockTask(name: string, source: string): vscode.Task {
	const definition = { type: 'shell', detail: `Detail for ${name}` };
	const scope = vscode.TaskScope.Workspace;
	const execution = new vscode.ShellExecution('echo test');
	const task = new vscode.Task(definition, scope, name, source, execution);
	return task;
}


suite('TasksProvider Tests', () => {
	let provider: TasksProvider;
	let mockTasks: vscode.Task[];

	setup(() => {
		provider = new TasksProvider();

		mockTasks = [
			createMockTask('FolderA: TaskA_A_A', 'SourceA'),
			createMockTask('FolderB: TaskA_B_A', 'SourceA'),
			createMockTask('FolderA: TaskA_A_B', 'SourceA'),
			createMockTask('FolderB: TaskA_B_B', 'SourceA'),
			createMockTask('FolderC: TaskB_C_A', 'SourceB')
		];
	});

	test('createSourceContainers should initialize containers by source', () => {
		provider.createSourceContainers(mockTasks);
		const children = [...(provider as any).sourceContainers.keys()];
		assert.deepStrictEqual(children, ['SourceA', 'SourceB']);
	});

	test('parseTask should organize tasks into folders correctly', async () => {
		const mockConfig: vscode.WorkspaceConfiguration = {
			get: (key: string, defaultValue?: any) => {
				if (key === 'separatorRegex') { return ':'; };
				if (key === 'autoCollapseLimit') { return 10; }; // Force collapse
				return defaultValue;
			},
		} as vscode.WorkspaceConfiguration;

		const configStub = sinon.stub(vscode.workspace, 'getConfiguration');
		configStub.withArgs('tasktrigger').returns(mockConfig);
		const fetchStub = sinon.stub(vscode.tasks, 'fetchTasks').resolves(mockTasks);

		await provider.parseTasks();

		const sourceA = (provider as any).sourceContainers.get('SourceA');
		const sourceB = (provider as any).sourceContainers.get('SourceB');
		const folderA = provider.getFolder('FolderA', 'SourceA');
		const folderB = provider.getFolder('FolderB', 'SourceA');
		const folderC = provider.getFolder('FolderC', 'SourceB');

		assert.ok(sourceA);
		assert.ok(sourceB);

		assert.ok(folderA);
		assert.ok(folderB);
		assert.ok(folderC);

		assert.strictEqual(folderA?.entries.length, 2);
		assert.strictEqual(folderB?.entries.length, 2);
		assert.strictEqual(folderC?.entries.length, 1);

		configStub.restore();
		fetchStub.restore();
	});

	test('getChildren should return top-level containers when no element is passed', async () => {
		const fetchStub = sinon.stub(vscode.tasks, 'fetchTasks').resolves(mockTasks);
		provider.createSourceContainers(mockTasks);
		const children = await provider.getChildren();
		assert.strictEqual(children.length, 2);
		fetchStub.restore();
	});

	test('collapseBigFolders should collapse folders with more than limit', async () => {
		const mockConfig: vscode.WorkspaceConfiguration = {
			get: (key: string, defaultValue?: any) => {
				if (key === 'separatorRegex') { return ':'; };
				if (key === 'autoCollapseLimit') { return 1; }; // Force collapse
				return defaultValue;
			},
		} as vscode.WorkspaceConfiguration;
		const configStub = sinon.stub(vscode.workspace, 'getConfiguration');
		configStub.withArgs('tasktrigger').returns(mockConfig);

		const fetchStub = sinon.stub(vscode.tasks, 'fetchTasks').resolves(mockTasks);

		await provider.parseTasks();

		const folderA = provider.getFolder('FolderA', 'SourceA');
		assert.strictEqual(folderA?.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed);

		configStub.restore();
		fetchStub.restore();
	});

	test('refresh should trigger tree update', async () => {
		const fireSpy = sinon.spy((provider as any).onDidChangeTreeDataEmitter, 'fire');
		const fetchStub = sinon.stub(vscode.tasks, 'fetchTasks').resolves(mockTasks);

		await provider.refresh();
		assert.ok(fireSpy.calledWith(null));

		fireSpy.restore();
		fetchStub.restore();
	});
});
