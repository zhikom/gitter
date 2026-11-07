import * as vscode from 'vscode';
import * as path from 'path';

let activeWebviewPanel: vscode.WebviewPanel | null = null;

export function activate(context: vscode.ExtensionContext) {
  // Register Activity Bar Tree View
  const quickActionsProvider = new GitterQuickActionsProvider();
  vscode.window.registerTreeDataProvider('gitter.quickActions', quickActionsProvider);

  // Command: Open Interactive Commit Graph
  const openGraphCmd = vscode.commands.registerCommand('gitter.openGraph', () => {
    openGitterWebview(context, { view: 'graph' });
  });

  // Command: Open Working Tree & Diff Viewer
  const openDiffCmd = vscode.commands.registerCommand('gitter.openDiff', () => {
    openGitterWebview(context, { view: 'diff' });
  });

  // Command: View File History Timeline
  const fileHistoryCmd = vscode.commands.registerCommand('gitter.fileHistory', (uri?: vscode.Uri) => {
    const targetUri = uri || vscode.window.activeTextEditor?.document.uri;
    if (!targetUri || targetUri.scheme !== 'file') {
      vscode.window.showInformationMessage('Please open a file to view its Git history.');
      return;
    }
    const relativePath = vscode.workspace.asRelativePath(targetUri);
    openGitterWebview(context, { view: 'fileHistory', filePath: relativePath });
  });

  // Command: Shelve Changes (JetBrains Shelf)
  const shelveCmd = vscode.commands.registerCommand('gitter.shelve', async () => {
    const shelfName = await vscode.window.showInputBox({
      prompt: 'Enter name for the JetBrains shelf',
      placeHolder: `Shelf: ${new Date().toLocaleTimeString()}`,
    });
    if (!shelfName) return;

    openGitterWebview(context, { view: 'shelve', shelfName });
  });

  // Command: GitButler Virtual Branches
  const virtualBranchesCmd = vscode.commands.registerCommand('gitter.virtualBranches', () => {
    openGitterWebview(context, { view: 'virtualBranches' });
  });

  // Command: 3-Way Conflict Resolver
  const conflictResolverCmd = vscode.commands.registerCommand('gitter.conflictResolver', () => {
    openGitterWebview(context, { view: 'conflicts' });
  });

  // Command: Launch Desktop App
  const launchDesktopCmd = vscode.commands.registerCommand('gitter.launchDesktop', () => {
    const config = vscode.workspace.getConfiguration('gitter');
    const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';
    vscode.env.openExternal(vscode.Uri.parse(serverUrl));
  });

  context.subscriptions.push(
    openGraphCmd,
    openDiffCmd,
    fileHistoryCmd,
    shelveCmd,
    virtualBranchesCmd,
    conflictResolverCmd,
    launchDesktopCmd
  );
}

interface WebviewOptions {
  view: 'graph' | 'diff' | 'fileHistory' | 'shelve' | 'virtualBranches' | 'conflicts';
  filePath?: string;
  shelfName?: string;
}

function openGitterWebview(context: vscode.ExtensionContext, options: WebviewOptions) {
  const column = vscode.window.activeTextEditor
    ? vscode.ViewColumn.Beside
    : vscode.ViewColumn.One;

  if (activeWebviewPanel) {
    activeWebviewPanel.reveal(column);
    // Post initial action
    activeWebviewPanel.webview.postMessage({ type: 'navigate', ...options });
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'gitterGraph',
    'Gitter - Commit Graph',
    column,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  activeWebviewPanel = panel;

  panel.onDidDispose(() => {
    activeWebviewPanel = null;
  });

  // Handle messages from the webview back to VS Code
  panel.webview.onDidReceiveMessage(
    async (message: any) => {
      switch (message.command) {
        case 'openFile': {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (workspaceFolder && message.filePath) {
            const fileUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, message.filePath));
            const doc = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One });
          }
          break;
        }
        case 'notify': {
          vscode.window.showInformationMessage(message.text);
          break;
        }
        case 'alertError': {
          vscode.window.showErrorMessage(message.text);
          break;
        }
      }
    },
    undefined,
    context.subscriptions
  );

  const config = vscode.workspace.getConfiguration('gitter');
  const serverUrl = config.get<string>('serverUrl') || 'http://localhost:3000';
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

  panel.webview.html = getWebviewContent(serverUrl, workspaceRoot, options);
}

function getWebviewContent(serverUrl: string, workspaceRoot: string, options: WebviewOptions): string {
  const iframeSrc = `${serverUrl}/?embed=vscode&repo=${encodeURIComponent(workspaceRoot)}&view=${options.view}${
    options.filePath ? `&file=${encodeURIComponent(options.filePath)}` : ''
  }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gitter</title>
  <style>
    body, html {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #14181f;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .fallback-container {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #94a3b8;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
      padding: 24px;
    }
    .title {
      font-size: 16px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 8px;
    }
    .btn {
      margin-top: 16px;
      background: #0d9488;
      color: #ffffff;
      padding: 8px 16px;
      border-radius: 4px;
      text-decoration: none;
      font-weight: 500;
      font-size: 13px;
      cursor: pointer;
      border: none;
    }
    .btn:hover {
      background: #14b8a6;
    }
  </style>
</head>
<body>
  <iframe id="gitter-frame" src="${iframeSrc}" allow="clipboard-read; clipboard-write"></iframe>
  <div id="fallback" class="fallback-container">
    <div class="title">Gitter Server is Not Running</div>
    <div>Start Gitter backend or launch the standalone app to use Gitter inside VS Code.</div>
    <button class="btn" onclick="retry()">Retry Connection</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const iframe = document.getElementById('gitter-frame');
    const fallback = document.getElementById('fallback');

    // Forward messages from iframe up to VS Code
    window.addEventListener('message', (event) => {
      if (event.data) {
        vscode.postMessage(event.data);
      }
    });

    function retry() {
      fallback.style.display = 'none';
      iframe.style.display = 'block';
      iframe.src = iframe.src;
    }

    // Detect iframe load failure
    setTimeout(() => {
      try {
        if (!iframe.contentWindow || iframe.contentWindow.length === 0) {
          // If server is unreachable
        }
      } catch (e) {}
    }, 4000);
  </script>
</body>
</html>`;
}

class GitterQuickActionsProvider implements vscode.TreeDataProvider<GitterQuickActionItem> {
  getTreeItem(element: GitterQuickActionItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<GitterQuickActionItem[]> {
    return Promise.resolve([
      new GitterQuickActionItem(
        'Interactive Commit Graph',
        'Topological lanes, merge curves, cherry-pick',
        new vscode.ThemeIcon('git-commit'),
        { command: 'gitter.openGraph', title: 'Open Commit Graph' }
      ),
      new GitterQuickActionItem(
        'Multi-Branch Virtual Lanes',
        'GitButler-style virtual branch stacking',
        new vscode.ThemeIcon('git-pull-request'),
        { command: 'gitter.virtualBranches', title: 'Virtual Branches' }
      ),
      new GitterQuickActionItem(
        'Shelve Changes (JetBrains)',
        'Shelve & unshelve local working changes',
        new vscode.ThemeIcon('bookmark'),
        { command: 'gitter.shelve', title: 'Shelve Changes' }
      ),
      new GitterQuickActionItem(
        'Working Tree & Line Staging',
        'Sublime Merge-style hunk and line staging',
        new vscode.ThemeIcon('diff'),
        { command: 'gitter.openDiff', title: 'Open Diff' }
      ),
      new GitterQuickActionItem(
        '3-Way Merge Conflict Resolver',
        'GitKraken-style visual conflict resolver',
        new vscode.ThemeIcon('git-merge'),
        { command: 'gitter.conflictResolver', title: 'Conflict Resolver' }
      ),
      new GitterQuickActionItem(
        'Launch Standalone Gitter App',
        'Open native high-speed desktop client',
        new vscode.ThemeIcon('link-external'),
        { command: 'gitter.launchDesktop', title: 'Launch Desktop App' }
      ),
    ]);
  }
}

class GitterQuickActionItem extends vscode.TreeItem {
  constructor(
    label: string,
    desc: string,
    icon: vscode.ThemeIcon,
    cmd?: vscode.Command
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = desc;
    this.iconPath = icon;
    this.command = cmd;
  }
}

export function deactivate() {
  if (activeWebviewPanel) {
    activeWebviewPanel.dispose();
  }
}
