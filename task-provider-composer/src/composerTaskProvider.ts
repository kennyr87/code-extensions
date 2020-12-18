import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as vscode from 'vscode';

export class ComposerTaskProvider implements vscode.TaskProvider {
	static ComposerType = 'composer';
	private composerPromise: Thenable<vscode.Task[]> | undefined = undefined;

	constructor(workspaceRoot: string) {}

	public provideTasks(): Thenable<vscode.Task[]> | undefined {
		if (!this.composerPromise) {
			this.composerPromise = getComposerTasks();
		}
		return this.composerPromise;
	}

	public resolveTask(_task: vscode.Task): vscode.Task | undefined {
		const task = _task.definition.task;
		// A Composer task consists of a execution script as defined in 
		// contributes.taskDefinitions
		if (task) {
			// resolveTask requires that the same definition object be used.
			const definition: ComposerTaskDefinition = <any>_task.definition;
			return new vscode.Task(definition, _task.scope ?? vscode.TaskScope.Workspace, definition.script, 'composer', new vscode.ShellExecution(`composer run-script ${definition.script}`));
		}
		return undefined;
	}
}

/**
 * Executes a command in a child process
 * 
 * @param {string} command 
 * @param {cp.ExecOptions} options 
 * 
 * @returns {Promise} Promise resolved to commands output
 */
function exec(command: string, options: cp.ExecOptions): Promise<{ stdout: string; stderr: string }> {
	return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
		cp.exec(command, options, (error, stdout, stderr) => {
			if (error) {
				reject({ error, stdout, stderr });
			}
			resolve({ stdout, stderr });
		});
	});
}

let _channel: vscode.OutputChannel;
function getOutputChannel(): vscode.OutputChannel {
	if (!_channel) {
		_channel = vscode.window.createOutputChannel('Composer Auto Detection');
	}
	return _channel;
}

interface ComposerTaskDefinition extends vscode.TaskDefinition {
	/**
	 * The script to execute
	 */
	script: string;
}

const stringCommands: string[] = ['install', 'update', 'status', 'archive'];
const commands: string[] = ['pre-autoload-dump', 'post-autoload-dump', 'post-root-package-install', 'post-create-project-cmd'];
const commandEvents = stringCommands.flatMap( ( event: string ) => {
	return [`pre-${event}-cmd`, `post-${event}-cmd`];
}).concat(commands);

function isCommandEvent(name: string): boolean {
	for (const commandEvent of commandEvents) {
		if (name.indexOf(commandEvent) !== -1) {
			return true;
		}
	}
	return false;
}


/**
 * For every listed tasks create a new vscode.Task implementation
 * 
 * @returns {Promise<vscode.Task[]>} Array of listed tasks
 */
async function getComposerTasks(): Promise<vscode.Task[]> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	const result: vscode.Task[] = [];
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return result;
	}
	for (const workspaceFolder of workspaceFolders) {
		const folderString = workspaceFolder.uri.fsPath;
		if (!folderString) {
			continue;
		}

		// list all composer scripts
		const commandLine = 'composer run -l';

		try {
			const { stdout, stderr } = await exec(commandLine, { cwd: folderString });
			if (stderr && stderr.length > 0) {
				getOutputChannel().appendLine(stderr);
				getOutputChannel().show(true);
			}
			if (stdout) {
				const lines = stdout.split(/\n/);
				for (const line of lines) {
					if (line.length === 0) {
						continue;
					}
					const regExp = /\s(?<command>[\w-]+)\s/i;
					const matches = regExp.exec(line);
					if ( matches && matches.groups != undefined ) {
						const commandName = matches.groups.command;
						const kind: ComposerTaskDefinition = {
							type: 'composer',
							script: commandName
						};
						const task = new vscode.Task(kind, workspaceFolder, commandName, 'composer', new vscode.ShellExecution(`composer run-script ${commandName}`));
						result.push(task);
						const lowerCaseLine = line.toLowerCase();
						if (isCommandEvent(lowerCaseLine)) {
							task.group = vscode.TaskGroup.Build;
						}
					}
				}
			}
		} catch (err) {
			const channel = getOutputChannel();
			if (err.stderr) {
				channel.appendLine(err.stderr);
			}
			if (err.stdout) {
				channel.appendLine(err.stdout);
			}
			channel.appendLine('Auto detecting composer scripts failed.');
			channel.show(true);
		}
	}
	return result;
}
