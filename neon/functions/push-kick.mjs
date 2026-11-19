
// Separate pure dispatcher makes security and retry behavior testable offline.
export async function dispatchQueuedPushes(request, authorize, deliver) {
  if (request.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405});
  const bearer=request.headers.get('authorization')||'';
  if (!/^Bearer \S+$/.test(bearer)) return Response.json({error:'Unauthorized'},{status:401});
  const permission=await authorize(bearer);
  if (permission!==200) return Response.json({error:permission===403?'Forbidden':'Unauthorized'},{
    status:permission===403?403:permission===503?503:401
  });
  // Four bounded batches; the transactionally claimed queue prevents double sends.
  for (let batch=0;batch<4;batch++) {
    const response=await deliver(request);
    if (!response.ok) return Response.json({error:'Push temporarily unavailable'},{status:503});
    let result;
    try { result=await response.json(); }
    catch { return Response.json({error:'Push temporarily unavailable'},{status:503}); }
    if (!Number.isSafeInteger(result?.claimed)||result.claimed<0||result.claimed>40)
      return Response.json({error:'Push temporarily unavailable'},{status:503});
    if (result.claimed<40) break;
  }
  // Never expose device tokens or cross-building counts to the caller.
  return Response.json({accepted:true});
}
