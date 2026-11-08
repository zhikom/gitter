Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select Git Repository Folder"
$dialog.ShowNewFolderButton = $true
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$result = $dialog.ShowDialog($topForm)
if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    [Console]::WriteLine($dialog.SelectedPath)
}
$topForm.Dispose()
$dialog.Dispose()
