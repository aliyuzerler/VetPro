import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Ip, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { ActiveBranchDto, LoginDto, LogoutDto, RefreshDto } from './dto/auth.dto';
import { Public, CurrentAuth } from '../common/auth/decorators';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';
import type { AuthContext } from '../common/auth/auth-context';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  private meta(ip: string | undefined, userAgent: string | undefined) {
    return { ip, userAgent };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(
    @Body() dto: LoginDto,
    @Ip() ip?: string,
  ) {
    return this.auth.login(dto.email, dto.password, this.meta(ip, undefined));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Ip() ip?: string) {
    return this.auth.refresh(dto.refreshToken, this.meta(ip, undefined));
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Body() dto: LogoutDto, @Ip() ip?: string): Promise<void> {
    await this.auth.logout(dto.refreshToken, this.meta(ip, undefined));
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me({ staffId: auth.staffId, clinicId: auth.clinicId, sessionId: auth.sessionId });
  }

  @ApiBearerAuth()
  // JwtAuthGuard globaldir; burada yalnızca şube kapsamı çözülür.
  @UseGuards(BranchScopeGuard)
  @Patch('active-branch')
  setActiveBranch(@Body() dto: ActiveBranchDto, @CurrentAuth() auth: AuthContext, @Ip() ip?: string) {
    return this.auth.setActiveBranch(
      {
        staffId: auth.staffId,
        clinicId: auth.clinicId,
        sessionId: auth.sessionId,
        allBranches: auth.allBranches,
        branchIds: auth.branchIds,
      },
      dto.branchId,
      this.meta(ip, undefined),
    );
  }
}
