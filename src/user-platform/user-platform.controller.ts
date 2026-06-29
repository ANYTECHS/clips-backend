import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserPlatformService } from './user-platform.service';
import { AuthGuard } from '@nestjs/passport';
import type { UserPlatformCreateInput, UserPlatformUpdateInput } from './user-platform.service';

@Controller(['user-platforms', 'user-platform'])
@UseGuards(AuthGuard('jwt'))
export class UserPlatformController {
  constructor(private readonly userPlatformService: UserPlatformService) {}

  @Post()
  async create(@Request() req: any, @Body() data: UserPlatformCreateInput) {
    return this.userPlatformService.create({
      ...data,
      userId: req.user.id,
    });
  }

  @Get()
  async findAll(@Request() req: any) {
    return this.userPlatformService.findAll(req.user.id);
  }

  @Get('platform/:platform')
  async findByPlatform(
    @Request() req: any,
    @Param('platform') platform: string,
  ) {
    return this.userPlatformService.findByPlatform(req.user.id, platform);
  }

  @Get(':id')
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.userPlatformService.findOne(Number(id), req.user.id);
  }

  @Put(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() data: UserPlatformUpdateInput,
  ) {
    return this.userPlatformService.update(Number(id), data, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.userPlatformService.remove(Number(id), req.user.id);
  }

  @Post('migrate')
  @HttpCode(HttpStatus.OK)
  async migrate() {
    return this.userPlatformService.migrateExistingRecords();
  }
}
