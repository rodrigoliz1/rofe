import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import type { AppEnv } from '../config/env';
import { AppError } from '../utils/errors';
import type { SecurityStore } from './store';
import type { AuthPrincipal, Role, SessionRecord, UserRecord } from './types';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface RefreshClaims extends jwt.JwtPayload {
  sub: string;
  sid: string;
  role: Role;
  deviceId?: string;
  kind: 'refresh';
}

export class AuthService {
  constructor(private readonly env: AppEnv, private readonly store: SecurityStore) {}

  async initialize(): Promise<void> {
    const users: UserRecord[] = [];
    if (this.env.AUTH_BOOTSTRAP_ADMIN_HASH) {
      users.push({
        id: '00000000-0000-4000-8000-000000000001',
        email: this.env.AUTH_BOOTSTRAP_ADMIN_EMAIL,
        passwordHash: this.env.AUTH_BOOTSTRAP_ADMIN_HASH,
        role: 'ADMIN',
        active: true,
      });
    }
    if (this.env.AUTH_BOOTSTRAP_BARISTA_HASH) {
      users.push({
        id: '00000000-0000-4000-8000-000000000002',
        email: this.env.AUTH_BOOTSTRAP_BARISTA_EMAIL,
        passwordHash: this.env.AUTH_BOOTSTRAP_BARISTA_HASH,
        role: 'BARISTA',
        active: true,
      });
    }
    await this.store.initialize(users);
  }

  async login(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; principal: AuthPrincipal }> {
    const user = await this.store.findUserByEmail(email);
    const valid = user?.active === true && await bcrypt.compare(password, user.passwordHash);
    if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales incorrectas.');
    return this.createSession(user.id, user.role);
  }

  async verifyManagerCredentials(email: string, password: string): Promise<Omit<UserRecord, 'passwordHash'>> {
    const user = await this.store.findUserByEmail(email);
    const valid = user?.active === true && await bcrypt.compare(password, user.passwordHash);
    if (!user || !valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales incorrectas.');
    if (user.role !== 'ADMIN' && user.role !== 'MANAGER') {
      throw new AppError(403, 'DISCOUNT_REQUIRES_MANAGER', 'El descuento requiere autorización de gerencia.');
    }
    return toPublicUser(user);
  }

  async listUsers(): Promise<Array<Omit<UserRecord, 'passwordHash'>>> {
    return this.store.listUsers();
  }

  async createUser(input: { email: string; password: string; role: Exclude<Role, 'POS_DEVICE'> }): Promise<Omit<UserRecord, 'passwordHash'>> {
    if (await this.store.findUserByEmail(input.email)) throw new AppError(409, 'USER_EXISTS', 'Ya existe un usuario con ese correo.');
    const user: UserRecord = { id: randomUUID(), email: input.email.toLowerCase(), passwordHash: await bcrypt.hash(input.password, 12), role: input.role, active: true };
    await this.store.saveUser(user);
    return toPublicUser(user);
  }

  async updateUser(email: string, input: { password?: string; role?: Exclude<Role, 'POS_DEVICE'>; active?: boolean }): Promise<Omit<UserRecord, 'passwordHash'>> {
    const current = await this.store.findUserByEmail(email);
    if (!current) throw new AppError(404, 'USER_NOT_FOUND', 'Usuario no encontrado.');
    const user: UserRecord = { ...current, role: input.role ?? current.role, active: input.active ?? current.active, passwordHash: input.password ? await bcrypt.hash(input.password, 12) : current.passwordHash };
    await this.store.saveUser(user);
    await this.store.revokeSessionsForSubject(user.id, new Date().toISOString());
    return toPublicUser(user);
  }

  async registerDevice(name: string, enrollmentSecret: string): Promise<{ deviceId: string; deviceToken: string }> {
    if (!this.env.DEVICE_ENROLLMENT_SECRET || !safeEqual(enrollmentSecret, this.env.DEVICE_ENROLLMENT_SECRET)) {
      throw new AppError(403, 'INVALID_ENROLLMENT_SECRET', 'No se pudo registrar el dispositivo.');
    }
    const deviceId = randomUUID();
    const deviceToken = randomBytes(32).toString('base64url');
    await this.store.saveDevice({
      id: deviceId,
      name,
      tokenHash: hashToken(deviceToken),
      active: true,
      createdAt: new Date().toISOString(),
    });
    return { deviceId, deviceToken };
  }

  async loginDevice(deviceId: string, deviceToken: string): Promise<{ accessToken: string; refreshToken: string; principal: AuthPrincipal }> {
    const device = await this.store.findDevice(deviceId);
    if (!device?.active || device.revokedAt || !safeEqual(hashToken(deviceToken), device.tokenHash)) {
      throw new AppError(401, 'INVALID_DEVICE', 'Este dispositivo no está autorizado.');
    }
    await this.store.saveDevice({ ...device, lastSeenAt: new Date().toISOString() });
    return this.createSession(device.id, 'POS_DEVICE', device.id);
  }

  verifyAccessToken(token: string): AuthPrincipal {
    try {
      const claims = jwt.verify(token, this.env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
      if (claims.kind !== 'access' || !claims.sub || !claims.sid || !claims.role) throw new Error('invalid claims');
      return {
        subjectId: claims.sub,
        sessionId: String(claims.sid),
        role: claims.role as Role,
        deviceId: claims.deviceId ? String(claims.deviceId) : undefined,
      };
    } catch {
      throw new AppError(401, 'SESSION_EXPIRED', 'Tu sesión venció. Ingresa de nuevo.');
    }
  }

  async verifyActiveAccessToken(token: string): Promise<AuthPrincipal> {
    const principal = this.verifyAccessToken(token);
    const session = await this.store.findSession(principal.sessionId);
    if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new AppError(401, 'SESSION_EXPIRED', 'Tu sesión venció. Ingresa de nuevo.');
    }
    if (principal.deviceId) {
      const device = await this.store.findDevice(principal.deviceId);
      if (!device?.active || device.revokedAt) throw new AppError(401, 'DEVICE_REVOKED', 'Este dispositivo fue revocado.');
    }
    return principal;
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; principal: AuthPrincipal }> {
    let claims: RefreshClaims;
    try {
      claims = jwt.verify(refreshToken, this.env.JWT_REFRESH_SECRET) as RefreshClaims;
    } catch {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'La sesión ya no es válida.');
    }
    if (claims.kind !== 'refresh') throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'La sesión ya no es válida.');
    const session = await this.store.findSession(claims.sid);
    if (!session || session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now() || !safeEqual(hashToken(refreshToken), session.refreshTokenHash)) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'La sesión ya no es válida.');
    }
    await this.store.revokeSession(session.id, new Date().toISOString());
    return this.createSession(claims.sub, claims.role, claims.deviceId);
  }

  async logout(sessionId: string): Promise<void> {
    await this.store.revokeSession(sessionId, new Date().toISOString());
  }

  private async createSession(subjectId: string, role: Role, deviceId?: string) {
    const sessionId = randomUUID();
    const principal: AuthPrincipal = { subjectId, role, sessionId, deviceId };
    const accessToken = jwt.sign(
      { sid: sessionId, role, deviceId, kind: 'access' },
      this.env.JWT_ACCESS_SECRET,
      { subject: subjectId, expiresIn: ACCESS_TTL_SECONDS },
    );
    const refreshToken = jwt.sign(
      { sid: sessionId, role, deviceId, kind: 'refresh' },
      this.env.JWT_REFRESH_SECRET,
      { subject: subjectId, expiresIn: Math.floor(REFRESH_TTL_MS / 1000) },
    );
    const now = new Date();
    const session: SessionRecord = {
      id: sessionId,
      subjectId,
      role,
      deviceId,
      refreshTokenHash: hashToken(refreshToken),
      createdAt: now.toISOString(),
      lastSeenAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REFRESH_TTL_MS).toISOString(),
    };
    await this.store.saveSession(session);
    return { accessToken, refreshToken, principal };
  }
}

function toPublicUser(user: UserRecord): Omit<UserRecord, 'passwordHash'> {
  return { id: user.id, email: user.email, role: user.role, active: user.active };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
