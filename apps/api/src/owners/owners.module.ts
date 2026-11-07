import { Module } from '@nestjs/common';
import { OwnersController } from './owners.controller';
import { OwnersService } from './owners.service';

/** Hasta sahibi modülü — klinik kapsamlı kayıtlar (Faz 04). */
@Module({
  controllers: [OwnersController],
  providers: [OwnersService],
})
export class OwnersModule {}
