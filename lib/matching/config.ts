/**
 * lib/matching/config.ts
 *
 * Centralized configuration for the points-based Spotify → YouTube Music matching engine.
 */

export interface ScoringWeights {
  title: {
    max: number;
    exact: number;
    veryStrong: [number, number]; // 34-39
    strong: [number, number];     // 27-33
    moderate: [number, number];   // 18-26
    weak: [number, number];       // 1-17
    mismatch: number;
  };
  artist: {
    max: number;
    exact: number;
    veryStrong: [number, number]; // 25-29
    strong: [number, number];     // 20-24
    featuredCompatible: [number, number]; // 10-19
    weak: [number, number];       // 1-9
    majorMismatchPenalty: number; // -40
  };
  duration: {
    max: number;
    tiers: Array<{ maxDiffSeconds: number; points: number }>;
  };
  album: {
    max: number;
    exact: number;
    strong: [number, number];     // 7-9
    compatible: [number, number]; // 4-6
    noInfo: number;
  };
  penalties: {
    liveVsStudio: number;          // -30
    acousticVsStudio: number;      // -30
    remixVsOriginal: number;       // -30
    instrumentalVsVocal: number;   // -40
    karaokeVsOriginal: number;     // -45
    coverVsOriginal: number;       // -45
    mashupVsOriginal: number;      // -45
    speedOrPitchMismatch: number;  // -35
    majorEditMismatch: number;     // -25
    remasteredVsOriginal: number;  // -8
    cleanExplicitMismatch: number; // -8
  };
  thresholds: {
    autoMatch: number;             // 75
    excellent: number;             // 90
    strong: number;                // 80
    acceptable: number;            // 70
    weak: number;                  // 60
    reject: number;                // <60
  };
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  title: {
    max: 40,
    exact: 40,
    veryStrong: [34, 39],
    strong: [27, 33],
    moderate: [18, 26],
    weak: [1, 17],
    mismatch: 0,
  },
  artist: {
    max: 30,
    exact: 30,
    veryStrong: [25, 29],
    strong: [20, 24],
    featuredCompatible: [10, 19],
    weak: [1, 9],
    majorMismatchPenalty: -40,
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
    max: 10,
    exact: 10,
    strong: [7, 9],
    compatible: [4, 6],
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
    excellent: 90,
    strong: 80,
    acceptable: 70,
    weak: 60,
    reject: 60,
  },
};
