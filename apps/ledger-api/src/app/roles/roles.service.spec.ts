import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RolesService } from './roles.service';
import { TenantRolePermissionEntity } from '../auth/tenant-role-permission.entity';

describe('RolesService', () => {
  let service: RolesService;
  const repository = {
    find: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        {
          provide: getRepositoryToken(TenantRolePermissionEntity),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('lists tenant role mappings', async () => {
    repository.find.mockResolvedValue([{ tenantId: 'tenant-1', role: 'viewer', permissions: ['ledger.read'] }]);

    const result = await service.listTenantRoleMappings('tenant-1');

    expect(result).toHaveLength(1);
    expect(repository.find).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
  });
});
