; Custom NSIS macros for Twake Desktop (included via `nsis.include` in
; electron-builder-config.js).
;
; Twake Desktop appId is `io.cozy.desktop`, whose electron-builder NSIS UUID
; v5 is 4e3f3566-be06-5f9a-b012-0cf924cd77aa. The uninstall registry key
; format changed over electron-builder versions:
;   - v19 (Twake <= v3.15.x):        no braces
;   - v21 (Twake v3.16.0-v3.30.x):   {with braces}
;   - v22+ (Twake >= v3.31):         no braces (current)

!include "nsDialogs.nsh"
!include "FileFunc.nsh"

!define APP_UNINSTALL_KEY_NO_BRACES "Software\Microsoft\Windows\CurrentVersion\Uninstall\4e3f3566-be06-5f9a-b012-0cf924cd77aa"
!define APP_UNINSTALL_KEY_BRACES "Software\Microsoft\Windows\CurrentVersion\Uninstall\{4e3f3566-be06-5f9a-b012-0cf924cd77aa}"

; Runs at the very end of the install section, on fresh installs, manual
; upgrades and auto-updates (the auto-updater runs the same installer with
; `/S --updated`; `customInstall` has no silent-mode guard in the
; electron-builder templates).
!macro customInstall
  ; Remove orphaned uninstall keys left behind by past installers so that a
  ; single entry ever shows up in Windows' installed apps list. The key
  ; currently written by the installer (no braces, in SHELL_CONTEXT) is never
  ; touched here.
  DeleteRegKey HKCU "${APP_UNINSTALL_KEY_BRACES}"
  ${if} $installMode == "all"
    DeleteRegKey HKLM "${APP_UNINSTALL_KEY_BRACES}"
    ; Per-machine installs from the electron-builder v19 era
    DeleteRegKey HKLM "${APP_UNINSTALL_KEY_NO_BRACES}"
  ${endif}
!macroend

; Runs at the very end of the uninstall section, after the uninstall
; registry keys have been removed and right before `quitSuccess` (which only
; calls Quit). The one-click uninstaller has no MUI pages: un.onInit forces
; `SetSilent silent` after its confirmation MessageBox, so we briefly restore
; the normal mode to show our own nsDialogs dialog.
!macro customUnInstall
  ; Placeholder; filled in the next commit.
!macroend
