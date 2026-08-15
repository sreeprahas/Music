; Uninstall-only customization. Installation remains electron-builder one-click.
!macro customUnInit
  MessageBox MB_YESNO|MB_DEFBUTTON2|MB_ICONQUESTION "Remove all Music app data from the AppData?$\n$\nThis removes downloaded songs, custom playlists and settings" IDYES remove_music_data
  Goto keep_music_data
  remove_music_data:
    SetShellVarContext current
    RMDir /r "$APPDATA\Music"
  keep_music_data:
!macroend
