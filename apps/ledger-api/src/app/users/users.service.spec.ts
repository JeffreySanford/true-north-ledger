import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserRoleRecordEntity } from '../auth/user-role-record.entity';

describe('UsersService', () => {
  let service: UsersService;
  const repository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(UserRoleRecordEntity),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('lists tenant user records', async () => {
    repository.find.mockResolvedValue([{ tenantId: 'tenant-1', userId: 'u1', username: 'ops', roles: ['viewer'] }]);

    const result = await service.listTenantUserRecords('tenant-1');

    expect(result).toHaveLength(1);
    expect(repository.find).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
  });
});
