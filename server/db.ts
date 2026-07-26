import fs from 'fs';
import path from 'path';
import { LibraryData, Track, Playlist } from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'playlists.json');

const INITIAL_TRACKS: Track[] = [
  {
    id: 'jfKfPfyJRdk',
    videoId: 'jfKfPfyJRdk',
    title: 'Lofi Hip Hop Radio - Beats to Relax/Study to',
    artist: 'Lofi Girl',
    thumbnailUrl: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    duration: 0,
    durationFormatted: 'LIVE',
    addedAt: new Date().toISOString(),
    liked: true
  },
  {
    id: '4NRXx6U8ABQ',
    videoId: '4NRXx6U8ABQ',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    thumbnailUrl: 'https://i.ytimg.com/vi/4NRXx6U8ABQ/hqdefault.jpg',
    duration: 200,
    durationFormatted: '3:20',
    addedAt: new Date().toISOString(),
    liked: true
  },
  {
    id: 'TUVcZfQe-Kw',
    videoId: 'TUVcZfQe-Kw',
    title: 'Levitating',
    artist: 'Dua Lipa',
    thumbnailUrl: 'https://i.ytimg.com/vi/TUVcZfQe-Kw/hqdefault.jpg',
    duration: 203,
    durationFormatted: '3:23',
    addedAt: new Date().toISOString(),
    liked: false
  },
  {
    id: 'H5v3kku4y6Q',
    videoId: 'H5v3kku4y6Q',
    title: 'As It Was',
    artist: 'Harry Styles',
    thumbnailUrl: 'https://i.ytimg.com/vi/H5v3kku4y6Q/hqdefault.jpg',
    duration: 167,
    durationFormatted: '2:47',
    addedAt: new Date().toISOString(),
    liked: true
  },
  {
    id: 'kffacxfA7G4',
    videoId: 'kffacxfA7G4',
    title: 'Baby Shark Dance',
    artist: 'Pinkfong',
    thumbnailUrl: 'https://i.ytimg.com/vi/kffacxfA7G4/hqdefault.jpg',
    duration: 136,
    durationFormatted: '2:16',
    addedAt: new Date().toISOString(),
    liked: false
  }
];

const INITIAL_PLAYLISTS: Playlist[] = [
  {
    id: 'p-chill-vibes',
    name: 'Chill Evening Beats',
    description: 'Relaxing tunes for coding, studying, and late-night listening.',
    coverUrl: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?auto=format&fit=crop&w=600&q=80',
    trackIds: ['jfKfPfyJRdk', '4NRXx6U8ABQ'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'p-workout-energy',
    name: 'High Energy Workout',
    description: 'Upbeat tracks to keep your pulse racing and motivation high.',
    coverUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80',
    trackIds: ['TUVcZfQe-Kw', 'H5v3kku4y6Q'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];

function getInitialData(): LibraryData {
  const tracksRecord: Record<string, Track> = {};
  INITIAL_TRACKS.forEach((t) => {
    tracksRecord[t.id] = t;
  });

  return {
    tracks: tracksRecord,
    playlists: INITIAL_PLAYLISTS,
    likedTrackIds: ['jfKfPfyJRdk', '4NRXx6U8ABQ', 'H5v3kku4y6Q'],
    recentlyPlayedIds: ['4NRXx6U8ABQ', 'jfKfPfyJRdk', 'TUVcZfQe-Kw']
  };
}

export function initDatabase(): LibraryData {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      const initialData = getInitialData();
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
      return initialData;
    }

    const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(fileContent) as LibraryData;
    return parsed;
  } catch (error) {
    console.error('Failed to initialize or read database JSON:', error);
    return getInitialData();
  }
}

export function readDatabase(): LibraryData {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return initDatabase();
    }
    const content = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(content) as LibraryData;
  } catch (err) {
    console.error('Error reading JSON storage:', err);
    return initDatabase();
  }
}

export function writeDatabase(data: LibraryData): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing JSON storage:', err);
  }
}
