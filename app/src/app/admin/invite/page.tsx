import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AppShell from '@/components/AppShell';
import InviteClient from '@/components/InviteClient';

export default async function AdminInvitePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  if ((session.user as any).role !== 'ADMIN') redirect('/dashboard');

  const invites = await prisma.inviteToken.findMany({
    where: { projectId: null },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return (
    <AppShell>
      <InviteClient invites={JSON.parse(JSON.stringify(invites))} />
    </AppShell>
  );
}
