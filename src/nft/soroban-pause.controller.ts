import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SorobanContractService } from './soroban-contract.service';

export class PauseStatusDto {
  paused: boolean;
  reason: string | null;
}

@ApiTags('soroban')
@Controller('soroban/pause')
export class SorobanPauseController {
  constructor(private readonly contract: SorobanContractService) {}

  private async status(): Promise<PauseStatusDto> {
    const [paused, reason] = await Promise.all([
      this.contract.read<boolean>('is_paused'),
      this.contract.read<string>('pause_reason'),
    ]);
    return { paused, reason: reason || null };
  }

  @Get()
  @ApiOperation({ summary: 'Get NFT contract pause status and reason' })
  @ApiOkResponse({
    description: 'Current pause state',
    schema: { example: { paused: true, reason: 'Scheduled contract maintenance' } },
  })
  @ApiResponse({ status: 500, description: 'Contract call failed' })
  @ApiResponse({ status: 503, description: 'Soroban RPC unavailable' })
  getPause(): Promise<PauseStatusDto> {
    return this.status();
  }

  @Get('reason')
  @ApiOperation({ summary: 'Get the current pause reason (null when not set)' })
  @ApiOkResponse({
    schema: { example: { paused: true, reason: 'Scheduled contract maintenance' } },
  })
  @ApiResponse({ status: 500, description: 'Contract call failed' })
  @ApiResponse({ status: 503, description: 'Soroban RPC unavailable' })
  getReason(): Promise<PauseStatusDto> {
    return this.status();
  }
}
