; Custom NSIS macros for Twake Desktop (included via `nsis.include` in
; electron-builder-config.js).
;
; Twake Desktop appId is `io.cozy.desktop`, whose electron-builder NSIS UUID
; v5 is 4e3f3566-be06-5f9a-b012-0cf924cd77aa. The uninstall registry key
; format changed over electron-builder versions:
;   - v19 (Twake <= v3.15.x):        no braces
;   - v21 (Twake v3.16.0-v3.30.x):   {with braces}
;   - v22+ (Twake >= v3.31):         no braces (current)

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
; the normal mode to show our own MessageBox.
!macro customUnInstall
  ; Do nothing on upgrades: the old uninstaller is invoked with --updated by
  ; the new installer and app data must survive the update.
  ${ifNot} ${isUpdated}
    ; Electron app data (caches, local storage, session state) are
    ; regenerable: always remove them. The user-facing configuration lives in
    ; the profile directory and is handled separately below.
    RMDir /r "$APPDATA\Twake Desktop"
    RMDir /r "$APPDATA\TwakeDesktop"

    ; Never show a dialog on silent uninstalls (/S), e.g. scripted removals.
    ${GetParameters} $R0
    ${GetOptions} $R0 "/S" $R1
    ${if} ${Errors}
      ; Offer to remove the configuration only if there is one to remove.
      ${ifNot} ${FileExists} "$PROFILE\.twake-desktop"
      ${andIfNot} ${FileExists} "$PROFILE\.cozy-desktop"
        Goto no_config_to_remove
      ${endif}

      SetSilent normal

      ; French users get a French dialog, everyone else English. Custom
      ; LangStrings cannot be merged into electron-builder's messages file,
      ; so strings are selected at runtime.
      ${if} $LANGUAGE == ${LANG_FRENCH}
        StrCpy $R2 "Voulez-vous également supprimer la configuration de Twake Desktop (compte, paramètres et base de données locales) ?$\r$\n$\r$\nRépondez Oui pour tout supprimer. Répondez Non pour conserver votre configuration en cas de réinstallation."
      ${else}
        StrCpy $R2 "Do you also want to remove the Twake Desktop configuration (account, settings and local database)?$\r$\n$\r$\nAnswer Yes to remove everything. Answer No to keep your configuration in case you reinstall."
      ${endif}

      ; MB_DEFBUTTON2 keeps "No" as the default: the configuration survives
      ; unless the user explicitly asks for its removal.
      MessageBox MB_YESNO|MB_DEFBUTTON2|MB_TOPMOST|MB_SETFOREGROUND "$R2" IDNO config_keep
      RMDir /r "$PROFILE\.twake-desktop"
      ; Legacy directory from when the app was named Cozy Desktop
      RMDir /r "$PROFILE\.cozy-desktop"

      config_keep:
      SetSilent silent

      no_config_to_remove:
    ${endif}
  ${endif}
!macroend
