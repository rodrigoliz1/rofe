import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { readFile, rename, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { z } from 'zod';
import type { AppEnv } from '../config/env';
import type { DeviceRecord, SessionRecord, UserRecord } from './types';

export interface AuditEntry {
  id?: string;
  userId?: string;
  deviceId?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  ip?: string;
  timestamp: string;
}

export interface SecurityStore {
  initialize(users: UserRecord[]): Promise<void>;
  findUserByEmail(email: string): Promise<UserRecord | undefined>;
  listUsers(): Promise<Array<Omit<UserRecord, 'passwordHash'>>>;
  saveUser(user: UserRecord): Promise<void>;
  findSession(id: string): Promise<SessionRecord | undefined>;
  saveSession(session: SessionRecord): Promise<void>;
  revokeSession(id: string, revokedAt: string): Promise<void>;
  revokeSessionsForSubject(subjectId: string, revokedAt: string): Promise<void>;
  findDevice(id: string): Promise<DeviceRecord | undefined>;
  listDevices(): Promise<Array<Omit<DeviceRecord, 'tokenHash'>>>;
  saveDevice(device: DeviceRecord): Promise<void>;
  revokeDevice(id: string, revokedAt: string): Promise<void>;
  addAudit(entry: AuditEntry): Promise<void>;
}

export class MemorySecurityStore implements SecurityStore {
  private readonly users = new Map<string, UserRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly devices = new Map<string, DeviceRecord>();
  readonly audit: AuditEntry[] = [];

  async initialize(users: UserRecord[]): Promise<void> {
    users.forEach((user) => this.users.set(user.email.toLowerCase(), user));
  }

  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    return this.users.get(email.toLowerCase());
  }

  async listUsers(): Promise<Array<Omit<UserRecord, 'passwordHash'>>> {
    return Array.from(this.users.values(), ({ passwordHash: _passwordHash, ...user }) => user);
  }

  async saveUser(user: UserRecord): Promise<void> {
    this.users.set(user.email.toLowerCase(), user);
  }

  async findSession(id: string): Promise<SessionRecord | undefined> {
    return this.sessions.get(id);
  }

  async saveSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async revokeSession(id: string, revokedAt: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) this.sessions.set(id, { ...session, revokedAt });
  }

  async revokeSessionsForSubject(subjectId: string, revokedAt: string): Promise<void> {
    for (const [id, session] of this.sessions) if (session.subjectId === subjectId && !session.revokedAt) this.sessions.set(id, { ...session, revokedAt });
  }

  async findDevice(id: string): Promise<DeviceRecord | undefined> {
    return this.devices.get(id);
  }

  async listDevices(): Promise<Array<Omit<DeviceRecord, 'tokenHash'>>> {
    return Array.from(this.devices.values(), ({ tokenHash: _tokenHash, ...device }) => device);
  }

  async saveDevice(device: DeviceRecord): Promise<void> {
    this.devices.set(device.id, device);
  }

  async revokeDevice(id: string, revokedAt: string): Promise<void> {
    const device = this.devices.get(id);
    if (device) this.devices.set(id, { ...device, active: false, revokedAt });
  }

  async addAudit(entry: AuditEntry): Promise<void> {
    this.audit.push({ ...entry, id: randomUUID() });
  }
}

const localDeviceSchema = z.object({
  id: z.string(), name: z.string(), tokenHash: z.string(), active: z.boolean(),
  createdAt: z.string(), lastSeenAt: z.string().optional(), revokedAt: z.string().optional(),
});

// Local development only: persist token hashes, never device tokens or sessions.
export class DevelopmentSecurityStore extends MemorySecurityStore {
  private readonly localDevices = new Map<string, DeviceRecord>();
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly path: string) { super(); }

  async initialize(users: UserRecord[]): Promise<void> {
    await super.initialize(users);
    let contents: string;
    try { contents = await readFile(this.path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const devices = z.array(localDeviceSchema).parse(JSON.parse(contents));
    for (const device of devices) {
      this.localDevices.set(device.id, device);
      await super.saveDevice(device);
    }
  }

  private persist(): Promise<void> {
    const contents = JSON.stringify(Array.from(this.localDevices.values()));
    const write = this.writes.catch(() => undefined).then(async () => {
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, contents, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    this.writes = write;
    return write;
  }

  async saveDevice(device: DeviceRecord): Promise<void> {
    this.localDevices.set(device.id, device);
    await this.persist();
    await super.saveDevice(device);
  }

  async revokeDevice(id: string, revokedAt: string): Promise<void> {
    const device = this.localDevices.get(id);
    if (!device) return;
    this.localDevices.set(id, { ...device, active: false, revokedAt });
    await this.persist();
    await super.revokeDevice(id, revokedAt);
  }
}

class SupabaseSecurityStore implements SecurityStore {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } });
  }

  async initialize(users: UserRecord[]): Promise<void> {
    for (const user of users) {
      const { error } = await this.client.from('app_users').upsert({
        id: user.id,
        email: user.email.toLowerCase(),
        password_hash: user.passwordHash,
        role: user.role,
        active: user.active,
      }, { onConflict: 'email', ignoreDuplicates: true });
      if (error) throw error;
    }
  }

  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    const { data, error } = await this.client.from('app_users').select('*').eq('email', email.toLowerCase()).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return { id: data.id, email: data.email, passwordHash: data.password_hash, role: data.role, active: data.active };
  }

  async listUsers(): Promise<Array<Omit<UserRecord, 'passwordHash'>>> {
    const { data, error } = await this.client.from('app_users').select('id,email,role,active').order('email');
    if (error) throw error;
    return data.map((user) => ({ id: user.id, email: user.email, role: user.role, active: user.active }));
  }

  async saveUser(user: UserRecord): Promise<void> {
    const { error } = await this.client.from('app_users').upsert({ id: user.id, email: user.email.toLowerCase(), password_hash: user.passwordHash, role: user.role, active: user.active }, { onConflict: 'id' });
    if (error) throw error;
  }

  async findSession(id: string): Promise<SessionRecord | undefined> {
    const { data, error } = await this.client.from('auth_sessions').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return mapSession(data);
  }

  async saveSession(session: SessionRecord): Promise<void> {
    const { error } = await this.client.from('auth_sessions').upsert({
      id: session.id,
      subject_id: session.subjectId,
      role: session.role,
      refresh_token_hash: session.refreshTokenHash,
      device_id: session.deviceId ?? null,
      created_at: session.createdAt,
      expires_at: session.expiresAt,
      revoked_at: session.revokedAt ?? null,
      last_seen_at: session.lastSeenAt,
    });
    if (error) throw error;
  }

  async revokeSession(id: string, revokedAt: string): Promise<void> {
    const { error } = await this.client.from('auth_sessions').update({ revoked_at: revokedAt }).eq('id', id);
    if (error) throw error;
  }

  async revokeSessionsForSubject(subjectId: string, revokedAt: string): Promise<void> {
    const { error } = await this.client.from('auth_sessions').update({ revoked_at: revokedAt }).eq('subject_id', subjectId).is('revoked_at', null);
    if (error) throw error;
  }

  async findDevice(id: string): Promise<DeviceRecord | undefined> {
    const { data, error } = await this.client.from('devices').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return undefined;
    return {
      id: data.id,
      name: data.name,
      tokenHash: data.token_hash,
      active: data.active,
      createdAt: data.created_at,
      lastSeenAt: data.last_seen_at ?? undefined,
      revokedAt: data.revoked_at ?? undefined,
    };
  }

  async listDevices(): Promise<Array<Omit<DeviceRecord, 'tokenHash'>>> {
    const { data, error } = await this.client.from('devices').select('id,name,active,created_at,last_seen_at,revoked_at').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map((device) => ({
      id: device.id,
      name: device.name,
      active: device.active,
      createdAt: device.created_at,
      lastSeenAt: device.last_seen_at ?? undefined,
      revokedAt: device.revoked_at ?? undefined,
    }));
  }

  async saveDevice(device: DeviceRecord): Promise<void> {
    const { error } = await this.client.from('devices').upsert({
      id: device.id,
      name: device.name,
      token_hash: device.tokenHash,
      active: device.active,
      created_at: device.createdAt,
      last_seen_at: device.lastSeenAt ?? null,
      revoked_at: device.revokedAt ?? null,
    });
    if (error) throw error;
  }

  async revokeDevice(id: string, revokedAt: string): Promise<void> {
    const { error } = await this.client.from('devices').update({ active: false, revoked_at: revokedAt }).eq('id', id);
    if (error) throw error;
  }

  async addAudit(entry: AuditEntry): Promise<void> {
    const { error } = await this.client.from('audit_logs').insert({
      user_id: entry.userId ?? null,
      device_id: entry.deviceId ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      before_data: entry.before ?? null,
      after_data: entry.after ?? null,
      request_id: entry.requestId ?? null,
      ip: entry.ip ?? null,
      created_at: entry.timestamp,
    });
    if (error) throw error;
  }
}

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    subjectId: String(row.subject_id),
    role: row.role as SessionRecord['role'],
    refreshTokenHash: String(row.refresh_token_hash),
    deviceId: row.device_id ? String(row.device_id) : undefined,
    createdAt: String(row.created_at),
    expiresAt: String(row.expires_at),
    revokedAt: row.revoked_at ? String(row.revoked_at) : undefined,
    lastSeenAt: String(row.last_seen_at),
  };
}

export function createSecurityStore(env: AppEnv): SecurityStore {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return new SupabaseSecurityStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('Producción requiere Supabase para sesiones, dispositivos y auditoría.');
  }
  if (env.NODE_ENV === 'development') return new DevelopmentSecurityStore(resolve(env.SECURITY_DEVICES_FILE_PATH || join(__dirname, '../../security-devices.json')));
  return new MemorySecurityStore();
}
