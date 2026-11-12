// Everything Gitter asks of the operating system outside of git: dialogs, the
// file manager, terminals, editors and installers. Gitter supports Windows and
// macOS; adding a platform means adding a branch to each function here.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { UserError } from './errors';

type Platform = 'win32' | 'darwin';

function platform(): Platform {
  if (process.platform === 'win32' || process.platform === 'darwin') return process.platform;
  throw new UserError(`Gitter does not support ${process.platform}.`);
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

// Start a program that outlives the request (file manager, terminal, installer).
function launch(command: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, detached: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/** Whether a command-line tool is installed: a path that exists, or a name on PATH. */
async function installed(tool: string): Promise<boolean> {
  if (/[\\/]/.test(tool)) return fs.existsSync(tool);
  const { code } = await run(platform() === 'win32' ? 'where.exe' : 'which', [tool]);
  return code === 0;
}

/**
 * Starts an editor or diff tool and leaves it running. No shell parses the
 * arguments, which come from file names in the repository. On Windows these
 * tools are often .cmd shims, which only cmd.exe can start: every argument is
 * quoted for it (Windows file names cannot contain quotes), so &, |, <, > and ^
 * stay literal.
 */
function launchTool(tool: string, args: string[]): Promise<void> {
  if (platform() !== 'win32') return launch(tool, args);
  const line = [tool, ...args].map((arg) => `"${arg}"`).join(' ');
  return new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/d', '/s', '/c', `"${line}"`], { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/** Splits a command template like `"C:\\Tools\\diff.exe" --two %1 %2` into words. */
function words(template: string): string[] {
  return (template.match(/"[^"]*"|\S+/g) ?? []).map((w) => w.replace(/^"|"$/g, ''));
}

// The modern Explorer folder picker (IFileOpenDialog), not the legacy tree
// dialog. Gitter's backend has no window, so a hidden topmost form owns the
// dialog to bring it in front of the browser.
const WINDOWS_FOLDER_PICKER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class GitterFolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  private class FileOpenDialog {}

  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileOpenDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint count, IntPtr specs);
    void SetFileTypeIndex(uint index);
    void GetFileTypeIndex(out uint index);
    void Advise(IntPtr events, out uint cookie);
    void Unadvise(uint cookie);
    void SetOptions(uint options);
    void GetOptions(out uint options);
    void SetDefaultFolder(IShellItem item);
    void SetFolder(IShellItem item);
    void GetFolder(out IShellItem item);
    void GetCurrentSelection(out IShellItem item);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string name);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string label);
    void GetResult(out IShellItem item);
  }

  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr bindCtx, [In] ref Guid handler, [In] ref Guid riid, out IntPtr result);
    void GetParent(out IShellItem parent);
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
  private static extern void SHCreateItemFromParsingName(string path, IntPtr bindCtx, [In] ref Guid riid, out IShellItem item);

  private const uint FOS_PICKFOLDERS = 0x20;
  private const uint FOS_FORCEFILESYSTEM = 0x40;
  private const uint SIGDN_FILESYSPATH = 0x80058000;
  private const int ERROR_CANCELLED = unchecked((int)0x800704C7);

  public static string Pick(IntPtr owner, string title, string startIn) {
    IFileOpenDialog dialog = (IFileOpenDialog)new FileOpenDialog();
    uint options;
    dialog.GetOptions(out options);
    dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM);
    if (!String.IsNullOrEmpty(title)) dialog.SetTitle(title);
    if (!String.IsNullOrEmpty(startIn) && System.IO.Directory.Exists(startIn)) {
      Guid shellItem = typeof(IShellItem).GUID;
      IShellItem folder;
      SHCreateItemFromParsingName(startIn, IntPtr.Zero, ref shellItem, out folder);
      dialog.SetFolder(folder);
    }
    int hr = dialog.Show(owner);
    if (hr == ERROR_CANCELLED) return null;
    if (hr != 0) Marshal.ThrowExceptionForHR(hr);
    IShellItem result;
    dialog.GetResult(out result);
    string picked;
    result.GetDisplayName(SIGDN_FILESYSPATH, out picked);
    return picked;
  }
}
'@
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.Opacity = 0
$owner.FormBorderStyle = 'None'
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Show()
$owner.Activate()
try {
  $picked = [GitterFolderPicker]::Pick($owner.Handle, $env:GITTER_PICKER_TITLE, $env:GITTER_PICKER_START)
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  if ($picked) { [Console]::Out.Write($picked) }
} finally {
  $owner.Dispose()
}
`;

/** Shows the OS folder picker. Resolves to the chosen folder, or null if cancelled. */
export async function pickFolder(title = 'Select folder'): Promise<string | null> {
  if (platform() === 'win32') {
    const encoded = Buffer.from(WINDOWS_FOLDER_PICKER, 'utf16le').toString('base64');
    const { code, stdout, stderr } = await run(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { GITTER_PICKER_TITLE: title }
    );
    if (code !== 0) throw new Error(`Folder picker failed: ${stderr.trim() || `exit code ${code}`}`);
    const picked = stdout.trim();
    return picked ? picked.replace(/\\/g, '/') : null;
  }

  const script = [
    'tell application "System Events" to activate',
    `tell application "System Events" to return POSIX path of (choose folder with prompt ${JSON.stringify(title)})`,
  ];
  const { code, stdout, stderr } = await run('osascript', script.flatMap((line) => ['-e', line]));
  // osascript reports "User canceled" as error -128.
  if (code !== 0) {
    if (stderr.includes('-128')) return null;
    throw new Error(`Folder picker failed: ${stderr.trim()}`);
  }
  return stdout.trim().replace(/\/$/, '') || null;
}

export async function openUrl(url: string): Promise<void> {
  if (!/^https?:\/\//.test(url)) throw new UserError('Only http(s) URLs can be opened.');
  if (platform() === 'win32') await launch('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
  else await launch('open', [url]);
}

/** Opens the file manager with the target selected. */
export async function revealInFileManager(target: string): Promise<void> {
  if (platform() === 'win32') {
    const winPath = target.replace(/\//g, '\\');
    // explorer.exe exits with code 1 even on success, so only spawn failures count.
    await launch('explorer.exe', fs.existsSync(winPath) && fs.statSync(winPath).isFile() ? [`/select,${winPath}`] : [winPath]);
  } else {
    await launch('open', ['-R', target]);
  }
}

export async function openTerminal(directory: string): Promise<void> {
  if (platform() === 'win32') {
    await launch('cmd.exe', ['/c', 'start', 'powershell.exe', '-NoExit'], directory);
  } else {
    await launch('open', ['-a', 'Terminal', directory]);
  }
}

const EDITORS = ['code', 'cursor', 'windsurf'];

/** Opens the target in the first installed VS Code-family editor. */
export async function openInEditor(target: string): Promise<void> {
  for (const editor of EDITORS) {
    if (await installed(editor)) return launchTool(editor, [target]);
  }
  throw new UserError(`No editor found. Install one of: ${EDITORS.join(', ')}.`);
}

/**
 * Opens a two-way diff. `customCommand` is the user's own diff tool command line,
 * with %1 for the old file and %2 for the new one.
 */
export async function openDiffTool(oldFile: string, newFile: string, customCommand?: string): Promise<void> {
  const templates = customCommand?.trim()
    ? [customCommand]
    : platform() === 'win32'
      ? ['code --diff %1 %2', 'WinMergeU %1 %2', 'bcomp %1 %2']
      : ['code --diff %1 %2', 'opendiff %1 %2'];
  for (const template of templates) {
    const [tool, ...args] = words(template).map((w) => (w === '%1' ? oldFile : w === '%2' ? newFile : w));
    if (tool && (await installed(tool))) return launchTool(tool, args);
  }
  throw new UserError(
    customCommand?.trim() ? `The diff tool in Settings was not found: ${words(customCommand)[0]}` : 'No diff tool found. Install VS Code or set a diff tool in Settings.'
  );
}

/** Runs a downloaded installer. Windows installers run silently and restart Gitter. */
export async function launchInstaller(installerPath: string): Promise<void> {
  const ext = path.extname(installerPath).toLowerCase();
  if (platform() === 'win32') {
    if (ext === '.msi') await launch('msiexec.exe', ['/i', installerPath, '/passive']);
    else await launch(installerPath, ['/S']);
  } else {
    await launch('open', [installerPath]);
  }
}
