export async function verifyWorkspaceSession(client,verifyPortal) {
  const {data:sessionData,error:sessionError}=await client.auth.getSession();
  if(sessionError)return {status:'expired'};
  const session=sessionData?.session;
  if(!session)return {status:'signed-out'};
  const {data:userData,error:userError}=await client.auth.getUser();
  if(userError){
    if(userError.status===401||userError.status===403||userError.code==='session_not_found')return {status:'expired'};
    throw new Error('Account verification is temporarily unavailable. Please retry.');
  }
  if(!userData?.user||userData.user.id!==session.user.id)return {status:'expired'};
  const {data:valid,error:validError}=await client.rpc('is_current_session_valid');
  if(validError)throw new Error('Account verification is temporarily unavailable. Please retry.');
  if(valid!==true)return {status:'expired'};
  const {data:profile,error:profileError}=await client.from('profiles')
    .select('id,full_name,role,branch_id,is_active,organization_id,is_platform_super_admin,staff_modules')
    .eq('id',session.user.id).maybeSingle();
  if(profileError)throw new Error('Your account settings could not be loaded. Please retry.');
  if(!profile?.is_active||!['admin','branch','staff'].includes(profile.role))return {status:'blocked'};
  if(verifyPortal){const portal=await verifyPortal(session);if(portal.status!== 'ready')return portal}
  return {status:'ready',session,profile};
}
