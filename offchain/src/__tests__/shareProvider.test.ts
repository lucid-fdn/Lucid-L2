import { MockTokenLauncher } from '../../packages/engine/src/identity/shares/MockTokenLauncher';
import { getTokenLauncher, resetTokenLauncher } from '../../packages/engine/src/identity/shares';
import { TokenLaunchParams } from '../../packages/engine/src/identity/shares/ITokenLauncher';

const testParams: TokenLaunchParams = {
  passportId: 'mdl_test_share',
  name: 'Test Share Token',
  symbol: 'TSHR',
  uri: 'https://arweave.net/metadata123',
  totalSupply: 1_000_000,
  decimals: 6,
  owner: 'ownerWallet123',
};

describe('MockTokenLauncher', () => {
  let launcher: MockTokenLauncher;

  beforeEach(() => {
    // Each test gets a fresh instance but shares the module-level registry.
    // Use unique passportIds per test to avoid collisions.
    launcher = new MockTokenLauncher();
  });

  it('should launch a token and return result', async () => {
    const params = { ...testParams, passportId: 'mdl_launch_test' };
    const result = await launcher.launchToken(params);

    expect(result.mint).toMatch(/^mock_token_/);
    expect(result.txSignature).toMatch(/^mock_tx_/);
    expect(result.totalSupply).toBe(1_000_000);
    expect(result.provider).toBe('mock');
  });

  it('should store and retrieve token info', async () => {
    const params = { ...testParams, passportId: 'mdl_info_test' };
    const result = await launcher.launchToken(params);

    const info = await launcher.getTokenInfo('mdl_info_test');
    expect(info).not.toBeNull();
    expect(info!.mint).toBe(result.mint);
    expect(info!.passportId).toBe('mdl_info_test');
    expect(info!.name).toBe('Test Share Token');
    expect(info!.symbol).toBe('TSHR');
    expect(info!.totalSupply).toBe(1_000_000);
    expect(info!.decimals).toBe(6);
    expect(info!.holders).toBe(1);
  });

  it('should return null for unknown passport', async () => {
    const info = await launcher.getTokenInfo('nonexistent');
    expect(info).toBeNull();
  });

  it('should default decimals to 6', async () => {
    const params = { ...testParams, passportId: 'mdl_decimals_test', decimals: undefined };
    await launcher.launchToken(params);

    const info = await launcher.getTokenInfo('mdl_decimals_test');
    expect(info!.decimals).toBe(6);
  });

  it('should respect custom decimals', async () => {
    const params = { ...testParams, passportId: 'mdl_custom_dec', decimals: 9 };
    await launcher.launchToken(params);

    const info = await launcher.getTokenInfo('mdl_custom_dec');
    expect(info!.decimals).toBe(9);
  });

  it('should be healthy', async () => {
    expect(await launcher.isHealthy()).toBe(true);
  });

  it('should overwrite token info on re-launch for same passport', async () => {
    const params1 = { ...testParams, passportId: 'mdl_relaunch', totalSupply: 500_000 };
    const params2 = { ...testParams, passportId: 'mdl_relaunch', totalSupply: 2_000_000, symbol: 'TSHR2' };

    await launcher.launchToken(params1);
    const result2 = await launcher.launchToken(params2);

    const info = await launcher.getTokenInfo('mdl_relaunch');
    expect(info!.mint).toBe(result2.mint);
    expect(info!.totalSupply).toBe(2_000_000);
    expect(info!.symbol).toBe('TSHR2');
  });
});

describe('Token Launcher Factory', () => {
  afterEach(() => {
    resetTokenLauncher();
    delete process.env.TOKEN_LAUNCHER;
  });

  it('should default to mock provider', () => {
    const launcher = getTokenLauncher();
    expect(launcher.providerName).toBe('mock');
  });

  it('should return singletons', () => {
    const a = getTokenLauncher();
    const b = getTokenLauncher();
    expect(a).toBe(b);
  });

  it('should reset singletons', () => {
    const a = getTokenLauncher();
    resetTokenLauncher();
    const b = getTokenLauncher();
    expect(a).not.toBe(b);
  });
});
