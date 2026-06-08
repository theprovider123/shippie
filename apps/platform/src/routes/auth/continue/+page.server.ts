import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { approveDeviceCode } from '$server/auth/cli-auth';
import { safeReturnTo } from '$server/auth/return-to';

export const load: PageServerLoad = async ({ locals, url }) => {
  const returnTo = safeReturnTo(url.searchParams.get('return_to'), '/you');
  if (!locals.user) {
    throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname + url.search)}`);
  }
  return {
    returnTo,
    userEmail: locals.user.email,
  };
};

export const actions: Actions = {
  approveCode: async ({ request, platform, locals, url }) => {
    if (!locals.user) {
      throw redirect(303, `/auth/login?return_to=${encodeURIComponent(url.pathname + url.search)}`);
    }
    if (!platform?.env.DB) {
      return fail(500, { error: 'Database unavailable.' });
    }

    const data = await request.formData();
    const userCode = String(data.get('user_code') ?? '').trim().toUpperCase();
    if (!userCode) return fail(400, { error: 'Enter the code from your other Shippie.' });

    const result = await approveDeviceCode({
      userCode,
      userId: locals.user.id,
      db: platform.env.DB,
    });

    if (!result.ok) {
      const messages: Record<string, string> = {
        invalid_code: 'That code does not match a pending sign-in.',
        already_used: 'This code was already used.',
        expired: 'This code has expired. Start again in the other Shippie.',
        already_bound_to_other_user: 'This code is already bound to another account.',
      };
      return fail(400, { error: messages[result.reason] ?? 'Approval failed.' });
    }

    return {
      ok: true,
      clientName: result.clientName,
      returnTo: safeReturnTo(url.searchParams.get('return_to'), '/you'),
    };
  },
};
