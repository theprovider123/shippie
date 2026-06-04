import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { saveMakerAppProfile } from '$server/maker/profile-save';

export const load: PageServerLoad = async ({ params }) => {
  throw redirect(308, `/maker/apps/${params.slug}/access#listing`);
};

export const actions: Actions = {
  save: saveMakerAppProfile,
};
