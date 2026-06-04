import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRoleRecordEntity } from '../auth/user-role-record.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserRoleRecordEntity)
    private readonly userRoleRecordRepository: Repository<UserRoleRecordEntity>,
  ) {}

  async listTenantUserRecords(tenantId: string): Promise<UserRoleRecordEntity[]> {
    return this.userRoleRecordRepository.find({ where: { tenantId } });
  }
}
