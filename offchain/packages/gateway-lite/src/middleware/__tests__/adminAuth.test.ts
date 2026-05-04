jest.mock('../../../../engine/src/shared/db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn().mockResolvedValue({ rows: [] }) },
}));

jest.mock('../../../../engine/src/shared/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { getConfiguredAdminApiKey } from '../adminAuth';

describe('admin auth env resolution', () => {
  beforeEach(() => {
    delete process.env.ADMIN_API_KEY;
    delete process.env.LUCID_L2_ADMIN_KEY;
    delete process.env.LUCID_L2_API_KEY;
    delete process.env.L2_ADMIN_API_KEY;
    delete process.env.L2_GATEWAY_ADMIN_API_KEY;
    delete process.env.CONTROL_PLANE_ADMIN_KEY;
    delete process.env.LUCID_API_KEY;
  });

  it('prefers ADMIN_API_KEY when present', () => {
    process.env.ADMIN_API_KEY = 'admin-key';
    process.env.LUCID_L2_ADMIN_KEY = 'alias-key';

    expect(getConfiguredAdminApiKey()).toBe('admin-key');
  });

  it('accepts app-side L2 admin aliases', () => {
    process.env.LUCID_L2_ADMIN_KEY = 'alias-key';

    expect(getConfiguredAdminApiKey()).toBe('alias-key');
  });

  it('accepts the L2 control-plane service key name', () => {
    process.env.CONTROL_PLANE_ADMIN_KEY = 'control-plane-key';

    expect(getConfiguredAdminApiKey()).toBe('control-plane-key');
  });

  it('accepts legacy Lucid API key as a last-resort alias', () => {
    process.env.LUCID_API_KEY = 'legacy-platform-key';

    expect(getConfiguredAdminApiKey()).toBe('legacy-platform-key');
  });

  it('returns undefined when no admin key alias is configured', () => {
    expect(getConfiguredAdminApiKey()).toBeUndefined();
  });
});
