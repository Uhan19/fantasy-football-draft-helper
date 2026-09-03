export interface EspnCredentials {
  espnS2?: string;
  swid?: string;
}

export function buildEspnCookie(credentials: EspnCredentials): string | undefined {
  if (!credentials.espnS2 && !credentials.swid) return undefined;
  if (!credentials.espnS2 || !credentials.swid) {
    throw new Error("Both espn_s2 and SWID are required for private leagues");
  }
  return `espn_s2=${credentials.espnS2}; SWID=${credentials.swid}`;
}
