import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { Auth } from '../auth/decorators/auth.decorator';
import { Admin } from '../auth/decorators/admin.decorator';
import { FeeService } from './fee.service';

@Controller('admin/fees')
@Auth()
@Admin()
export class AdminFeesController {
  constructor(private readonly feeService: FeeService) {}

  @Get()
  async getAllFeeConfigs() {
    return this.feeService.getAllFeeConfigs();
  }

  @Get(':method')
  async getFeeConfig(@Param('method') method: string) {
    return this.feeService.getFeeConfig(method);
  }

  @Post()
  async createFeeConfig(@Body() body: {
    method: string;
    feePercentage: number;
    fixedFee?: number;
    minFee?: number;
    maxFee?: number;
  }) {
    return this.feeService.createFeeConfig(body);
  }

  @Put(':method')
  async updateFeeConfig(
    @Param('method') method: string,
    @Body() body: {
      feePercentage?: number;
      fixedFee?: number;
      minFee?: number;
      maxFee?: number;
      isActive?: boolean;
    },
  ) {
    return this.feeService.updateFeeConfig(method, body);
  }

  @Delete(':method')
  async deleteFeeConfig(@Param('method') method: string) {
    return this.feeService.deleteFeeConfig(method);
  }
}
