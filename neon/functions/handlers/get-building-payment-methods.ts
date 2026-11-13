import { authenticatedUser, pool } from '../database.mjs';
import { getPaymentAccounts } from '../../../src/services/paymentAccounts';

export default async function handle(request: Request): Promise<Response> {
  const headers = {'Cache-Control':'no-store'};
  if (request.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405,headers});
  let user: {id:string};
  try { user = await authenticatedUser(request.headers.get('Authorization') || ''); }
  catch { return Response.json({error:'Authentication required'},{status:401,headers}); }
  try {
    // The caller cannot choose a user or a building. Only current approved
    // membership can expose these three payment fields; never general settings.
    const {rows} = await pool.query<{building_id:string;payment_settings:unknown}>(`
      SELECT p.building_id,
        jsonb_build_object('bankAccountName', s.setting_value->'bankAccountName',
          'bankAccountNumber', s.setting_value->'bankAccountNumber',
          'paymentAccounts', s.setting_value->'paymentAccounts') AS payment_settings
      FROM public.profiles p
      LEFT JOIN public.app_settings s ON s.building_id=p.building_id AND s.setting_key='general'
      WHERE p.id=$1 AND p.approved=true AND p.disabled_at IS NULL
        AND p.building_id IS NOT NULL AND p.role IN ('building_admin','owner','tenant')
      LIMIT 1`, [user.id]);
    const row = rows[0];
    if (!row) return Response.json({error:'Active building membership required'},{status:403,headers});
    return Response.json({building_id:row.building_id,methods:getPaymentAccounts(row.payment_settings)},{headers});
  } catch { return Response.json({error:'Unable to load payment methods'},{status:503,headers}); }
}
