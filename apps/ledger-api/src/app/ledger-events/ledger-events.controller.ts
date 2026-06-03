import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Observable } from 'rxjs';
import type {
  AppendLedgerEventDto,
  LedgerEventResponse,
} from '@true-north-ledger/ledger-contracts';
import { AppendLedgerEventDtoSchema } from '@true-north-ledger/ledger-contracts';
import { LedgerEventsService } from './ledger-events.service';
import { ZodValidationPipe } from './ledger-events.pipe';

@Controller('v1/ledger/events')
export class LedgerEventsController {
  constructor(private readonly ledgerEventsService: LedgerEventsService) {}

  @Get()
  findAll(): Observable<LedgerEventResponse[]> {
    return this.ledgerEventsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Observable<LedgerEventResponse> {
    return this.ledgerEventsService.findOne(id);
  }

  @Post()
  appendEvent(
    @Body(new ZodValidationPipe(AppendLedgerEventDtoSchema))
    payload: AppendLedgerEventDto,
  ): Observable<LedgerEventResponse> {
    return this.ledgerEventsService.appendEvent(payload);
  }
}
