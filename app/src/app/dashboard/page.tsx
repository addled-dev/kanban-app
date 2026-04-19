import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AppShell from '@/components/AppShell';
import DashboardClient from '@/components/DashboardClient';
import { formatProjectForUser } from '@/lib/project-access';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const projects = await prisma.project.findMany({
    where: {
      memberships: { some: { userId: session.user.id } },
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      _count: { select: { tasks: true } },
      memberships: {
        where: { userId: session.user.id },
        select: { role: true },
      },
    },
  });

  return (
    <AppShell>
      <DashboardClient
        projects={JSON.parse(JSON.stringify(projects.map(formatProjectForUser)))}
        userId={session.user.id}
      />
    </AppShell>
  );
}
