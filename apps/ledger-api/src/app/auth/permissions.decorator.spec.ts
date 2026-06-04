import 'reflect-metadata';
import { RequirePermissions, REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';

describe('RequirePermissions', () => {
  it('attaches permissions metadata to a handler', () => {
    class TestController {
      @RequirePermissions('read', 'write')
      testMethod() {
        return true;
      }
    }

    const metadata = Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, TestController.prototype.testMethod);

    expect(metadata).toEqual(['read', 'write']);
  });
});
