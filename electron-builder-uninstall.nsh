; This macro is invoked by the generated uninstaller only. It is intentionally
; not customUnInit: that initialization hook can also run during upgrades.
!macro customUnInstall
  ; electron-builder sets isUpdated when this uninstaller is launched by the
  ; installer to replace an existing installation. In that workflow the old
  ; files are removed but user data must remain untouched.
  ${if} ${isUpdated}
    Goto keep_music_data
  ${endif}
  ; A normal interactive uninstall reaches this confirmation.
  MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION "Remove all Music app data from the AppData?$\n$\nThis removes downloaded songs, custom playlists and settings" IDYES remove_music_data
  Goto keep_music_data
  remove_music_data:
    SetShellVarContext current
    RMDir /r "$APPDATA\Music"
  keep_music_data:
!macroend
