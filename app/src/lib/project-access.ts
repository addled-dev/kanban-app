import { ProjectRole } from '@prisma/client';
import { prisma } from './prisma';

const ROLE_WEIGHT: Record<ProjectRole, number> = {
  VIEW: 1,
  READ_WRITE: 2,
  ADMIN: 3,
};

export function roleAtLeast(role: ProjectRole, required: ProjectRole): boolean {
  return ROLE_WEIGHT[role] >= ROLE_WEIGHT[required];
}

export function canWriteProject(role: ProjectRole): boolean {
  return roleAtLeast(role, 'READ_WRITE');
}

export function canManageProject(role: ProjectRole): boolean {
  return roleAtLeast(role, 'ADMIN');
}

export function formatProjectForUser<
  T extends {
    memberships?: { role: ProjectRole }[];
  },
>(project: T): Omit<T, 'memberships'> & { membershipRole: ProjectRole } {
  const { memberships, ...rest } = project;
  return {
    ...rest,
    membershipRole: memberships?.[0]?.role ?? 'VIEW',
  };
}

export async function getProjectAccess(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      memberships: { some: { userId } },
    },
    include: {
      memberships: {
        where: { userId },
        select: { role: true },
      },
    },
  });
}

export async function requireProjectAccess(
  projectId: string,
  userId: string,
  requiredRole: ProjectRole = 'VIEW'
) {
  const project = await getProjectAccess(projectId, userId);
  const role = project?.memberships[0]?.role;
  if (!project || !role || !roleAtLeast(role, requiredRole)) {
    return null;
  }

  return {
    project,
    role,
  };
}

export async function requireTaskAccess(
  taskId: string,
  userId: string,
  requiredRole: ProjectRole = 'VIEW'
) {
  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      project: {
        memberships: { some: { userId } },
      },
    },
    include: {
      assignee: { select: { id: true, email: true, name: true } },
      attachments: true,
      project: {
        select: {
          id: true,
          ownerId: true,
          memberships: {
            where: { userId },
            select: { role: true },
          },
        },
      },
    },
  });

  const role = task?.project.memberships[0]?.role;
  if (!task || !role || !roleAtLeast(role, requiredRole)) {
    return null;
  }

  return {
    task,
    role,
  };
}
