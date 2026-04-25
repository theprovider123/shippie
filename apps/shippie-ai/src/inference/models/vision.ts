/**
 * Image labelling wrapper — MobileNet-V3-small.
 *
 * Stubbed in v1: vision is opt-in (autoInstall=false in the registry) and
 * the local-ai adapter throws if vision isn't enabled. We surface a clear
 * error so the dashboard can prompt the user to install vision explicitly.
 *
 * Defer full implementation to v1.5 per the plan ("vision deferred if time
 * tight"). The router still wires the task name so capability checks line
 * up.
 */
import type { VisionRequest } from '../../types.ts';

export async function runVision(_req: Omit<VisionRequest, 'task'>): Promise<string[]> {
  throw new Error('vision inference is not enabled in this Shippie AI build');
}
