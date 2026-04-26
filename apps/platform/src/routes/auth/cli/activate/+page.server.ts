/**
 * /auth/cli/activate — sign-in-gated page where a human types the CLI's
 * `user_code` to approve a device code.
 *
 * Auth-gated: if not signed in, redirect to /auth/login?return_to=...
 * preserving the user_code query so the CLI's deep-link still works.
 */
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { approveDeviceCode } from '$server/auth/cli-auth';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    const returnTo = url.pathname + url.search;
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(returnTo)}`);
  }
  return {
    userEmail: locals.user.email,
    prefilledCode: url.searchParams.get('user_code') ?? null,
  };
};

export const actions: Actions = {
  default: async ({ request, platform, locals }) => {
    if (!locals.user) {
      throw redirect(303, '/auth/login');
    }
    if (!platform?.env.DB) {
      return fail(500, { error: 'Database unavailable.' });
    }
    const data = await request.formData();
    const userCode = String(data.get('user_code') ?? '').trim().toUpperCase();
    if (!userCode) return fail(400, { error: 'Enter the code from your terminal.' });

    const result = await approveDeviceCode({
      userCode,
      userId: locals.user.id,
      db: platform.env.DB,
    });

    if (!result.ok) {
      const messages: Record<string, string> = {
        invalid_code: 'That code does not match a pending CLI session.',
        already_used: 'This code was already redeemed.',
        expired: 'This code has expired. Run `shippie login` again.',
        already_bound_to_other_user: 'This code is bound to a different account.',
      };
      return fail(400, { error: messages[result.reason] ?? 'Approval failed.' });
    }
    return { success: true };
  },
};
