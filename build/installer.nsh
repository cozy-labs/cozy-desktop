; Custom NSIS macros for Twake Desktop installer

; Remove application configuration and data created during normal use when uninstalling
!macro customUnInstall
  RMDir /r "$PROFILE\.twake-desktop"
  ; Also remove the legacy directory from when the app was named Cozy Desktop
  RMDir /r "$PROFILE\.cozy-desktop"
!macroend
