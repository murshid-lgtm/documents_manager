'use client';
import WorkspaceAccess from '../../components/WorkspaceAccess';
import WhatsAppApplication,{WhatsAppLoading} from '../../components/WhatsAppApplication';
export default function WhatsAppWindow(){return <WorkspaceAccess loading={<WhatsAppLoading/>}>{({session,profile})=><WhatsAppApplication key={session.user.id} session={session} profile={profile}/>}</WorkspaceAccess>}
