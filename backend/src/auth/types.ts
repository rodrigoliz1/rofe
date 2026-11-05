export type Role = 'ADMIN' | 'MANAGER' | 'BARISTA' | 'POS_DEVICE';

export interface AuthPrincipal {
  subjectId: string;
  role: Role;
  sessionId: string;
  deviceId?: string;
}

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: Exclude<Role, 'POS_DEVICE'>;
  active: boolean;
}

export interface SessionRecord {
  id: string;
  subjectId: string;
  role: Role;
  refreshTokenHash: string;
  deviceId?: string;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  lastSeenAt: string;
}

export interface DeviceRecord {
  id: string;
  name: string;
  tokenHash: string;
  active: boolean;
  createdAt: string;
  lastSeenAt?: string;
  revokedAt?: string;
}
