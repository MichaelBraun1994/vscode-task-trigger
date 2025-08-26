import * as vscode from 'vscode';

export class TasksProvider implements vscode.TreeDataProvider<TaskItem | TaskFolder> {
    constructor() {
        vscode.workspace.onDidChangeConfiguration(() => {
            this.refresh();
        });
    }

    // Container hierarchy:
    // SourceA
    //  + TaskA
    //  > FolderA
    //    + TaskA_A
    //    + TaskA_B
    //  > FolderB
    //    + TaskB_A
    // SourceB
    //  + ..
    private sourceContainers = new Map<string, TaskFolder>();
    private onDidChangeTreeDataEmitter: vscode.EventEmitter<TaskItem | null> = new vscode.EventEmitter<TaskItem | null>();
    readonly onDidChangeTreeData: vscode.Event<TaskItem | null> = this.onDidChangeTreeDataEmitter.event;

    getFolder(folderName: string, source: string): TaskFolder | undefined {
        function isFolder(item: (TaskItem | TaskFolder), name: string): item is TaskFolder {
            return item instanceof TaskFolder && item.label === name;
        }

        return this.sourceContainers.get(source)?.entries.find(item => isFolder(item, folderName));
    }

    addTaskToFolder(folderName: string, taskItem: TaskItem) {
        let taskSource = taskItem.task.source;
        let existingFolder = this.getFolder(folderName, taskSource);

        if (existingFolder) {
            existingFolder.entries.push(taskItem);
        }
        else {
            this.sourceContainers.get(taskSource)?.entries.push(new TaskFolder(folderName, true, [taskItem]));
        }
    }

    parseTask(task: vscode.Task) {
        const name = task.name;

        const taskName = getTaskNameWithoutFolderName(name);
        const folderName = getFolderName(name);

        let taskItem = new TaskItem(taskName, task);

        if (folderName) {
            this.addTaskToFolder(folderName, taskItem);
        }
        else {
            this.sourceContainers.get(task.source)?.entries.push(taskItem);
        }
    }

    createSourceContainers(tasks: vscode.Task[]) {
        const sources = [...(new Set(tasks.map(task => task.source)))].sort();

        for (let i = 0; i < sources.length; ++i) {
            this.sourceContainers.set(sources[i], new TaskFolder(sources[i], true, []));
        }
    }

    async parseTasks() {
        this.sourceContainers.clear();
        let tasks = await vscode.tasks.fetchTasks().then(function (value) {
            return value;
        });

        this.createSourceContainers(tasks);

        for (let i = 0; i < tasks.length; ++i) {
            this.parseTask(tasks[i]);
        }

        this.collapseBigFolders();
    }

    getTreeItem(element: TaskItem): vscode.TreeItem {
        return element;
    }

    collapseBigFolders(): void {
        const stack: TaskFolder[] = [...this.sourceContainers.values()];
        const autoCollapseLimit: number = vscode.workspace.getConfiguration('tasktrigger').get('autoCollapseLimit', 5);

        while (stack.length > 0) {
            const folder = stack.pop()!;

            folder.collapsibleState = folder.entries.length > autoCollapseLimit
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.Expanded;

            for (const entry of folder.entries) {
                if (entry instanceof TaskFolder) {
                    stack.push(entry);
                }
            }
        }
    }

    async refresh() {
        await this.parseTasks();
        this.onDidChangeTreeDataEmitter.fire(null);
    }

    async getChildren(element?: TaskItem | TaskFolder): Promise<(TaskItem | TaskFolder)[]> {
        await this.parseTasks();

        if (!element) {
            return Promise.resolve([...this.sourceContainers.values()]);
        }
        else if (element instanceof TaskFolder) {
            element.entries.sort();
            return Promise.resolve(element.entries);
        }
        else {
            return Promise.resolve([]);
        }
    }
}

class TaskFolder extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly expanded: boolean,
        public entries: (TaskItem | TaskFolder)[]
    ) {
        super(label, expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed);
    }
}

class TaskItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly task: vscode.Task
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.task = task;
        this.description = task.definition.detail;
        this.command = { command: 'tasktrigger.triggerTask', title: "Trigger", arguments: [task] };
    }
}

function getFolderName(taskName: string): string | undefined {
    const separatorRegex = vscode.workspace.getConfiguration('tasktrigger').get('separatorRegex', '*');
    const parts = taskName.split(new RegExp(separatorRegex));
    return parts.length > 1 ? parts[0].trim() : undefined;
}

function getTaskNameWithoutFolderName(taskName: string): string {
    const separatorRegex = vscode.workspace.getConfiguration('tasktrigger').get('separatorRegex', '*');
    const parts = taskName.split(new RegExp(separatorRegex));

    if (parts.length > 1) {
        return parts[1].trim();
    } else {
        return taskName;
    }
}