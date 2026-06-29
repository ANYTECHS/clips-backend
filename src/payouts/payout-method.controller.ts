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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { PayoutMethodService } from './payout-method.service';
import { CreatePayoutMethodDto } from './dto/create-payout-method.dto';
import { UpdatePayoutMethodDto } from './dto/update-payout-method.dto';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user: { userId: number };
}

@ApiTags('payout-methods')
@Controller('payout-methods')
@Auth()
@ApiBearerAuth()
export class PayoutMethodController {
  constructor(private readonly payoutMethodService: PayoutMethodService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new payout method' })
  @ApiResponse({
    status: 201,
    description: 'Payout method created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
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
  @ApiResponse({ status: 404, description: 'No default payout method found' })
  async getDefault(@Req() req: RequestWithUser) {
    return this.payoutMethodService.getDefaultMethod(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific payout method' })
  @ApiResponse({
    status: 200,
    description: 'Payout method details',
  })
  @ApiResponse({ status: 404, description: 'Payout method not found' })
  async findOne(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutMethodService.findOne(id, req.user.userId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a payout method' })
  @ApiResponse({
    status: 200,
    description: 'Payout method updated successfully',
  })
  @ApiResponse({ status: 404, description: 'Payout method not found' })
  async update(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdatePayoutMethodDto,
  ) {
    return this.payoutMethodService.update(id, req.user.userId, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a payout method' })
  @ApiResponse({
    status: 200,
    description: 'Payout method deleted successfully',
  })
  @ApiResponse({ status: 404, description: 'Payout method not found' })
  async remove(
    @Req() req: RequestWithUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payoutMethodService.remove(id, req.user.userId);
  }
}
