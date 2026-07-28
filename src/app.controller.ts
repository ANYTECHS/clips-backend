import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('app')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns a simple health check response',
  })
  @ApiResponse({ status: 200, description: 'Application is running' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('.well-known/security.txt')
  @ApiOperation({
    summary: 'Security policy file',
    description: 'Returns the security.txt file for vulnerability disclosure',
  })
  @ApiResponse({ status: 200, description: 'Security policy file' })
  getSecurityTxt(@Res() res: Response): void {
    const filePath = path.join(process.cwd(), '.well-known', 'security.txt');
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'text/plain');
      res.sendFile(filePath);
    } else {
      res.status(404).send('Not found');
    }
  }
}
