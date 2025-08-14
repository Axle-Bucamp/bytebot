import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VllmService } from './vllm.service';

@Module({
  imports: [ConfigModule],
  providers: [VllmService],
  exports: [VllmService],
})
export class VllmModule {}
