Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Git Repository Folder"
$dialog.ShowNewFolderButton = $true

$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$topForm.Opacity = 0
$topForm.ShowInTaskbar = $false
$topForm.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$topForm.Size = New-Object System.Drawing.Size(1, 1)
$topForm.StartPosition = [System.Windows.Forms.FormStartPosition]::CenterScreen
$topForm.Show()
$topForm.BringToFront()

$result = $dialog.ShowDialog($topForm)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::WriteLine($dialog.SelectedPath)
}
$topForm.Dispose()
$dialog.Dispose()
