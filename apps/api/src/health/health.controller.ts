import { Controller, Get, HttpException, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/auth/decorators';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
// Sağlık uçları kimlik doğrulaması dışındadır: orkestratör/load balancer erişir.
@Public()
export class HealthController {
  // Vitest/esbuild decorator metadata üretmediğinden bağımlılıklar açık @Inject ile çözümlenir.
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  /**
   * Liveness: süreç ayakta mı? (Orkestratör healthcheck'i bu uçtan okur.)
   */
  @Get()
  @ApiOperation({ summary: 'Liveness durumu' })
  async getHealth() {
    return this.healthService.getLiveness();
  }

  /**
   * Readiness: bağımlılıklar (veritabanı) hazır mı?
   * Veritabanı erişilemezse HTTP 503 döner; gövde yine sözleşmeye uygundur.
   */
  @Get('readiness')
  @ApiOperation({ summary: 'Readiness durumu' })
  async getReadiness() {
    const result = await this.healthService.getReadiness();
    if (result.status === 'down') {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
