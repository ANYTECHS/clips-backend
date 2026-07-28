import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { Admin } from '../auth/decorators/admin.decorator';
import { FeeService } from './fee.service';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiForbiddenResponse({ description: 'Forbidden — admin access required' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('admin/fees')
@Auth()
@Admin()
export class AdminFeesController {
  constructor(private readonly feeService: FeeService) {}

  @Get()
  @ApiOperation({
    summary: 'List all fee configurations',
    description: 'Returns all payout fee configurations (admin only)',
  })
  @ApiResponse({ status: 200, description: 'List of fee configs' })
  async getAllFeeConfigs() {
    return this.feeService.getAllFeeConfigs();
  }

  @Get(':method')
  @ApiOperation({
    summary: 'Get fee config by method',
    description:
      'Returns the fee configuration for a specific payout method (admin only)',
  })
  @ApiParam({ name: 'method', description: 'Payout method name' })
  @ApiResponse({ status: 200, description: 'Fee config found' })
  @ApiNotFoundResponse({ description: 'Fee config not found' })
  async getFeeConfig(@Param('method') method: string) {
    return this.feeService.getFeeConfig(method);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a fee configuration',
    description:
      'Creates a new fee configuration for a payout method (admin only)',
  })
  @ApiResponse({ status: 201, description: 'Fee config created' })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  async createFeeConfig(
    @Body()
    body: {
      method: string;
      feePercentage: number;
      fixedFee?: number;
      minFee?: number;
      maxFee?: number;
    },
  ) {
    return this.feeService.createFeeConfig(body);
  }

  @Put(':method')
  @ApiOperation({
    summary: 'Update a fee configuration',
    description: 'Updates an existing fee configuration (admin only)',
  })
  @ApiParam({ name: 'method', description: 'Payout method name' })
  @ApiResponse({ status: 200, description: 'Fee config updated' })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Fee config not found' })
  async updateFeeConfig(
    @Param('method') method: string,
    @Body()
    body: {
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
  @ApiOperation({
    summary: 'Delete a fee configuration',
    description: 'Deletes a fee configuration (admin only)',
  })
  @ApiParam({ name: 'method', description: 'Payout method name' })
  @ApiResponse({ status: 200, description: 'Fee config deleted' })
  @ApiNotFoundResponse({ description: 'Fee config not found' })
  async deleteFeeConfig(@Param('method') method: string) {
    return this.feeService.deleteFeeConfig(method);
  }
}
