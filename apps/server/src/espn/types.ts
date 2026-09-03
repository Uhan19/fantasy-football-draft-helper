export interface ParsedDraftPick {
  playerId: number;
  teamId: number;
  overallPickNumber: number;
  roundId: number;
  roundPickNumber: number;
}

export interface ParsedDraftDetail {
  drafted: boolean;
  inProgress: boolean;
  picks: ParsedDraftPick[];
  draftSlotByTeamId: Record<number, number>;
}
