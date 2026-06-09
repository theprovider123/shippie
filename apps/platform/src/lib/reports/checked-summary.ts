/**
 * User-safe "What Shippie checked" summary for the public app page.
 *
 * Projects the deploy analysis (already distilled into the page's trustCard)
 * into a few plain-language POSITIVE badges. Deliberately narrow inputs:
 * it only ever sees external-connection facts, never internal security
 * scores / privacy grades / raw findings — so those can't leak into a
 * public surface. Pure + client-safe.
 */
export interface CheckedSummaryInput {
  externalDomains: { domain: string }[];
  /** e.g. "On your device" — shown verbatim, never a grade/score. */
  dataLocation?: string | null;
}

export interface CheckedSummary {
  badges: string[];
  connectDomains: string[];
}

export function summarizeChecks(input: CheckedSummaryInput): CheckedSummary {
  const connectDomains = input.externalDomains
    .map((d) => d.domain)
    .filter((d): d is string => typeof d === 'string' && d.length > 0);

  const badges: string[] = [];
  if (connectDomains.length === 0) {
    badges.push('Runs on your device');
    badges.push('No third-party connections');
  } else {
    badges.push(
      `Connects to ${connectDomains.length} declared ${connectDomains.length === 1 ? 'domain' : 'domains'}`,
    );
  }
  return { badges, connectDomains };
}
