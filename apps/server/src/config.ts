import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
loadDotenv({ path: resolve(projectRoot, ".env"), quiet: true });

const optionalSecret = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional()
);

const EnvSchema = z
  .object({
    ESPN_LEAGUE_ID: z.string().trim().min(1),
    ESPN_SEASON: z.coerce.number().int().min(2000).default(new Date().getFullYear()),
    ESPN_S2: optionalSecret,
    ESPN_SWID: optionalSecret,
    MY_TEAM_ID: z.coerce.number().int().positive(),
    HOST: z.literal("127.0.0.1").default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1024).max(65535).default(8787),
    DRAFT_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(2000),
    IDLE_POLL_INTERVAL_MS: z.coerce.number().int().min(2000).default(10000),
    ENABLE_BROWSER_FALLBACK: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    BROWSER_INGEST_SECRET: optionalSecret,
    SNAPSHOT_PATH: z.string().trim().min(1).default("./data/draft-state.json")
  })
  .superRefine((value, context) => {
    if ((value.ESPN_S2 && !value.ESPN_SWID) || (!value.ESPN_S2 && value.ESPN_SWID)) {
      context.addIssue({
        code: "custom",
        path: ["ESPN_S2"],
        message: "ESPN_S2 and ESPN_SWID must be configured together"
      });
    }
    if (value.ENABLE_BROWSER_FALLBACK && !value.BROWSER_INGEST_SECRET) {
      context.addIssue({
        code: "custom",
        path: ["BROWSER_INGEST_SECRET"],
        message: "A random BROWSER_INGEST_SECRET is required when browser fallback is enabled"
      });
    }
  });

export interface AppConfig {
  leagueId: string;
  season: number;
  espnS2?: string;
  espnSwid?: string;
  myTeamId: number;
  host: "127.0.0.1";
  port: number;
  activePollMs: number;
  idlePollMs: number;
  browserFallback: boolean;
  browserIngestSecret?: string;
  snapshotPath: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const value = EnvSchema.parse(environment);
  return {
    leagueId: value.ESPN_LEAGUE_ID,
    season: value.ESPN_SEASON,
    ...(value.ESPN_S2 ? { espnS2: value.ESPN_S2 } : {}),
    ...(value.ESPN_SWID ? { espnSwid: value.ESPN_SWID } : {}),
    myTeamId: value.MY_TEAM_ID,
    host: value.HOST,
    port: value.PORT,
    activePollMs: value.DRAFT_POLL_INTERVAL_MS,
    idlePollMs: value.IDLE_POLL_INTERVAL_MS,
    browserFallback: value.ENABLE_BROWSER_FALLBACK,
    ...(value.BROWSER_INGEST_SECRET
      ? { browserIngestSecret: value.BROWSER_INGEST_SECRET }
      : {}),
    snapshotPath: resolve(projectRoot, value.SNAPSHOT_PATH)
  };
}
