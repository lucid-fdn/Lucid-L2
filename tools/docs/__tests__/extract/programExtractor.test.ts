import path from 'path';
import { extractSolanaProgram, extractSolidityContract } from '../../src/extract/programExtractor';
import type { ProgramSnapshot, ContractSnapshot } from '../../src/extract/programExtractor';

// ---------------------------------------------------------------------------
// Path constants
// ---------------------------------------------------------------------------

// __dirname = tools/docs/__tests__/extract — go up 4 levels to reach repo root
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const THOUGHT_EPOCH_DIR = path.join(REPO_ROOT, 'programs', 'thought-epoch');
const LUCID_PASSPORTS_DIR = path.join(REPO_ROOT, 'programs', 'lucid-passports');
const LUCID_REPUTATION_DIR = path.join(REPO_ROOT, 'programs', 'lucid-reputation');

const PASSPORT_REGISTRY_SOL = path.join(REPO_ROOT, 'contracts', 'src', 'LucidPassportRegistry.sol');
const LUCID_SOL = path.join(REPO_ROOT, 'contracts', 'src', 'Lucid.sol');

// ---------------------------------------------------------------------------
// Solana: thought-epoch
// ---------------------------------------------------------------------------

describe('extractSolanaProgram — thought-epoch', () => {
  let snapshot: ProgramSnapshot;

  beforeAll(() => {
    snapshot = extractSolanaProgram(THOUGHT_EPOCH_DIR);
  });

  it('sets programName from the #[program] mod name', () => {
    expect(snapshot.programName).toBe('thought_epoch');
  });

  it('sets sourcePath to the lib.rs file', () => {
    expect(snapshot.sourcePath).toContain('lib.rs');
  });

  it('populates sourceContent', () => {
    expect(snapshot.sourceContent.length).toBeGreaterThan(100);
    expect(snapshot.sourceContent).toContain('#[program]');
  });

  it('computes a non-empty contentHash', () => {
    expect(snapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('extracts all six instructions', () => {
    const names = snapshot.instructions.map((i) => i.name);
    expect(names).toContain('init_epoch');
    expect(names).toContain('commit_epoch');
    expect(names).toContain('init_epochs');
    expect(names).toContain('commit_epochs');
    expect(names).toContain('init_epoch_v2');
    expect(names).toContain('commit_epoch_v2');
  });

  it('init_epoch has param "root"', () => {
    const ix = snapshot.instructions.find((i) => i.name === 'init_epoch')!;
    expect(ix).toBeDefined();
    expect(ix.params).toContain('root');
  });

  it('init_epoch_v2 has multiple params (root, epoch_id, leaf_count, timestamp, mmr_size)', () => {
    const ix = snapshot.instructions.find((i) => i.name === 'init_epoch_v2')!;
    expect(ix).toBeDefined();
    expect(ix.params).toContain('root');
    expect(ix.params).toContain('epoch_id');
    expect(ix.params).toContain('leaf_count');
    expect(ix.params).toContain('timestamp');
    expect(ix.params).toContain('mmr_size');
  });

  it('commit_epochs has param "roots"', () => {
    const ix = snapshot.instructions.find((i) => i.name === 'commit_epochs')!;
    expect(ix).toBeDefined();
    expect(ix.params).toContain('roots');
  });

  it('extracts #[derive(Accounts)] structs', () => {
    const names = snapshot.accountStructs.map((s) => s.name);
    expect(names).toContain('InitEpoch');
    expect(names).toContain('UpdateEpoch');
    expect(names).toContain('InitEpochs');
    expect(names).toContain('UpdateEpochs');
    expect(names).toContain('InitEpochV2');
    expect(names).toContain('UpdateEpochV2');
  });

  it('InitEpoch struct has authority field', () => {
    const s = snapshot.accountStructs.find((s) => s.name === 'InitEpoch')!;
    expect(s).toBeDefined();
    expect(s.fields).toContain('authority');
  });

  it('does not include ctx as an instruction param', () => {
    for (const ix of snapshot.instructions) {
      expect(ix.params).not.toContain('ctx');
    }
  });
});

// ---------------------------------------------------------------------------
// Solana: lucid-passports
// ---------------------------------------------------------------------------

describe('extractSolanaProgram — lucid-passports', () => {
  let snapshot: ProgramSnapshot;

  beforeAll(() => {
    snapshot = extractSolanaProgram(LUCID_PASSPORTS_DIR);
  });

  it('sets programName to lucid_passports', () => {
    expect(snapshot.programName).toBe('lucid_passports');
  });

  it('extracts register_passport instruction', () => {
    const names = snapshot.instructions.map((i) => i.name);
    expect(names).toContain('register_passport');
  });

  it('register_passport has expected params (not ctx)', () => {
    const ix = snapshot.instructions.find((i) => i.name === 'register_passport')!;
    expect(ix).toBeDefined();
    expect(ix.params).toContain('asset_type');
    expect(ix.params).toContain('slug');
    expect(ix.params).not.toContain('ctx');
  });

  it('extracts set_payment_gate and pay_for_access instructions', () => {
    const names = snapshot.instructions.map((i) => i.name);
    expect(names).toContain('set_payment_gate');
    expect(names).toContain('pay_for_access');
  });

  it('extracts RegisterPassport and SetPaymentGate account structs', () => {
    const names = snapshot.accountStructs.map((s) => s.name);
    expect(names).toContain('RegisterPassport');
    expect(names).toContain('SetPaymentGate');
  });

  it('computes a non-empty contentHash', () => {
    expect(snapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// Solana: lucid-reputation
// ---------------------------------------------------------------------------

describe('extractSolanaProgram — lucid-reputation', () => {
  let snapshot: ProgramSnapshot;

  beforeAll(() => {
    snapshot = extractSolanaProgram(LUCID_REPUTATION_DIR);
  });

  it('sets programName to lucid_reputation', () => {
    expect(snapshot.programName).toBe('lucid_reputation');
  });

  it('extracts init_stats instruction', () => {
    const names = snapshot.instructions.map((i) => i.name);
    expect(names).toContain('init_stats');
  });

  it('extracts submit_feedback instruction with params', () => {
    const ix = snapshot.instructions.find((i) => i.name === 'submit_feedback')!;
    expect(ix).toBeDefined();
    expect(ix.params).toContain('passport_id');
    expect(ix.params).toContain('score');
  });
});

// ---------------------------------------------------------------------------
// Solidity: LucidPassportRegistry
// ---------------------------------------------------------------------------

describe('extractSolidityContract — LucidPassportRegistry', () => {
  let snapshot: ContractSnapshot;

  beforeAll(() => {
    snapshot = extractSolidityContract(PASSPORT_REGISTRY_SOL);
  });

  it('sets contractName to LucidPassportRegistry', () => {
    expect(snapshot.contractName).toBe('LucidPassportRegistry');
  });

  it('sets sourcePath to the .sol file', () => {
    expect(snapshot.sourcePath).toContain('LucidPassportRegistry.sol');
  });

  it('populates sourceContent', () => {
    expect(snapshot.sourceContent.length).toBeGreaterThan(100);
    expect(snapshot.sourceContent).toContain('contract LucidPassportRegistry');
  });

  it('computes a non-empty contentHash', () => {
    expect(snapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('extracts anchorPassport function', () => {
    const names = snapshot.functions.map((f) => f.name);
    expect(names).toContain('anchorPassport');
  });

  it('extracts payForAccess function with payable visibility', () => {
    const fn = snapshot.functions.find((f) => f.name === 'payForAccess')!;
    expect(fn).toBeDefined();
  });

  it('extracts verifyAnchor function', () => {
    const names = snapshot.functions.map((f) => f.name);
    expect(names).toContain('verifyAnchor');
  });

  it('extracts verifyAnchor with external visibility', () => {
    const fn = snapshot.functions.find((f) => f.name === 'verifyAnchor')!;
    expect(fn).toBeDefined();
    expect(fn.visibility).toBe('external');
  });

  it('extracts setSyncer function', () => {
    const names = snapshot.functions.map((f) => f.name);
    expect(names).toContain('setSyncer');
  });

  it('extracts setGate, withdrawRevenue, revokeAccess functions', () => {
    const names = snapshot.functions.map((f) => f.name);
    expect(names).toContain('setGate');
    expect(names).toContain('withdrawRevenue');
    expect(names).toContain('revokeAccess');
  });

  it('extracts PassportAnchored event', () => {
    const names = snapshot.events.map((e) => e.name);
    expect(names).toContain('PassportAnchored');
  });

  it('extracts AccessPurchased event', () => {
    const names = snapshot.events.map((e) => e.name);
    expect(names).toContain('AccessPurchased');
  });

  it('extracts GateSet and RevenueWithdrawn events', () => {
    const names = snapshot.events.map((e) => e.name);
    expect(names).toContain('GateSet');
    expect(names).toContain('RevenueWithdrawn');
  });

  it('PassportAnchored event has non-empty params', () => {
    const ev = snapshot.events.find((e) => e.name === 'PassportAnchored')!;
    expect(ev).toBeDefined();
    expect(ev.params.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Solidity: Lucid (ERC-20 token)
// ---------------------------------------------------------------------------

describe('extractSolidityContract — Lucid', () => {
  let snapshot: ContractSnapshot;

  beforeAll(() => {
    snapshot = extractSolidityContract(LUCID_SOL);
  });

  it('sets contractName to Lucid', () => {
    expect(snapshot.contractName).toBe('Lucid');
  });

  it('extracts decimals function with public visibility', () => {
    const fn = snapshot.functions.find((f) => f.name === 'decimals')!;
    expect(fn).toBeDefined();
    expect(fn.visibility).toBe('public');
  });

  it('extracts mint function', () => {
    const names = snapshot.functions.map((f) => f.name);
    expect(names).toContain('mint');
  });

  it('mint is external', () => {
    const fn = snapshot.functions.find((f) => f.name === 'mint')!;
    expect(fn).toBeDefined();
    expect(fn.visibility).toBe('external');
  });

  it('computes a non-empty contentHash', () => {
    expect(snapshot.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
