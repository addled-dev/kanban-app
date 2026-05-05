import { WorkItemType } from '@prisma/client';

const PARENT_TYPE_BY_CHILD: Record<WorkItemType, WorkItemType | null> = {
  EPIC: null,
  FEATURE: 'EPIC',
  STORY: 'FEATURE',
  TASK: 'STORY',
};

export function requiredParentType(type: WorkItemType): WorkItemType | null {
  return PARENT_TYPE_BY_CHILD[type];
}

export function isValidParentChild(parentType: WorkItemType, childType: WorkItemType): boolean {
  return requiredParentType(childType) === parentType;
}
