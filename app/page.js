'use client';
import WorkspaceAccess from '../components/WorkspaceAccess';
import AppShell from '../components/AppShell';
export default function Home(){return <WorkspaceAccess>{({session,profile})=><AppShell key={session.user.id} session={session} initialProfile={profile}/>}</WorkspaceAccess>}
