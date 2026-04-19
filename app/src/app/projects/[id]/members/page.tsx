import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AppShell from '@/components/AppShell';
import ProjectMembersClient from '@/components/ProjectMembersClient';
import { requireProjectAccess } from '@/lib/project-access';

export default async function ProjectMembersPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const access = await requireProjectAccess(params.id, session.user.id, 'ADMIN');
  if (!access) notFound();

  const [members, invites] = await prisma.$transaction([
    prisma.projectMember.findMany({
      where: { projectId: params.id },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.inviteToken.findMany({
      where: {
        projectId: params.id,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return (
    <AppShell
      projectId={access.project.id}
      projectName={access.project.name}
      projectColor={access.project.color}
      projectRole={access.role}
    >
      <ProjectMembersClient
        projectId={access.project.id}
        ownerId={access.project.ownerId}
        currentUserId={session.user.id}
        members={JSON.parse(JSON.stringify(members))}
        invites={JSON.parse(JSON.stringify(
          invites.map((invite) => ({
            ...invite,
            projectId: invite.projectId!,
            projectRole: invite.projectRole!,
          }))
        ))}
      />
    </AppShell>
  );
}
