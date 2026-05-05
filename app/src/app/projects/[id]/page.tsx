import { getServerSession } from 'next-auth';
import { redirect, notFound } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import AppShell from '@/components/AppShell';
import KanbanBoard from '@/components/KanbanBoard';
import { canWriteProject, formatProjectForUser } from '@/lib/project-access';

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  const project = await prisma.project.findFirst({
    where: {
      id: params.id,
      memberships: { some: { userId: session.user.id } },
    },
    include: {
      memberships: {
        where: { userId: session.user.id },
        select: { role: true },
      },
    },
  });
  if (!project) notFound();

  const projectForUser = formatProjectForUser(project);

  const tasks = await prisma.task.findMany({
    where: { projectId: params.id },
    orderBy: { position: 'asc' },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      attachments: true,
      children: { select: { id: true } },
    },
  });

  const tasksWithHierarchy = tasks.map((task) => ({
    ...task,
    childIds: task.children.map((child) => child.id),
  }));

  return (
    <AppShell
      projectId={projectForUser.id}
      projectName={projectForUser.name}
      projectColor={projectForUser.color}
      projectRole={projectForUser.membershipRole}
    >
      <KanbanBoard
        project={JSON.parse(JSON.stringify(projectForUser))}
        initialTasks={JSON.parse(JSON.stringify(tasksWithHierarchy))}
        currentUserId={session.user.id}
        currentUserEmail={session.user.email ?? ''}
        currentUserName={session.user.name ?? null}
        canEdit={canWriteProject(projectForUser.membershipRole)}
      />
    </AppShell>
  );
}
