param(
    [Parameter(Mandatory=$true)][string]$Action,
    [string]$ParentHWND = "0",
    [int]$X = 0,
    [int]$Y = 32,
    [int]$W = 800,
    [int]$H = 568
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class NativeApi {
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
    [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr hwnd, int index, int val);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr hwnd, int index);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr hwndAfter, int x, int y, int w, int h, uint flags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd, int cmd);
    [DllImport("user32.dll")] public static extern int SetWindowLongPtr(IntPtr hwnd, int index, long val);
}
"@ -ErrorAction SilentlyContinue

function Find-TelegramHWND {
    # Try up to 15 seconds (30 x 500ms)
    for ($i = 0; $i -lt 30; $i++) {
        $hwnd = [NativeApi]::FindWindow("TelegramDesktop", $null)
        if ($hwnd -ne [IntPtr]::Zero) { return $hwnd }
        Start-Sleep -Milliseconds 500
    }
    return [IntPtr]::Zero
}

switch ($Action) {
    "find" {
        $hwnd = [NativeApi]::FindWindow("TelegramDesktop", $null)
        Write-Output $hwnd.ToInt64()
    }
    "embed" {
        $tgHwnd = Find-TelegramHWND
        if ($tgHwnd -eq [IntPtr]::Zero) { Write-Output "NOT_FOUND"; exit 1 }

        # Strip window chrome (caption, thick frame, sys menu, min/max/close)
        $GWL_STYLE = -16
        $WS_CAPTION     = 0x00C00000
        $WS_THICKFRAME  = 0x00040000
        $WS_SYSMENU     = 0x00080000
        $WS_MINIMIZEBOX = 0x00020000
        $WS_MAXIMIZEBOX = 0x00010000

        $style = [NativeApi]::GetWindowLong($tgHwnd, $GWL_STYLE)
        $strip = $WS_CAPTION -bor $WS_THICKFRAME -bor $WS_SYSMENU -bor $WS_MINIMIZEBOX -bor $WS_MAXIMIZEBOX
        $newStyle = $style -band (-bnot $strip)
        [NativeApi]::SetWindowLong($tgHwnd, $GWL_STYLE, $newStyle) | Out-Null

        # Reparent into Electron window
        $parent = [IntPtr][long]$ParentHWND
        [NativeApi]::SetParent($tgHwnd, $parent) | Out-Null

        # Position inside the content area
        $SWP_SHOWWINDOW = 0x0040
        [NativeApi]::SetWindowPos($tgHwnd, [IntPtr]::Zero, $X, $Y, $W, $H, $SWP_SHOWWINDOW) | Out-Null

        Write-Output $tgHwnd.ToInt64()
    }
    "resize" {
        $hwndVal = [long]$ParentHWND  # Re-using ParentHWND param to carry tgHWND for resize
        $tgHwnd = [IntPtr]$hwndVal
        $SWP_NOZORDER = 0x0004
        [NativeApi]::SetWindowPos($tgHwnd, [IntPtr]::Zero, $X, $Y, $W, $H, $SWP_NOZORDER) | Out-Null
        Write-Output "OK"
    }
    "show" {
        $hwndVal = [long]$ParentHWND
        $tgHwnd = [IntPtr]$hwndVal
        [NativeApi]::ShowWindow($tgHwnd, 5) | Out-Null  # SW_SHOW
        Write-Output "OK"
    }
    "hide" {
        $hwndVal = [long]$ParentHWND
        $tgHwnd = [IntPtr]$hwndVal
        [NativeApi]::ShowWindow($tgHwnd, 0) | Out-Null  # SW_HIDE
        Write-Output "OK"
    }
    "detach" {
        $hwndVal = [long]$ParentHWND
        $tgHwnd = [IntPtr]$hwndVal
        # Restore window chrome
        $GWL_STYLE  = -16
        $WS_CAPTION     = 0x00C00000
        $WS_THICKFRAME  = 0x00040000
        $WS_SYSMENU     = 0x00080000
        $WS_MINIMIZEBOX = 0x00020000
        $WS_MAXIMIZEBOX = 0x00010000
        $style = [NativeApi]::GetWindowLong($tgHwnd, $GWL_STYLE)
        $restore = $WS_CAPTION -bor $WS_THICKFRAME -bor $WS_SYSMENU -bor $WS_MINIMIZEBOX -bor $WS_MAXIMIZEBOX
        [NativeApi]::SetWindowLong($tgHwnd, $GWL_STYLE, ($style -bor $restore)) | Out-Null
        # Un-parent (set parent to desktop)
        [NativeApi]::SetParent($tgHwnd, [IntPtr]::Zero) | Out-Null
        [NativeApi]::ShowWindow($tgHwnd, 5) | Out-Null
        Write-Output "OK"
    }
}
