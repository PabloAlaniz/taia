declare module 'vscode' {
  export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
  }
  export enum StatusBarAlignment {
    Left = 1,
    Right = 2,
  }
  export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
  }

  export class ThemeIcon {
    constructor(id: string)
  }
  export class TreeItem {
    label?: string
    collapsibleState?: TreeItemCollapsibleState
    description?: string | boolean
    tooltip?: string
    contextValue?: string
    iconPath?: ThemeIcon
    command?: Command
    constructor(label: string, collapsibleState?: TreeItemCollapsibleState)
  }

  export interface Command {
    command: string
    title: string
    arguments?: unknown[]
  }
  export interface TreeDataProvider<T> {
    getTreeItem(element: T): TreeItem
    getChildren(element?: T): ProviderResult<T[]>
  }
  export type ProviderResult<T> = T | undefined | null | Thenable<T | undefined | null>
  export class EventEmitter<T> {
    event: Event<T>
    fire(data?: T): void
    dispose(): void
  }
  export interface Event<T> {
    (listener: (e: T) => unknown): Disposable
  }
  export interface Disposable {
    dispose(): void
  }
  export interface ExtensionContext {
    subscriptions: Disposable[]
  }
  export interface StatusBarItem extends Disposable {
    text: string
    tooltip?: string
    command?: string
    show(): void
  }
  export interface WorkspaceConfiguration {
    get<T>(section: string, defaultValue: T): T
    update(
      section: string,
      value: unknown,
      configurationTarget?: ConfigurationTarget | boolean,
    ): Thenable<void>
  }
  export namespace workspace {
    function getConfiguration(section?: string): WorkspaceConfiguration
  }
  export namespace window {
    function registerTreeDataProvider<T>(viewId: string, provider: TreeDataProvider<T>): Disposable
    function createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem
    function showErrorMessage(message: string): Thenable<string | undefined>
    function showInformationMessage(message: string): Thenable<string | undefined>
    function showWarningMessage(message: string): Thenable<string | undefined>
    function showInputBox(options?: {
      title?: string
      prompt?: string
      placeHolder?: string
      value?: string
      password?: boolean
      ignoreFocusOut?: boolean
    }): Thenable<string | undefined>
    function showQuickPick<T extends string | Record<string, unknown>>(
      items: readonly T[] | Thenable<readonly T[]>,
      options?: { title?: string; placeHolder?: string },
    ): Thenable<T | undefined>
  }
  export namespace commands {
    function registerCommand(command: string, callback: (...args: unknown[]) => unknown): Disposable
  }
}
