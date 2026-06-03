import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Get API health status' })
  @ApiOkResponse({
    description: 'Basic API health response.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: { message: 'Hello API' },
    },
  })
  getData() {
    return this.appService.getData();
  }
}
