# Hum installer for Windows testers.
#
#   irm https://muppio.github.io/hum-testers/install.ps1 | iex
#
# Downloads the Hum release pinned below, checks its SHA-256, installs it for the current
# Windows account only (no administrator rights) and opens it. It changes no system or security
# setting, sends nothing anywhere, downloads nothing else, and never touches Hum's settings and
# history in %LOCALAPPDATA%\Hum. To install without opening Hum afterwards:
#
#   & ([scriptblock]::Create((irm https://muppio.github.io/hum-testers/install.ps1))) -NoStart
#
# Works in Windows PowerShell 5.1 and PowerShell 7.

param([switch]$NoStart)

& {
  param([bool]$NoStart)

  Set-StrictMode -Version 2
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'

# BEGIN PINNED RELEASE (written by tools/generate-install-scripts.js from dist/releases.json; do not edit by hand)
  $HumRelease = @{
    Version   = '0.6.40'
    Url       = 'https://github.com/muppio/hum-testers/releases/download/v0.6.40/Hum-0.6.40-Windows-Setup.exe'
    FileName  = 'Hum-0.6.40-Windows-Setup.exe'
    SizeBytes = 79733235
    Sha256    = '5493e4f2c9b40ab9a93f35df34223d383d2d3a48af8e9f0c6d828492e6e5b1e0'
    Kind      = 'setup'
  }
# END PINNED RELEASE

  function Say([string]$Text) { Write-Host $Text }

  # Every process started from a file inside $Folder (Hum and its helpers).
  function Get-ProcessesIn([string]$Folder) {
    $prefix = [IO.Path]::GetFullPath($Folder).TrimEnd('\') + '\'
    @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $path = $null
        try { $path = $_.Path } catch { }
        $path -and $path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)
      })
  }

  function Get-HumProcessesElsewhere([string]$Folder) {
    $prefix = [IO.Path]::GetFullPath($Folder).TrimEnd('\') + '\'
    @(Get-Process -Name 'Hum' -ErrorAction SilentlyContinue | Where-Object {
        $path = $null
        try { $path = $_.Path } catch { }
        -not ($path -and $path.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase))
      })
  }

  function Stop-IfHumIsRunning([string]$Folder) {
    if (@(Get-ProcessesIn $Folder).Count -gt 0) {
      throw "Hum is running from $Folder. Quit Hum from its icon near the clock, then run this command again. Nothing was changed."
    }
  }

  if (-not $HumRelease) {
    Say "The Windows version isn't available yet. Nothing was downloaded."
    $global:LASTEXITCODE = 0
    return
  }

  $savedProtocols = [Net.ServicePointManager]::SecurityProtocol
  $work = $null
  $staging = $null
  $previous = $null
  $installDir = $null
  $installed = $false
  try {
    if (-not $env:LOCALAPPDATA) { throw 'The LOCALAPPDATA folder is not set for this account.' }
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Hum needs 64-bit Windows.' }
    $programs = Join-Path $env:LOCALAPPDATA 'Programs'
    $installDir = Join-Path $programs 'Hum'

    Say "Hum installer for Windows: version $($HumRelease.Version) (unsigned pre-release)"
    Stop-IfHumIsRunning $installDir

    # TLS 1.2 or newer for the download; the previous setting is restored at the end.
    [Net.ServicePointManager]::SecurityProtocol = $savedProtocols -bor [Net.SecurityProtocolType]::Tls12

    $work = Join-Path ([IO.Path]::GetTempPath()) ('hum-install-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $work | Out-Null
    $download = Join-Path $work $HumRelease.FileName
    $megabytes = [Math]::Round($HumRelease.SizeBytes / 1MB)
    Say "Downloading $($HumRelease.FileName) ($megabytes MB)..."
    Invoke-WebRequest -Uri $HumRelease.Url -OutFile $download -UseBasicParsing

    Say 'Checking the SHA-256 checksum...'
    $size = (Get-Item -LiteralPath $download).Length
    $hash = (Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($hash -ne $HumRelease.Sha256 -or $size -ne $HumRelease.SizeBytes) {
      throw "The download doesn't match the published checksum (expected $($HumRelease.Sha256), got $hash). It was deleted and nothing was installed. Try again later."
    }
    Say 'Checksum OK.'

    $hum = Join-Path $installDir 'Hum.exe'
    if ($HumRelease.Kind -eq 'setup') {
      # Hum's per-user Setup (Inno Setup): installs to %LOCALAPPDATA%\Programs\Hum, adds the Start
      # menu entry and an uninstaller, and doesn't open Hum itself when run silently.
      Say 'Running Setup for this Windows account (no administrator rights)...'
      $setup = Start-Process -FilePath $download -Wait -PassThru `
        -ArgumentList '/VERYSILENT', '/SUPPRESSMSGBOXES', '/CURRENTUSER', '/NORESTART'
      if ($setup.ExitCode -ne 0) { throw "Setup stopped with exit code $($setup.ExitCode)." }
      $installed = $true
      if (-not (Test-Path -LiteralPath $hum)) {
        # An earlier install in a folder chosen by hand is updated in that folder instead.
        Say "Setup finished. Hum isn't in $installDir, so it was probably updated where you installed it before. Open Hum from the Start menu."
        $global:LASTEXITCODE = 0
        return
      }
      Say 'Setup finished. Hum is in the Start menu.'
    } else {
      Say "Installing to $installDir..."
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      New-Item -ItemType Directory -Path $programs -Force | Out-Null
      $staging = Join-Path $programs ('Hum.installing-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
      [IO.Compression.ZipFile]::ExtractToDirectory($download, $staging)
      $unpacked = Join-Path $staging 'Hum'
      if (-not (Test-Path -LiteralPath (Join-Path $unpacked 'Hum.exe'))) {
        throw "The download doesn't contain Hum\Hum.exe. Nothing was installed."
      }
      Stop-IfHumIsRunning $installDir
      if (Test-Path -LiteralPath $installDir) {
        $previous = Join-Path $programs ('Hum.previous-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
        try {
          Rename-Item -LiteralPath $installDir -NewName (Split-Path -Leaf $previous)
        } catch {
          $previous = $null
          throw "Couldn't replace the Hum in $installDir; a file in it is in use. Quit Hum and run this command again. Nothing was changed."
        }
      }
      Move-Item -LiteralPath $unpacked -Destination $installDir
      $installed = $true
      if ($previous) {
        Remove-Item -LiteralPath $previous -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $previous) { Say "The previous copy couldn't be removed completely; you can delete $previous." }
        $previous = $null
      }

      $menu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
      try {
        New-Item -ItemType Directory -Path $menu -Force | Out-Null
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut((Join-Path $menu 'Hum.lnk'))
        $link.TargetPath = Join-Path $installDir 'Hum.exe'
        $link.WorkingDirectory = $installDir
        $link.Description = 'Hum'
        $link.Save()
        Say 'Added Hum to the Start menu.'
      } catch {
        Say "Hum is installed, but the Start menu shortcut couldn't be created. Open Hum from $installDir."
      }
    }

    if ($NoStart) {
      Say "Not opening Hum (-NoStart). Open it from the Start menu."
    } elseif (@(Get-ProcessesIn $installDir).Count -gt 0) {
      Say 'Hum is already open.'
    } elseif (@(Get-HumProcessesElsewhere $installDir).Count -gt 0) {
      Say 'Another copy of Hum is already running. Quit it, then open Hum from the Start menu.'
    } else {
      Say 'Opening Hum.'
      Start-Process -FilePath $hum -WorkingDirectory $installDir
    }
    Say "Done. Hum $($HumRelease.Version) is installed for this Windows account only, in $installDir."
    $global:LASTEXITCODE = 0
  } catch {
    if ($previous -and -not $installed -and -not (Test-Path -LiteralPath $installDir)) {
      try { Rename-Item -LiteralPath $previous -NewName (Split-Path -Leaf $installDir) } catch { }
    }
    Write-Host "Hum was not installed: $($_.Exception.Message)" -ForegroundColor Red
    $global:LASTEXITCODE = 1
  } finally {
    [Net.ServicePointManager]::SecurityProtocol = $savedProtocols
    foreach ($folder in @($work, $staging)) {
      if ($folder -and (Test-Path -LiteralPath $folder)) {
        Remove-Item -LiteralPath $folder -Recurse -Force -ErrorAction SilentlyContinue
      }
    }
  }
} $NoStart.IsPresent
