export interface ShippieJsonValidation {
  ok: true;
  value: Record<string, unknown>;
}

export interface ShippieJsonRejection {
  ok: false;
  error: string;
}

/**
 * Light validation for maker shippie.json overrides. The deploy pipeline is
 * still the canonical parser; this catches obvious invalid dashboard/API
 * writes before they become "why did my next deploy fail?" moments.
 */
export function validateShippieJsonOverride(
  parsed: unknown,
): ShippieJsonValidation | ShippieJsonRejection {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'shippie.json must be a JSON object.' };
  }
  const obj = parsed as Record<string, unknown>;
  const HEX_RE = /^#[0-9a-fA-F]{6}$/;
  if (obj.themeColor !== undefined && (typeof obj.themeColor !== 'string' || !HEX_RE.test(obj.themeColor))) {
    return { ok: false, error: 'themeColor must be a 6-digit hex like #E8603C.' };
  }
  if (
    obj.backgroundColor !== undefined &&
    (typeof obj.backgroundColor !== 'string' || !HEX_RE.test(obj.backgroundColor))
  ) {
    return { ok: false, error: 'backgroundColor must be a 6-digit hex like #FFFFFF.' };
  }
  if (obj.sound !== undefined && typeof obj.sound !== 'boolean') {
    return { ok: false, error: 'sound must be a boolean.' };
  }
  if (obj.ai !== undefined && obj.ai !== false && !Array.isArray(obj.ai)) {
    return { ok: false, error: 'ai must be an array of task names or false.' };
  }
  return { ok: true, value: obj };
}
