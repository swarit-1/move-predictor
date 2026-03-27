export interface Opening {
  eco: string;
  name: string;
  variation: string;
  moves: string[]; // SAN moves: ["e4", "e5", "Nf3", "Nc6", ...]
  description: string;
  category: "e4" | "d4" | "other";
}

export const OPENINGS: Opening[] = [
  // === KING'S PAWN (1.e4) ===
  {
    eco: "B20", name: "Sicilian Defense", variation: "Alapin (2.c3)",
    moves: ["e4", "c5", "c3"],
    description: "White prepares d4 without the complex Open Sicilian",
    category: "e4",
  },
  {
    eco: "B30", name: "Sicilian Defense", variation: "Rossolimo Variation",
    moves: ["e4", "c5", "Nf3", "Nc6", "Bb5"],
    description: "White avoids the Open Sicilian with a positional approach",
    category: "e4",
  },
  {
    eco: "B90", name: "Sicilian Defense", variation: "Najdorf Variation",
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
    description: "Bobby Fischer's weapon — the most popular Sicilian",
    category: "e4",
  },
  {
    eco: "C50", name: "Italian Game", variation: "Giuoco Piano",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"],
    description: "Classical development — the quiet Italian",
    category: "e4",
  },
  {
    eco: "C51", name: "Italian Game", variation: "Evans Gambit",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "b4"],
    description: "A romantic gambit offering a pawn for rapid development",
    category: "e4",
  },
  {
    eco: "C60", name: "Ruy López", variation: "Morphy Defense",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
    description: "The most classical chess opening",
    category: "e4",
  },
  {
    eco: "C65", name: "Ruy López", variation: "Berlin Defense",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"],
    description: "The 'Berlin Wall' — solid and drawish at the highest levels",
    category: "e4",
  },
  {
    eco: "C00", name: "French Defense", variation: "Main Line",
    moves: ["e4", "e6", "d4", "d5"],
    description: "Solid and strategic — Black builds a pawn chain",
    category: "e4",
  },
  {
    eco: "C02", name: "French Defense", variation: "Advance Variation",
    moves: ["e4", "e6", "d4", "d5", "e5"],
    description: "White grabs space — Black counterattacks the chain",
    category: "e4",
  },
  {
    eco: "B12", name: "Caro-Kann Defense", variation: "Main Line",
    moves: ["e4", "c6", "d4", "d5"],
    description: "Solid defense — popular at all levels",
    category: "e4",
  },
  {
    eco: "B15", name: "Caro-Kann Defense", variation: "Classical (4...Bf5)",
    moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5"],
    description: "The most popular Caro-Kann system",
    category: "e4",
  },
  {
    eco: "B01", name: "Scandinavian Defense", variation: "Main Line",
    moves: ["e4", "d5", "exd5", "Qxd5"],
    description: "Immediate counterattack — popular at club level",
    category: "e4",
  },
  {
    eco: "B07", name: "Pirc Defense", variation: "Main Line",
    moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6"],
    description: "Hypermodern — let White build a center then attack it",
    category: "e4",
  },
  {
    eco: "C30", name: "King's Gambit", variation: "Accepted",
    moves: ["e4", "e5", "f4", "exf4"],
    description: "Romantic era chess — sacrifice a pawn for rapid attack",
    category: "e4",
  },
  {
    eco: "C42", name: "Petrov's Defense", variation: "Main Line",
    moves: ["e4", "e5", "Nf3", "Nf6"],
    description: "Symmetrical and solid — Black mirrors White's play",
    category: "e4",
  },
  // === QUEEN'S PAWN (1.d4) ===
  {
    eco: "D30", name: "Queen's Gambit", variation: "Declined",
    moves: ["d4", "d5", "c4", "e6"],
    description: "Classical — Black holds the center solidly",
    category: "d4",
  },
  {
    eco: "D20", name: "Queen's Gambit", variation: "Accepted",
    moves: ["d4", "d5", "c4", "dxc4"],
    description: "Black takes the pawn — leads to open positions",
    category: "d4",
  },
  {
    eco: "D10", name: "Slav Defense", variation: "Main Line",
    moves: ["d4", "d5", "c4", "c6"],
    description: "Solid — supports d5 with c6 instead of e6",
    category: "d4",
  },
  {
    eco: "E60", name: "King's Indian Defense", variation: "Main Line",
    moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"],
    description: "Dynamic counterattacking system for Black",
    category: "d4",
  },
  {
    eco: "E20", name: "Nimzo-Indian Defense", variation: "Main Line",
    moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"],
    description: "One of the most respected defenses — pins the knight",
    category: "d4",
  },
  {
    eco: "D80", name: "Grünfeld Defense", variation: "Main Line",
    moves: ["d4", "Nf6", "c4", "g6", "Nc3", "d5"],
    description: "Hypermodern — Black strikes the center immediately",
    category: "d4",
  },
  {
    eco: "D02", name: "London System", variation: "Main Line",
    moves: ["d4", "d5", "Nf3", "Nf6", "Bf4"],
    description: "Solid system for White — easy to learn, hard to refute",
    category: "d4",
  },
  {
    eco: "A80", name: "Dutch Defense", variation: "Main Line",
    moves: ["d4", "f5"],
    description: "Aggressive — Black aims for kingside attack",
    category: "d4",
  },
  {
    eco: "E00", name: "Catalan Opening", variation: "Main Line",
    moves: ["d4", "Nf6", "c4", "e6", "g3"],
    description: "Positional masterpiece — fianchetto with pressure on d5",
    category: "d4",
  },
  {
    eco: "E15", name: "Queen's Indian Defense", variation: "Main Line",
    moves: ["d4", "Nf6", "c4", "e6", "Nf3", "b6"],
    description: "Flexible and solid — controls the light squares",
    category: "d4",
  },
  // === OTHER ===
  {
    eco: "A10", name: "English Opening", variation: "Main Line",
    moves: ["c4"],
    description: "Flexible — often transposes to d4 openings",
    category: "other",
  },
  {
    eco: "A25", name: "English Opening", variation: "Closed Sicilian Reversed",
    moves: ["c4", "e5", "Nc3", "Nc6", "g3"],
    description: "White plays a Sicilian with an extra tempo",
    category: "other",
  },
  {
    eco: "A05", name: "Réti Opening", variation: "Main Line",
    moves: ["Nf3", "d5", "g3"],
    description: "Hypermodern — control the center from the flanks",
    category: "other",
  },
  {
    eco: "A02", name: "Bird's Opening", variation: "Main Line",
    moves: ["f4"],
    description: "Reversed Dutch — aggressive and unusual",
    category: "other",
  },
];
