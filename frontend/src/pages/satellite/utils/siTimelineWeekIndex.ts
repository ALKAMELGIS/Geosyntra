/** Fast week lookup for timeline scrubbing / playback (avoids repeated findIndex scans). */

export type WeeklyTimelineWeek = {
  weekIndex: number;
  startDate: string;
  endDate: string;
  mean: number;
};

export type WeeklyTimelineIndex = {
  weeks: WeeklyTimelineWeek[];
  pickWeekIdx(iso: string): number;
  pickWeek(iso: string): WeeklyTimelineWeek;
  nextWeekIdx(currentIdx: number): number;
};

export function buildWeeklyTimelineIndex(
  weekly: ReadonlyArray<{ weekIndex: number; startDate: string; endDate: string; mean: number }>,
): WeeklyTimelineIndex | null {
  if (!weekly.length) return null;
  const weeks: WeeklyTimelineWeek[] = weekly.map(w => ({
    weekIndex: w.weekIndex,
    startDate: w.startDate.slice(0, 10),
    endDate: w.endDate.slice(0, 10),
    mean: w.mean,
  }));

  const pickWeekIdx = (isoRaw: string): number => {
    const iso = isoRaw.slice(0, 10);
    for (let i = 0; i < weeks.length; i++) {
      const w = weeks[i]!;
      if (iso >= w.startDate && iso <= w.endDate) return i;
    }
    if (iso < weeks[0]!.startDate) return 0;
    return weeks.length - 1;
  };

  return {
    weeks,
    pickWeekIdx,
    pickWeek: (iso: string) => weeks[pickWeekIdx(iso)]!,
    nextWeekIdx: (currentIdx: number) => (currentIdx + 1) % weeks.length,
  };
}
