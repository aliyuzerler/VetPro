import { Inject, UnauthorizedException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from '../common/auth/password.service';
import { TokenService } from '../common/auth/token.service';
import { AuditService } from '../audit/audit.service';
import { ENV_TOKEN, type Env } from '../config/env';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export type SessionPayload = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  staff: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    fullName: string;
    title: string | null;
  };
  roles: { key: string; name: string }[];
  permissions: string[];
  allBranches: boolean;
  branches: { id: string; name: string; code: string; isDefault: boolean }[];
  activeBranch: { id: string; name: string; code: string } | null;
};

/**
 * Kimlik servisi — login / refresh rotasyonu / logout / me / aktif şube.
 * Refresh token: opak 48 bayt rastgele değer; veritabanında yalnızca SHA-256 hash.
 * Rotasyon: her refresh'te eski oturum 'rotated' iptal edilir, yenisi yazılır.
 * Tekrar-kullanım algısı: iptal edilmiş bir refresh tekrar sunulursa personelin
 * tüm oturumları 'reuse-detected' ile kapatılır.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwords: PasswordService,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV_TOKEN) private readonly env: Env,
  ) {}

  async login(
    email: string,
    password: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<SessionPayload> {
    const staff = await this.prisma.staff.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        staffRoles: { select: { role: { select: { id: true, key: true, name: true, allBranches: true, rolePermissions: { select: { permissionKey: true } } } } } },
        staffBranches: {
          orderBy: [{ isDefault: 'desc' }],
          select: { isDefault: true, branch: { select: { id: true, name: true, code: true, active: true } } },
        },
      },
    });

    // Kullanıcı yoksa bile zamanlama farkını azaltmak için karma doğrulaması yapılır.
    const probe = staff?.passwordHash ?? this.passwords.hash('timing-equalizer');
    const passwordOk = this.passwords.verify(password, probe);
    if (!staff || !passwordOk) {
      if (staff) {
        await this.audit.record({
          clinicId: staff.clinicId,
          staffId: staff.id,
          action: 'auth.login.failed',
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      }
      throw new UnauthorizedException('E-posta veya parola hatalı');
    }
    if (!staff.active) {
      throw new UnauthorizedException('Hesap pasif; yöneticinizle görüşün');
    }

    const roleViews = staff.staffRoles.map((sr) => sr.role);
    const allBranches = roleViews.some((role) => role.allBranches);
    const activeBranches = staff.staffBranches.filter((sb) => sb.branch.active);
    if (!allBranches && activeBranches.length === 0) {
      throw new ForbiddenException('Hiçbir şubeye atanmamış personel oturum açamaz');
    }

    const defaultBranch = activeBranches[0]?.branch ?? null;
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.AUTH_REFRESH_TTL_SEC * 1000);

    const session = await this.prisma.session.create({
      data: {
        staffId: staff.id,
        branchId: defaultBranch?.id ?? null,
        refreshTokenHash: sha256(refreshToken),
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
        expiresAt,
      },
    });

    await this.audit.record({
      clinicId: staff.clinicId,
      staffId: staff.id,
      branchId: defaultBranch?.id ?? null,
      action: 'auth.login',
      entityType: 'session',
      entityId: session.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: staff.id,
      sid: session.id,
      cid: staff.clinicId,
      br: defaultBranch?.id ?? null,
    });

    return {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + this.tokens.accessTtlSeconds * 1000),
      staff: {
        id: staff.id,
        email: staff.email,
        firstName: staff.firstName,
        lastName: staff.lastName,
        fullName: `${staff.firstName} ${staff.lastName}`,
        title: staff.title,
      },
      roles: roleViews.map((role) => ({ key: role.key, name: role.name })),
      permissions: [...new Set(roleViews.flatMap((role) => role.rolePermissions.map((rp) => rp.permissionKey)))],
      allBranches,
      branches: activeBranches.map((sb) => ({
        id: sb.branch.id,
        name: sb.branch.name,
        code: sb.branch.code,
        isDefault: sb.isDefault,
      })),
      activeBranch: defaultBranch ? { id: defaultBranch.id, name: defaultBranch.name, code: defaultBranch.code } : null,
    };
  }

  async refresh(
    refreshToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<SessionPayload> {
    const tokenHash = sha256(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: {
        staff: {
          include: {
            staffRoles: { select: { role: { select: { id: true, key: true, name: true, allBranches: true, rolePermissions: { select: { permissionKey: true } } } } } },
            staffBranches: {
              orderBy: [{ isDefault: 'desc' }],
              select: { isDefault: true, branch: { select: { id: true, name: true, code: true, active: true } } },
            },
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Oturum bulunamadı; yeniden giriş yapın');
    }

    // Tekrar-kullanım algısı: zaten iptal edilmiş (rotated) token tekrar geldi.
    if (session.revokedAt) {
      if (session.revokedReason === 'rotated') {
        await this.prisma.session.updateMany({
          where: { staffId: session.staffId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'reuse-detected' },
        });
        await this.audit.record({
          clinicId: session.staff.clinicId,
          staffId: session.staffId,
          action: 'auth.session.reuse-detected',
          entityType: 'session',
          entityId: session.id,
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      }
      throw new UnauthorizedException('Oturum geçersiz; yeniden giriş yapın');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'expired' },
      });
      throw new UnauthorizedException('Oturumun süresi doldu; yeniden giriş yapın');
    }

    const staff = session.staff;
    if (!staff.active) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'logout' },
      });
      throw new UnauthorizedException('Hesap pasif');
    }

    const roleViews = staff.staffRoles.map((sr) => sr.role);
    const activeBranches = staff.staffBranches.filter((sb) => sb.branch.active);
    // Aktif şube korunur; personelin artık erişimi yoksa varsayılana döner.
    let branchId = session.branchId;
    const keepsBranch =
      branchId &&
      (roleViews.some((role) => role.allBranches) ||
        activeBranches.some((sb) => sb.branch.id === branchId));
    if (!keepsBranch) {
      branchId = activeBranches[0]?.branch.id ?? null;
    }

    const newRefreshToken = randomBytes(48).toString('base64url');
    const newExpiresAt = new Date(Date.now() + this.env.AUTH_REFRESH_TTL_SEC * 1000);

    // Rotasyon: eski oturumu kapat, yenisini aç.
    const newSession = await this.prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(), revokedReason: 'rotated', lastUsedAt: new Date() },
      });
      return tx.session.create({
        data: {
          staffId: staff.id,
          branchId,
          refreshTokenHash: sha256(newRefreshToken),
          userAgent: meta.userAgent ?? session.userAgent,
          ip: meta.ip ?? session.ip,
          expiresAt: newExpiresAt,
        },
      });
    });

    await this.audit.record({
      clinicId: staff.clinicId,
      staffId: staff.id,
      branchId,
      action: 'auth.refresh',
      entityType: 'session',
      entityId: newSession.id,
      metadata: { rotatedFrom: session.id },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: staff.id,
      sid: newSession.id,
      cid: staff.clinicId,
      br: branchId,
    });
    const activeBranch = activeBranches.find((sb) => sb.branch.id === branchId)?.branch ?? null;

    return {
      accessToken,
      refreshToken: newRefreshToken,
      accessExpiresAt: new Date(Date.now() + this.tokens.accessTtlSeconds * 1000),
      staff: {
        id: staff.id,
        email: staff.email,
        firstName: staff.firstName,
        lastName: staff.lastName,
        fullName: `${staff.firstName} ${staff.lastName}`,
        title: staff.title,
      },
      roles: roleViews.map((role) => ({ key: role.key, name: role.name })),
      permissions: [...new Set(roleViews.flatMap((role) => role.rolePermissions.map((rp) => rp.permissionKey)))],
      allBranches: roleViews.some((role) => role.allBranches),
      branches: activeBranches.map((sb) => ({
        id: sb.branch.id,
        name: sb.branch.name,
        code: sb.branch.code,
        isDefault: sb.isDefault,
      })),
      activeBranch: activeBranch
        ? { id: activeBranch.id, name: activeBranch.name, code: activeBranch.code }
        : null,
    };
  }

  async logout(refreshToken: string, meta: { ip?: string; userAgent?: string }): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256(refreshToken) },
      include: { staff: { select: { clinicId: true } } },
    });
    if (!session || session.revokedAt) return; // idempotent
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
    await this.audit.record({
      clinicId: session.staff.clinicId,
      staffId: session.staffId,
      action: 'auth.logout',
      entityType: 'session',
      entityId: session.id,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async me(ctx: { staffId: string; clinicId: string; sessionId: string }) {
    const staff = await this.prisma.staff.findUnique({
      where: { id: ctx.staffId },
      include: {
        staffRoles: { select: { role: { select: { key: true, name: true, allBranches: true, rolePermissions: { select: { permissionKey: true } } } } } },
        staffBranches: {
          orderBy: [{ isDefault: 'desc' }],
          select: { isDefault: true, branch: { select: { id: true, name: true, code: true, active: true } } },
        },
      },
    });
    if (!staff || !staff.active) {
      throw new UnauthorizedException('Personel pasif');
    }
    const session = await this.prisma.session.findUnique({ where: { id: ctx.sessionId } });
    const roleViews = staff.staffRoles.map((sr) => sr.role);
    const activeBranches = staff.staffBranches.filter((sb) => sb.branch.active);
    const activeBranch =
      activeBranches.find((sb) => sb.branch.id === session?.branchId)?.branch ??
      activeBranches[0]?.branch ??
      null;
    return {
      staff: {
        id: staff.id,
        email: staff.email,
        firstName: staff.firstName,
        lastName: staff.lastName,
        fullName: `${staff.firstName} ${staff.lastName}`,
        title: staff.title,
      },
      roles: roleViews.map((role) => ({ key: role.key, name: role.name })),
      permissions: [...new Set(roleViews.flatMap((role) => role.rolePermissions.map((rp) => rp.permissionKey)))],
      allBranches: roleViews.some((role) => role.allBranches),
      branches: activeBranches.map((sb) => ({
        id: sb.branch.id,
        name: sb.branch.name,
        code: sb.branch.code,
        isDefault: sb.isDefault,
      })),
      activeBranch: activeBranch
        ? { id: activeBranch.id, name: activeBranch.name, code: activeBranch.code }
        : null,
    };
  }

  async setActiveBranch(
    ctx: { staffId: string; clinicId: string; sessionId: string; allBranches: boolean; branchIds: string[] },
    branchId: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, clinicId: ctx.clinicId, active: true },
    });
    if (!branch) {
      throw new ForbiddenException('Şube bulunamadı veya erişilemez');
    }
    if (!ctx.allBranches && !ctx.branchIds.includes(branchId)) {
      throw new ForbiddenException('Bu şube için yetkiniz yok');
    }
    await this.prisma.session.update({
      where: { id: ctx.sessionId },
      data: { branchId },
    });
    await this.audit.record({
      clinicId: ctx.clinicId,
      staffId: ctx.staffId,
      branchId,
      action: 'auth.branch.switch',
      entityType: 'branch',
      entityId: branchId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { id: branch.id, name: branch.name, code: branch.code };
  }
}
