import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { PayoutMethodService } from './payout-method.service';
import { CreatePayoutMethodDto } from './dto/create-payout-method.dto';
import { UpdatePayoutMethodDto } from './dto/update-payout-method.dto';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: { userId: number };
}

@ApiTags('payout-methods')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('payout-methods')
@Auth()
export class PayoutMethodController {
  constructor(private readonly payoutMethodService: PayoutMethodService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new payout method' })
  @ApiBody({ type: CreatePayoutMethodDto })
  @ApiResponse({
    status: 201,
    description: 'Payout method created successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  async create(
    @Req() req: RequestWithUser,
    @Body() createDto: CreatePayoutMethodDto,
  ) {
    return this.payoutMethodService.create(req.user.userId, createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all payout methods for the current user' })
  @ApiResponse({
    status: 200,
    description: 'List of payout methods',
  })
  async findAll(@Req() req: RequestWithUser) {
    return this.payoutMethodService.findAll(req.user.userId);
  }

  @Get('default')
  @ApiOperation({ summary: 'Get the default payout method' })
  @ApiResponse({
    status: 200,
    description: 'Default payout method',
  })
  @ApiNotFoundResponse({ description: 'No default payout method found' })
  async getDefault(@Req() req: RequestWithUser) {
    return this.payoutMethodService.getDefaultMethod(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific payout method' })
  @ApiParam({ name: 'id', description: 'Payout method ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Payout method details',
  })
  @ApiNotFoundResponse({ description: 'Payout method not found' })
  async findOne(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutMethodService.findOne(id, req.user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a payout method' })
  @ApiParam({ name: 'id', description: 'Payout method ID', example: 1 })
  @ApiBody({ type: UpdatePayoutMethodDto })
  @ApiResponse({
    status: 200,
    description: 'Payout method updated successfully',
  })
  @ApiNotFoundResponse({ description: 'Payout method not found' })
  async update(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdatePayoutMethodDto,
  ) {
    return this.payoutMethodService.update(id, req.user.userId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a payout method' })
  @ApiParam({ name: 'id', description: 'Payout method ID', example: 1 })
  @ApiResponse({
    status: 200,
    description: 'Payout method deleted successfully',
  })
  @ApiNotFoundResponse({ description: 'Payout method not found' })
  async remove(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutMethodService.remove(id, req.user.userId);
  }
}
