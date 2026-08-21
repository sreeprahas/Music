/** Provider-neutral Spotify models used between the adapter and application service. */
export interface SpotifyImage { url: string; height: number | null; width: number | null; }
export interface SpotifyUser { id: string; display_name: string | null; email?: string; product?: string; images?: SpotifyImage[]; uri: string; }
export interface SpotifyArtist { id: string; name: string; uri: string; images?: SpotifyImage[]; genres?: string[]; popularity?: number; }
export interface SpotifyAlbum { id: string; name: string; album_type?: string; release_date?: string; total_tracks?: number; images?: SpotifyImage[]; artists?: SpotifyArtist[]; uri: string; }
export interface SpotifyTrack { id: string; name: string; uri: string; duration_ms: number; explicit?: boolean; artists: SpotifyArtist[]; album?: SpotifyAlbum; preview_url?: string | null; external_ids?: { isrc?: string }; popularity?: number; }
export interface SpotifyPlaylistItem { added_at?: string; added_by?: { id: string; uri: string }; is_local?: boolean; track: SpotifyTrack | null; }
export interface SpotifyPlaylist { id: string; name: string; description?: string; owner?: { id: string; display_name: string | null; uri: string }; images?: SpotifyImage[]; snapshot_id?: string; collaborative?: boolean; public?: boolean | null; uri: string; tracks?: { href: string; total: number; next?: string | null }; }
export interface SpotifyPaging<T> { href: string; items: T[]; limit: number; offset: number; total: number; next: string | null; previous: string | null; }
export interface SpotifySearchResult { tracks: SpotifyPaging<SpotifyTrack>; artists: SpotifyPaging<SpotifyArtist>; albums: SpotifyPaging<SpotifyAlbum>; playlists: SpotifyPaging<SpotifyPlaylist>; }
export interface CreatePlaylistInput { name: string; description?: string; public?: boolean; collaborative?: boolean; }
export interface SpotifyHomeData { playlists: SpotifyPaging<SpotifyPlaylist> | null; topTracks: SpotifyPaging<SpotifyTrack> | null; topArtists: SpotifyPaging<SpotifyArtist> | null; newReleases: unknown; }
