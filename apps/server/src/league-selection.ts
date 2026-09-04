import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { projectRoot } from "./config.js";

export const LeagueSelectionSchema = z.object({
  leagueId: z.string().trim().regex(/^\d{1,20}$/, "Enter a numeric ESPN league ID"),
  season: z.number().int().min(2000).max(2100),
  myTeamId: z.number().int().positive().max(10000)
}).strict();
export type LeagueSelection = z.infer<typeof LeagueSelectionSchema>;
export const leagueSelectionPath = resolve(projectRoot, "data/league-selection.json");

export async function readLeagueSelection(path = leagueSelectionPath): Promise<LeagueSelection | undefined> {
  try {
    return LeagueSelectionSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("Could not read saved league selection; using environment defaults");
    }
    return undefined;
  }
}

export async function saveLeagueSelection(selection: LeagueSelection, path = leagueSelectionPath): Promise<void> {
  const validated = LeagueSelectionSchema.parse(selection);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, `${JSON.stringify(validated, null, 2)}\n`, { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
