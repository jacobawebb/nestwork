export interface Session {
  actor: {
    id: string;
    type: 'PARENT' | 'CHILD';
    role: 'OWNER' | 'PARENT' | 'CHILD';
    displayName: string;
    householdId: string;
  };
  idleExpiresAt: string;
}

export interface Household {
  id: string;
  name: string;
  currency: string;
  locale: string;
  timeZone: string;
  settings: {
    defaultApprovalMode: 'PARENT_APPROVAL' | 'AUTO_APPROVE';
    childReleaseEnabled: boolean;
    childBoardLimit: number;
    savingsGoalsEnabled: boolean;
  };
}

export interface Profile {
  id: string;
  type: 'PARENT' | 'CHILD';
  displayName: string;
  avatarKey: string;
  accentKey: string;
  label: string;
}

export interface ChildSummary {
  id: string;
  displayName: string;
  avatarKey: string;
  accentKey: string;
  balanceMinor: number;
  earnedMinor: number;
  paidMinor: number;
}

export interface Chore {
  id: string;
  templateId: string | null;
  assignedChildId: string | null;
  claimedByChildId: string | null;
  childName: string | null;
  title: string;
  instructions: string | null;
  amountMinor: number;
  currency: string;
  approvalMode: 'PARENT_APPROVAL' | 'AUTO_APPROVE';
  assignmentType: 'ASSIGNED' | 'GENERAL';
  status: string;
  availableAt: string;
  dueAt: string | null;
  expiresAt: string | null;
  completedAt?: string | null;
  reviewedAt?: string | null;
}

export interface LedgerEntry {
  id: string;
  childId: string;
  childName: string;
  choreInstanceId: string | null;
  type: 'EARNING' | 'PAYOUT' | 'ADJUSTMENT' | 'REVERSAL';
  amountMinor: number;
  currency: string;
  reason: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  childId: string;
  name: string;
  targetMinor: number;
  iconKey: string;
  encouragement: string | null;
  displayOrder: number;
  active: boolean;
  spotlight: boolean;
  progressMinor: number;
  progressPercent: number;
  reached: boolean;
}
