/**
 * Matching configuration for Spotify -> YouTube Music.
 * Identity is title + artist + duration. Album is intentionally ignored.
 */

export interface ScoringWeights {
  title: {
    max: number;
    exact: number;
    veryStrong: [number, number];
    strong: [number, number];
    moderate: [number, number];
    weak: [number, number];
    mismatch: number;
  };
  artist: {
    max: number;
    exact: number;
    veryStrong: [number, number];
    strong: [number, number];
    featuredCompatible: [number, number];
    weak: [number, number];
    majorMismatchPenalty: number;
  };
  duration: {
    max: number;
    tiers: Array<{ maxDiffSeconds: number; points: number }>;
  };
  // Kept in the shape for compatibility with existing diagnostics/API responses.
  // Album never contributes to the score.
  album: {
    max: number;
    exact: number;
    strong: [number, number];
    compatible: [number, number];
    noInfo: number;
  };
  penalties: {
    liveVsStudio: number;
    acousticVsStudio: number;
    remixVsOriginal: number;
    instrumentalVsVocal: number;
    karaokeVsOriginal: number;
    coverVsOriginal: number;
    mashupVsOriginal: number;
    speedOrPitchMismatch: number;
    majorEditMismatch: number;
    remasteredVsOriginal: number;
    cleanExplicitMismatch: number;
  };
  thresholds: {
    autoMatch: number;
    excellent: number;
    strong: number;
    acceptable: number;
    weak: number;
    reject: number;
  };
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  title: {
    max: 45,
    exact: 45,
    veryStrong: [40, 44],
    strong: [34, 39],
    moderate: [24, 33],
    weak: [1, 23],
    mismatch: 0,
  },
  artist: {
    max: 35,
    exact: 35,
    veryStrong: [30, 34],
    strong: [25, 29],
    featuredCompatible: [16, 24],
    weak: [1, 15],
    majorMismatchPenalty: -45,
  },
  duration: {
    max: 20,
    tiers: [
      { maxDiffSeconds: 2, points: 20 },
      { maxDiffSeconds: 5, points: 16 },
      { maxDiffSeconds: 10, points: 10 },
      { maxDiffSeconds: 20, points: 4 },
    ],
  },
  album: {
    max: 0,
    exact: 0,
    strong: [0, 0],
    compatible: [0, 0],
    noInfo: 0,
  },
  penalties: {
    liveVsStudio: -30,
    acousticVsStudio: -30,
    remixVsOriginal: -30,
    instrumentalVsVocal: -40,
    karaokeVsOriginal: -45,
    coverVsOriginal: -45,
    mashupVsOriginal: -45,
    speedOrPitchMismatch: -35,
    majorEditMismatch: -25,
    remasteredVsOriginal: -8,
    cleanExplicitMismatch: -8,
  },
  thresholds: {
    autoMatch: 75,
    excellent: 92,
    strong: 84,
    acceptable: 75,
    weak: 65,
    reject: 65,
  },
};
