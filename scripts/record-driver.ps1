<#
.SYNOPSIS
  Records the scripted driver-app clip on the Android emulator (STORYBOARD D.6).

.DESCRIPTION
  boot emulator if needed -> adb reverse -> location + geo fix -> clean status bar -> run
  integration_test/demo_flow_test.dart (Flutter via the x86 PowerShell) -> on `DEMO_MARK ready` start
  `adb shell screenrecord --display-id <id> --bit-rate 8000000` -> on `DEMO_MARK GEO` move the emulator
  -> stop recording when the test exits -> pull the MP4 and write driver-marks.json.

  The trip must exist: run `node backend/scripts/seed-demo.mjs --live-trip` first (writes the handoff file).

.EXAMPLE
  pwsh -File scripts/record-driver.ps1 -Slot 2
  pwsh -File scripts/record-driver.ps1 -ApiPort 8807 -Handoff desktop/showcase/.handoff.json -Out desktop/showcase/.work/driver.mp4

.NOTES
  screenrecord stops at 180 s: the whole flow from `ready` must stay under 170 s (the script aborts the
  recording and fails if the test overruns). PACE_PERCENT can be passed with -Pace to shorten dwells.
#>
param(
  [int]$Slot = $(if ($env:SHOWCASE_SLOT) { [int]$env:SHOWCASE_SLOT } else { 0 }),
  [int]$ApiPort = 0,                      # default 8787 + 10*Slot
  [string]$Handoff = '',                  # default desktop/showcase/.handoff.json
  [string]$Out = '',                      # default desktop/showcase/.work/driver.mp4
  [string]$Avd = 'Resizable_Experimental',
  [string]$Serial = 'emulator-5554',
  [int]$Pace = 100,
  [double]$Lat = 9.9312,                  # check-in position shown on screen
  [double]$Lng = 76.2673,
  [switch]$NoRecord,                      # dry run: run the flow without screenrecord
  [switch]$AcceptLocationDialog,          # warm-up run (use with -NoRecord) that taps "Turn on" on the Location Accuracy dialog
  [switch]$DebugShots,                   # screencap after every GEO mark (.work/dbg-N.png)
  [switch]$KeepDemoMode
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $Handoff) { $Handoff = Join-Path $repo 'desktop/showcase/.handoff.json' }
if (-not $Out) { $Out = Join-Path $repo 'desktop/showcase/.work/driver.mp4' }
if ($ApiPort -eq 0) { $ApiPort = 8787 + 10 * $Slot }
$workDir = Split-Path $Out -Parent
New-Item -ItemType Directory -Force $workDir | Out-Null
$marksFile = Join-Path $workDir 'driver-marks.json'
$logFile = Join-Path $workDir 'driver-flutter.log'
$pkg = 'com.travelcrm.driver_app'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$x86ps = 'C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe'
function Log($m) { Write-Host "[record-driver] $m" }
function Adb { & $adb -s $Serial @args }

# ── 1. handoff ──────────────────────────────────────────────
if (-not (Test-Path $Handoff)) { throw "handoff file not found: $Handoff (run: node backend/scripts/seed-demo.mjs --live-trip)" }
$h = Get-Content $Handoff -Raw | ConvertFrom-Json
$tripId = $h.tripId
$phone = if ($h.driverPhone) { $h.driverPhone } elseif ($h.driverPhoneLocal) { $h.driverPhoneLocal } else { '9876543210' }
$otp = if ($h.otp) { $h.otp } else { '123456' }
$tenant = if ($h.tenantId) { $h.tenantId } else { '01960000-0000-7000-8000-000000000001' }
Log "trip $tripId, driver $phone, API tcp:$ApiPort"

# ── 2. emulator ─────────────────────────────────────────────
$devs = (& $adb devices) -join "`n"
if ($devs -notmatch "$Serial\s+device") {
  Log "booting AVD $Avd"
  Start-Process (Join-Path $sdk 'emulator\emulator.exe') -ArgumentList "-avd $Avd -no-snapshot-save -no-boot-anim -no-audio"
  & $adb wait-for-device | Out-Null
}
$deadline = (Get-Date).AddMinutes(4)
while ((Get-Date) -lt $deadline) {
  if ((Adb shell getprop sys.boot_completed 2>$null) -match '1') { break }
  Start-Sleep -Seconds 3
}
if (-not ((Adb shell getprop sys.boot_completed) -match '1')) { throw 'emulator did not finish booting' }
Start-Sleep -Seconds 2

# ── 3. device prep ──────────────────────────────────────────
Adb reverse tcp:8787 tcp:$ApiPort | Out-Null
Adb shell cmd location set-location-enabled true | Out-Null
Adb shell settings put secure location_mode 3 | Out-Null
Adb emu geo fix $Lng $Lat | Out-Null                      # longitude first
Adb shell settings put system screen_off_timeout 1800000 | Out-Null
Adb shell settings put secure show_ime_with_hard_keyboard 0 | Out-Null
Adb shell input keyevent KEYCODE_WAKEUP | Out-Null
Adb shell wm dismiss-keyguard | Out-Null
# the test injects text programmatically: switch the on-screen keyboard (and its floating toolbar) off for the take
$imes = @(Adb shell ime list -s 2>$null) | Where-Object { $_ -match "/" } | ForEach-Object { $_.Trim() }
foreach ($ime in $imes) { Adb shell ime disable $ime | Out-Null }

# clean status bar (demo mode)
$hhmm = [DateTime]::UtcNow.AddMinutes(330).ToString('HHmm')
Adb shell settings put global sysui_demo_allowed 1 | Out-Null
$demo = 'am broadcast -a com.android.systemui.demo -e command'
Adb shell "$demo enter" | Out-Null
Adb shell "$demo clock -e hhmm $hhmm" | Out-Null
Adb shell "$demo battery -e level 100 -e plugged false" | Out-Null
Adb shell "$demo network -e wifi show -e level 4" | Out-Null
Adb shell "$demo network -e mobile show -e datatype 4g -e level 4" | Out-Null
Adb shell "$demo notifications -e visible false" | Out-Null

# physical display id (screenrecord/screencap need it when the AVD reports several displays)
$dispLine = (Adb shell dumpsys SurfaceFlinger --display-id) | Select-String -Pattern 'Display (\d+)' | Select-Object -First 1
$displayId = if ($dispLine) { $dispLine.Matches[0].Groups[1].Value } else { '' }
Log "display id: $displayId"

if ((Adb shell pm list packages $pkg) -match $pkg) { Adb shell pm clear $pkg | Out-Null }
Adb shell rm -f /sdcard/driver.mp4 | Out-Null

# ── 4. run the flow, react to its marks ─────────────────────
$driverDir = Join-Path $repo 'packages/driver_app'
$flutterCmd = "cd '$driverDir'; flutter test integration_test/demo_flow_test.dart -d $Serial " +
  "--dart-define=API_BASE_URL=http://localhost:8787 --dart-define=TENANT_ID=$tenant --dart-define=ENVIRONMENT=dev " +
  "--dart-define=TRIP_ID=$tripId --dart-define=DRIVER_PHONE=$phone --dart-define=OTP=$otp --dart-define=PACE_PERCENT=$Pace 2>&1; exit `$LASTEXITCODE"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $x86ps
$psi.Arguments = "-NoProfile -Command `"$flutterCmd`""
$psi.RedirectStandardOutput = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$nowMs = { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

$marks = New-Object System.Collections.ArrayList
$recProc = $null
$recStartHost = 0
$readyHost = 0
$log = New-Object System.IO.StreamWriter($logFile, $false)
Log 'starting flutter test (first run compiles the app, this can take several minutes)'
$p = [System.Diagnostics.Process]::Start($psi)
try {
  while ($null -ne ($line = $p.StandardOutput.ReadLine())) {
    $log.WriteLine($line); $log.Flush()
    $t = & $nowMs
    if ($line -match 'DEMO_MARK (\S+)(?: (.*?))? @(\d+)\s*$') {
      $name = $Matches[1]; $text = $Matches[2]; $inTest = [int]$Matches[3]
      [void]$marks.Add([ordered]@{ name = $name; text = $text; tInTestMs = $inTest; tHostMs = $t })
      Log ("mark {0} {1} @{2}ms" -f $name, $text, $inTest)
      if ($name -eq 'ready') {
        $readyHost = $t
        Adb shell pm grant $pkg android.permission.ACCESS_FINE_LOCATION 2>$null | Out-Null
        Adb shell pm grant $pkg android.permission.ACCESS_COARSE_LOCATION 2>$null | Out-Null
        if (-not $NoRecord) {
          $rargs = @('-s', $Serial, 'shell', 'screenrecord', '--bit-rate', '8000000', '--time-limit', '175')
          if ($displayId) { $rargs += @('--display-id', $displayId) }
          $rargs += '/sdcard/driver.mp4'
          $recStartHost = & $nowMs
          $recProc = Start-Process -FilePath $adb -ArgumentList $rargs -PassThru -WindowStyle Hidden
          Log 'screenrecord started'
        }
      }
      elseif ($name -eq 'GEO' -and $text -match '^(\S+) (\S+)$') {
        Adb emu geo fix $Matches[1] $Matches[2] | Out-Null
        if ($AcceptLocationDialog) {
          # One-time warm-up run: consent to Google "Location Accuracy" so it never shows on camera (persists on the AVD).
          Start-Sleep -Seconds 3
          Adb shell input tap 786 1777 | Out-Null
        }
        if ($DebugShots) {
          Start-Sleep -Seconds 3
          $script:shot = 1 + [int]$script:shot
          $dArg = if ($displayId) { "-d $displayId" } else { '' }
          cmd /c "`"$adb`" -s $Serial exec-out screencap $dArg -p > `"$workDir\dbg-$($script:shot).png`""
        }
      }
    }
    elseif ($line -match 'Some tests failed|Error|Exception|FAILED') { Log "flutter: $line" }
  }
  $p.WaitForExit()
  $exit = $p.ExitCode
}
finally {
  $log.Close()
  foreach ($ime in $imes) { Adb shell ime enable $ime | Out-Null }
}

# ── 5. stop + pull ──────────────────────────────────────────
if ($recProc) {
  Adb shell pkill -INT screenrecord 2>$null | Out-Null
  Start-Sleep -Seconds 3
  if (-not $recProc.HasExited) { $recProc.Kill() }
  if ($exit -eq 0) {
    Adb pull /sdcard/driver.mp4 $Out | Out-Null
    Adb shell rm -f /sdcard/driver.mp4 | Out-Null
  }
}
if (-not $KeepDemoMode) { Adb shell "$demo exit" | Out-Null }

# marks on the video timeline: video t = (host time of the mark's line) - recording start, corrected by the
# in-test clock (immune to stdout buffering): t = (readyHost - recStart) + tInTest
$ready = $marks | Where-Object { $_.name -eq 'ready' } | Select-Object -First 1
$done = $marks | Where-Object { $_.name -eq 'done' } | Select-Object -First 1
$base = if ($ready -and $recStartHost) { ($readyHost - $recStartHost) / 1000.0 } else { 0 }
$outMarks = @($marks | ForEach-Object { [ordered]@{ name = $_.name; text = $_.text; tInTestMs = $_.tInTestMs; tVideoS = [math]::Round($base + $_.tInTestMs / 1000.0, 2) } })
[ordered]@{
  tripId = $tripId; recStartHost = $recStartHost; readyHost = $readyHost; exitCode = $exit
  clipStartS = [math]::Round($base + 3.5, 2)
  clipEndS = if ($done) { [math]::Round($base + $done.tInTestMs / 1000.0 + 2, 2) } else { $null }
  marks = $outMarks
} | ConvertTo-Json -Depth 5 | Set-Content $marksFile -Encoding utf8

if ($exit -ne 0) { throw "flutter test exited with $exit - see $logFile" }
if ($done -and ($done.tInTestMs / 1000.0) -gt 170) { throw "clip overran the screenrecord budget: done at $($done.tInTestMs / 1000.0) s (limit 170); rerun with -Pace 80" }
Log "done: $Out  (marks: $marksFile)"
