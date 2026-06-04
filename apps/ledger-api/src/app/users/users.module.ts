import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRoleRecordEntity } from '../auth/user-role-record.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserRoleRecordEntity])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
