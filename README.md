Music
A lightweight desktop music library and playback application built with Electron + Next.js, designed around a local-first music experience.
Status: Active development / major refactor planned
The repository currently contains the existing Spotify/YouTube integration and downloader architecture. The target architecture described below is the planned direction for the ongoing refactor.
Overview
Music is a desktop music application focused on keeping the user's library, playlists, downloads, matching data, and playback experience local and fast.
Current stack
Electron for the desktop shell
Next.js 15 for the application UI/server layer
React 19
Tailwind CSS
TypeScript
Local JSON-backed data storage
Spotify metadata integration
YouTube Music/YouTube playback integration
Local MP3 storage
Electron-hosted local Next.js server protected by an internal token
The current package identifies the application as Music, with Electron application ID com.prahas.music. The package description is "Your library. Downloaded. Yours.".
Goals
The refactor is built around four ideas:
Spotify as the metadata/library source
YouTube Music as the playback source
Local caching as the performance layer
The local application as the user's actual library and playlist workspace
Features
Spotify integration
The target Spotify integration keeps the existing Spotify WebQL/GraphQL layer as the primary Spotify data layer rather than replacing it wholesale with the official Spotify Web API.
Planned capabilities include:
Spotify-powered search
Spotify home data
Top tracks
Top artists
Playlists
Liked/saved tracks
Album browsing
Artist browsing
Spotify library synchronization
Persistent Spotify metadata caching
Fast cached home loading
Background refresh
Parallel artist/image enrichment
Spotify search
Search requests will use a persistent/warm WebQL client rather than spawning a Python process for every request.
A normalized query cache will prevent repeated and near-duplicate searches from repeatedly hitting the underlying source.
Spotify → YouTube Music playback
Spotify provides the metadata and identity of a track.
YouTube Music provides the playable source.
The intended flow is:
Spotify WebQL
      ↓
Spotify track
      ↓
Spotify → YouTube Music matcher
      ↓
Cached YouTube video ID
      ↓
InnerTube playback resolution
      ↓
Temporary playable audio URL
      ↓
Music player
The application does not need to download the entire track before playback begins.
Temporary stream URLs are treated as disposable and are re-resolved when they expire.
Stable YouTube video IDs and matching results are what get cached.
In-process playback
The current implementation uses yt-dlp through a subprocess for downloading. The refactor removes that dependency from the playback/download path.
The target architecture uses an in-process YouTube/YouTube Music InnerTube client.
Benefits:
Lower playback startup overhead
No yt-dlp process spawn for every track
Shared playback/download resolution
Better cache integration
Easier reuse of track identity
Local audio cache
Downloaded or partially fetched audio should be reusable regardless of where the track was encountered.
For example:
Search result
Album
Playlist
Queue
Home
Artist page
Song page
Recently played
       │
       ▼
  Shared audio cache
When a download is requested:
Download requested
       ↓
Usable local audio?
   ┌───┴───┐
  YES      NO
   ↓        ↓
Reuse    InnerTube
            ↓
        Write locally
This prevents the same track from being fetched again simply because the user reached it through a different part of the application.
The existing MP3 storage layout is intended to remain compatible unless the refactor requires otherwise.
Spotify → YouTube Music matching
Track matching is being rebuilt as a strict, layered system.
The matching priority is:
1. Manual override
2. Spotify metadata normalization
3. Track/version classification
4. Native-script search
5. Transliteration fallback
6. Candidate collection
7. Version/type filtering
8. Duration filtering
9. Token-set title/artist comparison
10. Candidate scoring
11. Artwork fallback
12. No match
Manual overrides
If automatic matching is incorrect, the user can provide the correct YouTube URL.
The override is stored permanently and always takes priority over automatic matching.
Duration matching
Normal tracks require:
|YouTube duration - Spotify duration| <= 3 seconds
Versioned tracks such as legitimate remixes, slowed, sped-up, reverb, or extended releases can use a relaxed duration rule, but must still satisfy strong title, artist, and version matching.
Version protection
The matcher distinguishes between:
Studio
Live
Remix
Slowed
Sped-up
Reverb
Extended
Acoustic
Instrumental
Radio edit
A normal studio track should not accidentally resolve to a live performance, one-hour loop, extended loop, unrelated remix, slowed version, sped-up version, or mashup.
Non-Latin titles
Native-script searching happens first.
If that produces no usable result, the matcher attempts transliteration/romanization before giving up.
Word-order independent matching
The matcher does not require exact word order.
For example:
Artist Name Song Title
and:
Song Title - Artist Name
can resolve to the same underlying track.
Normalized token sets and weighted similarity are used instead of simple substring matching.
Artwork fallback
Artwork is the final automatic fallback.
It is only attempted after all metadata-based matching methods fail.
The matcher can compare Spotify artwork with candidate YouTube Music artwork/thumbnails and use strong visual similarity as a final identification signal.
Artwork cannot override:
A valid metadata match
A mandatory version/type rejection
A weak visual similarity
Artwork-derived matches are recorded separately using a method such as:
matchMethod = "artwork_fallback"
Match diagnostics
Matching failures are intended to be explainable.
Examples:
duration_mismatch
version_mismatch
artist_mismatch
title_mismatch
no_candidates
native_script_failed
transliteration_fallback_failed
all_candidates_rejected
artwork_similarity_too_low
Playlist system
Playlists are treated as first-class local objects.
The target model supports:
Local playlist
Spotify-linked playlist
YouTube-linked playlist
Local playlists
A local playlist exists entirely inside the application.
Changes do not synchronize to an external platform.
Spotify-linked playlists
A Spotify-linked playlist maintains a relationship with its Spotify source:
Spotify
   ↕
Local playlist
The user can:
View tracks
Add tracks
Remove tracks
Reorder tracks
Rename the playlist
Change supported metadata
Replace the source URL
Pull external changes
Push local changes
YouTube-linked playlists
The same model applies to YouTube/YouTube Music:
YouTube
   ↕
Local playlist
Local changes are written back to the source playlist, while external changes can be synchronized back into the application.
Playlist pagination
Spotify and YouTube playlists must be fully paginated.
The application must not assume that the first page contains the entire playlist.
The target behavior follows:
next
offsets
cursors
GraphQL pagination
until the playlist is exhausted.
This is specifically intended to eliminate the existing ~100-track import limitation.
Playlist synchronization
Linked playlists use bidirectional synchronization:
┌───────────────┐
       │ Local Playlist │
       └───────┬───────┘
               ↕
      ┌────────┴────────┐
      │                 │
   Spotify           YouTube
The synchronization layer should:
Detect external changes
Push local edits
Preserve ordering
Avoid unnecessary full refreshes
Use source revision/version information where available
Handle conflicts without silently destroying user changes
Keep the UI responsive through background synchronization
Caching architecture
Caching is a major part of the application architecture.
The target system uses a combination of:
In-memory LRU caching
Persistent local metadata cache
Stable Spotify/YouTube IDs
Match cache
Playlist synchronization state
Local audio cache
Potentially cached entities include:
Spotify search results
Spotify tracks
Spotify albums
Spotify artists
Spotify playlists
Spotify profile data
YouTube videos
YouTube playlists
YouTube Music metadata
Spotify → YouTube matches
Manual match overrides
Playlist synchronization metadata
Playback metadata
Local audio
Temporary playable stream URLs are not treated as permanent cache entries because they can expire.
Home screen caching
The home screen is intended to load cached Spotify-derived information immediately and refresh in the background.
Application startup
       ↓
Load persistent cache
       ↓
Render home
       ↓
Refresh WebQL data
       ↓
Update UI + cache
This prevents the home screen from waiting for multiple sequential network requests every time the application launches.
Settings
A dedicated Settings page will be accessible through:
Header
  ↓
Profile
  ↓
Settings
Settings will be organized into relevant categories rather than presented as one large list.
Potential categories include:
Appearance
Playback
Downloads
Library
Spotify
YouTube
Data & Cache
Advanced
Only settings with real functionality should be exposed.
Dynamic color theme
The application is moving away from scattered hard-coded colors toward a centralized semantic theme system.
The target theme contains semantic values such as:
primary
secondary
tertiary
background
surface
surfaceVariant
foreground
muted
accent
border
success
warning
danger
error
The exact token set will be derived from the application's actual visual design.
The important rule is:
Changing a theme value in one centralized location changes every part of the application that uses that semantic color.
This includes:
Header
Sidebar
Cards
Buttons
Player
Playlist UI
Search
Modals
Inputs
Borders
Hover states
Active states
Focus states
Selected states
Disabled states
Icons
SVGs
Gradients
Error/success states
Hard-coded application colors should not remain scattered throughout components.
Theme persistence
User-selected theme values are persisted locally.
User changes theme
       ↓
Settings store
       ↓
Persist locally
       ↓
Apply CSS/theme variables
       ↓
Application updates
On restart, the saved theme is loaded automatically.
Theme changes should be visible immediately without restarting the application.
Appearance settings
The Appearance settings area is expected to include controls for:
Primary color
Secondary color
Tertiary color
Background
Surface
Accent
Other meaningful semantic colors
Theme presets where appropriate
Light/Dark/System appearance if supported
Theme presets should populate the same centralized theme tokens rather than introduce separate hard-coded designs.
Settings architecture
Settings should use a centralized, typed, validated store.
The target structure is:
Central Settings Store
        ↓
Persistent local settings
        ↓
Application components
Avoid unrelated components maintaining independent settings in separate storage keys.
Application architecture
The current repository is organized around:
app/
components/
lib/
public/
scratch/
types/
electron-main.js
electron-next-server.js
preload.js
tailwind.config.js
package.json
The main application page currently renders the Dashboard component.
The component layer includes major UI pieces such as:
Dashboard
Header
PlayerBar
ExpandedPlayerModal
PlaylistView
PlaylistGrid
PlaylistContextMenu
QueueDrawer
LyricsDrawer
DownloadModal
DownloadProgress
AddToPlaylistDropdown
HiddenPlaylistsView
The application also has dedicated API routes for areas such as playlists and search.
Electron architecture
Electron starts the desktop shell and hosts the Next.js application.
The application uses a token-guarded local server boundary.
The target architecture keeps the Electron main/renderer separation intact.
The internal local server is protected with an Electron-specific request token.
The application also adjusts renderer frame rate based on window focus to reduce unnecessary background rendering work.
Current technical stack
From the repository's current package.json:
Technology
Version
Next.js
^15.2.0
React
^19.0.0
React DOM
^19.0.0
Electron
^43.4.0
Electron Builder
^26.0.12
Tailwind CSS
^3.4.17
TypeScript
^5.7.3
Lucide React
^0.475.0
Sharp
^0.34.5
Express
^4.18.2
Vite
^6.2.3
The package currently identifies the application as:
{
  "name": "music",
  "productName": "Music",
  "version": "1.0.0",
  "main": "electron-main.js"
}
Development
Install dependencies
npm install
Run Next.js
npm run dev
Run Electron development mode
npm run electron:dev
Type-check
npm run lint
The current lint script runs:
tsc --noEmit
Build Next.js
npm run build
Run Electron
npm run electron
Package Windows application
npm run electron:package
For packaging without rebuilding Next.js:
npm run electron:package:nobuild
Data storage
The Electron application stores user data under its application-specific user-data directory.
The current Electron configuration uses:
%APPDATA%/music
on Windows, with application data stored beneath its data directory.
The local data layer currently uses JSON-backed storage. The refactor will retain the existing local data model where practical while adding more structured caching and synchronization metadata.
Security and process boundaries
The application should preserve the existing Electron security model:
nodeIntegration: false
contextIsolation: true
sandbox: true
Token-protected local server
Argument-array subprocess execution wherever subprocesses remain
The application should never construct shell commands from user-controlled strings.
Refactor roadmap
The major refactor is planned in this order:
Audit current architecture.
Introduce the warm Spotify WebQL client.
Add metadata caching.
Fix Spotify/YouTube playlist pagination.
Introduce the in-process InnerTube playback layer.
Remove yt-dlp.
Unify audio caching.
Rebuild Spotify → YouTube matching.
Add permanent match/manual-override storage.
Add Spotify playlist synchronization.
Add YouTube playlist synchronization.
Add conflict handling.
Add playlist URL replacement.
Introduce centralized dynamic theme tokens.
Remove hard-coded application colors.
Add centralized settings storage.
Add the Settings page.
Add Profile → Settings navigation.
Add Color Theme controls.
Test all major flows.
Design principles
Local-first
Metadata, matches, playlists, settings, and downloaded audio should be reusable locally whenever possible.
Fast by default
Repeated operations should hit local caches before making network requests.
Stable abstractions
Spotify and YouTube platform-specific implementations should be isolated behind application-owned interfaces.
If an external platform changes an internal endpoint, the platform adapter should be replaceable without rewriting the UI.
Correctness over first-result matching
A wrong song is worse than a slightly slower match.
The matcher therefore uses layered filtering and explicit diagnostics.
No unnecessary subprocesses
Long-lived functionality should prefer in-process clients over repeatedly spawning external processes.
One source of truth
Theme values, settings, stable track matches, and synchronization state should each have a clear owner.
Current vs. target architecture
Current
UI
 │
 ├── Spotify metadata
 │      └── spotdl subprocess
 │
 └── YouTube
        └── yt-dlp subprocess
               │
               └── download/playback
Target
MUSIC APP
                             │
              ┌──────────────┴──────────────┐
              │                             │
       Spotify WebQL                 YouTube/InnerTube
              │                             │
        Metadata/Library                Playback
              │                             │
              └──────────────┬──────────────┘
                             │
                       Local cache
                             │
                      Matching engine
                             │
                    Local audio cache
                             │
                           Player
Linked playlists:
Spotify Playlist ←→ Local Playlist ←→ YouTube Playlist
Project status
This repository is currently undergoing a substantial architectural refactor.
The GitHub repository contains the existing implementation; the target sections above describe the intended architecture and planned improvements.
The project is maintained by Prahas.
