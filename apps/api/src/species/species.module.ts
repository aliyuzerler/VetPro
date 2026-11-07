import { Module } from '@nestjs/common';
import { SpeciesController } from './species.controller';
import { SpeciesService } from './species.service';

/** Tür/ırk kataloğu modülü — Prisma ve Audit altyapısı global modülden gelir. */
@Module({
  controllers: [SpeciesController],
  providers: [SpeciesService],
})
export class SpeciesModule {}
