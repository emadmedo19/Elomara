import { createBackendClient } from '../database.mjs';
import { dispatchQueuedPushes } from '../push-kick.mjs';
import deliver from './deliver-mobile-notifications';

export default async function handle(request: Request): Promise<Response> {
  return dispatchQueuedPushes(request, async authorization => {
    const {data:auth,error:authError}=await createBackendClient(authorization).auth.getUser();
    if (authError || !auth.user) return 401;
    const {data:profile,error:profileError}=await createBackendClient().from('profiles')
      .select('building_id,role,approved,disabled_at').eq('id',auth.user.id).maybeSingle();
    if (profileError) return 503;
    if (!profile || profile.approved!==true || profile.disabled_at || !profile.building_id ||
      !['building_admin','owner','tenant'].includes(profile.role)) return 403;
    return 200;
  },deliver);
}
