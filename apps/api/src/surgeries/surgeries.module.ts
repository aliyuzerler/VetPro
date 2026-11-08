import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SurgeriesController } from './surgeries.controller';
import { SurgeriesService } from './surgeries.service';

/** Cerrahi — Faz 11 (olgu, anestezi çizelgesi, kontrol listeleri). */
@Module({
  imports: [PrismaModule],
  controllers: [SurgeriesController],
  providers: [SurgeriesService],
  exports: [SurgeriesService],
})
export class SurgeriesModule {}
