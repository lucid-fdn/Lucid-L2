import { renderProgramDoc, renderContractDoc } from '../../src/render/programDoc';
import type { ProgramSnapshot, ContractSnapshot } from '../../src/extract/programExtractor';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROGRAM_SNAPSHOT: ProgramSnapshot = {
  programName: 'thought_epoch',
  sourcePath: '/programs/thought-epoch/src/lib.rs',
  instructions: [
    { name: 'init_epoch', params: ['root'] },
    { name: 'commit_epoch', params: ['root'] },
    { name: 'commit_epoch_v2', params: ['root', 'epoch_id', 'leaf_count', 'timestamp', 'mmr_size'] },
  ],
  accountStructs: [
    { name: 'InitEpoch', fields: ['authority', 'epoch_record', 'system_program'] },
    { name: 'UpdateEpoch', fields: ['authority', 'epoch_record'] },
  ],
  sourceContent: '// Anchor program source',
  contentHash: 'abc123def456',
};

const CONTRACT_SNAPSHOT: ContractSnapshot = {
  contractName: 'LucidPassportRegistry',
  sourcePath: '/contracts/src/LucidPassportRegistry.sol',
  functions: [
    { name: 'setSyncer', visibility: 'external', params: 'address syncer, bool authorized' },
    { name: 'anchorPassport', visibility: 'external', params: 'bytes32 passportId, bytes32 contentHash, address passportOwner' },
    { name: 'verifyAnchor', visibility: 'external', params: 'bytes32 passportId, bytes32 contentHash' },
    { name: 'payForAccess', visibility: 'external', params: 'bytes32 passportId, uint64 duration' },
  ],
  events: [
    { name: 'PassportAnchored', params: 'bytes32 indexed passportId, bytes32 contentHash, address indexed owner' },
    { name: 'AccessPurchased', params: 'bytes32 indexed passportId, address indexed payer, uint64 expiresAt, uint256 paid' },
  ],
  sourceContent: '// Solidity contract source',
  contentHash: 'deadbeef1234',
};

// ---------------------------------------------------------------------------
// renderProgramDoc
// ---------------------------------------------------------------------------

describe('renderProgramDoc', () => {
  // --- Header ---

  it('includes a generation comment with the commit SHA', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'abc1234', null);
    expect(result).toContain('<!-- generated: commit abc1234,');
  });

  it('includes an ISO timestamp in the generation comment', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'deadbeef', null);
    expect(result).toMatch(/<!-- generated: commit \S+, \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('renders program name in the title with "— Solana Program" suffix', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('# thought_epoch — Solana Program');
  });

  it('generation comment appears before the title', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result.indexOf('<!-- generated:')).toBeLessThan(
      result.indexOf('# thought_epoch'),
    );
  });

  // --- AI sections ---

  it('renders "AI enrichment pending" stubs when aiContent is null', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('AI enrichment pending');
  });

  it('renders provided aiContent when non-null', () => {
    const ai = '## Purpose\nStores MMR roots.\n\n## Architecture\nPDA-based.\n\n## Patterns & Gotchas\nAuthority must match.';
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', ai);
    expect(result).toContain('Stores MMR roots.');
    expect(result).toContain('PDA-based.');
    expect(result).not.toContain('AI enrichment pending');
  });

  // --- Instructions table ---

  it('renders ## Instructions heading', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('## Instructions');
  });

  it('renders instructions table header', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('| Instruction | Parameters |');
  });

  it('renders each instruction name as backtick code', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('`init_epoch`');
    expect(result).toContain('`commit_epoch`');
    expect(result).toContain('`commit_epoch_v2`');
  });

  it('renders instruction params as comma-separated backtick tokens', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('`root`');
  });

  it('renders multi-param instruction with all params', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('`epoch_id`');
    expect(result).toContain('`leaf_count`');
    expect(result).toContain('`mmr_size`');
  });

  it('renders — for instructions with no params', () => {
    const noParamSnapshot: ProgramSnapshot = {
      ...PROGRAM_SNAPSHOT,
      instructions: [{ name: 'noop', params: [] }],
    };
    const result = renderProgramDoc(noParamSnapshot, 'sha', null);
    expect(result).toContain('`noop`');
    expect(result).toContain('| `noop` | — |');
  });

  it('omits ## Instructions when instructions array is empty', () => {
    const empty: ProgramSnapshot = { ...PROGRAM_SNAPSHOT, instructions: [] };
    const result = renderProgramDoc(empty, 'sha', null);
    expect(result).not.toContain('## Instructions');
  });

  // --- Account structs table ---

  it('renders ## Account Structs heading', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('## Account Structs');
  });

  it('renders account structs table header', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('| Struct | Fields |');
  });

  it('renders each struct name as backtick code', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('`InitEpoch`');
    expect(result).toContain('`UpdateEpoch`');
  });

  it('renders struct fields as comma-separated backtick tokens', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    expect(result).toContain('`authority`');
    expect(result).toContain('`epoch_record`');
  });

  it('omits ## Account Structs when accountStructs array is empty', () => {
    const empty: ProgramSnapshot = { ...PROGRAM_SNAPSHOT, accountStructs: [] };
    const result = renderProgramDoc(empty, 'sha', null);
    expect(result).not.toContain('## Account Structs');
  });

  // --- Section order ---

  it('renders AI sections before Instructions table', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    const aiIdx = result.indexOf('AI enrichment pending');
    const ixIdx = result.indexOf('## Instructions');
    expect(aiIdx).toBeLessThan(ixIdx);
  });

  it('renders Instructions before Account Structs', () => {
    const result = renderProgramDoc(PROGRAM_SNAPSHOT, 'sha', null);
    const ixIdx = result.indexOf('## Instructions');
    const structIdx = result.indexOf('## Account Structs');
    expect(ixIdx).toBeLessThan(structIdx);
  });
});

// ---------------------------------------------------------------------------
// renderContractDoc
// ---------------------------------------------------------------------------

describe('renderContractDoc', () => {
  // --- Header ---

  it('includes a generation comment with the commit SHA', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'feed1234', null);
    expect(result).toContain('<!-- generated: commit feed1234,');
  });

  it('includes an ISO timestamp in the generation comment', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toMatch(/<!-- generated: commit \S+, \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('renders contract name in the title with "— EVM Contract" suffix', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('# LucidPassportRegistry — EVM Contract');
  });

  // --- AI sections ---

  it('renders "AI enrichment pending" stubs when aiContent is null', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('AI enrichment pending');
  });

  it('renders provided aiContent when non-null', () => {
    const ai = '## Purpose\nPassport anchor + payment gate.\n\n## Architecture\nOwnable + ReentrancyGuard.\n\n## Patterns & Gotchas\nOnly syncer can anchor.';
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', ai);
    expect(result).toContain('Passport anchor + payment gate.');
    expect(result).not.toContain('AI enrichment pending');
  });

  // --- Functions table ---

  it('renders ## Functions heading', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('## Functions');
  });

  it('renders functions table header', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('| Function | Visibility | Parameters |');
  });

  it('renders each function name as backtick code', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('`setSyncer`');
    expect(result).toContain('`anchorPassport`');
    expect(result).toContain('`verifyAnchor`');
    expect(result).toContain('`payForAccess`');
  });

  it('renders function visibility correctly', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    // All fixtures use 'external'
    expect(result).toContain('external');
  });

  it('renders function params in the row', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('address syncer, bool authorized');
  });

  it('renders — for functions with no params', () => {
    const noParamSnapshot: ContractSnapshot = {
      ...CONTRACT_SNAPSHOT,
      functions: [{ name: 'noopFn', visibility: 'external', params: '' }],
    };
    const result = renderContractDoc(noParamSnapshot, 'sha', null);
    expect(result).toContain('| `noopFn` | external | — |');
  });

  it('omits ## Functions when functions array is empty', () => {
    const empty: ContractSnapshot = { ...CONTRACT_SNAPSHOT, functions: [] };
    const result = renderContractDoc(empty, 'sha', null);
    expect(result).not.toContain('## Functions');
  });

  // --- Events table ---

  it('renders ## Events heading', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('## Events');
  });

  it('renders events table header', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('| Event | Parameters |');
  });

  it('renders each event name as backtick code', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('`PassportAnchored`');
    expect(result).toContain('`AccessPurchased`');
  });

  it('renders event params in the row', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    expect(result).toContain('bytes32 indexed passportId');
  });

  it('omits ## Events when events array is empty', () => {
    const empty: ContractSnapshot = { ...CONTRACT_SNAPSHOT, events: [] };
    const result = renderContractDoc(empty, 'sha', null);
    expect(result).not.toContain('## Events');
  });

  // --- Section order ---

  it('renders AI sections before Functions table', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    const aiIdx = result.indexOf('AI enrichment pending');
    const fnIdx = result.indexOf('## Functions');
    expect(aiIdx).toBeLessThan(fnIdx);
  });

  it('renders Functions before Events', () => {
    const result = renderContractDoc(CONTRACT_SNAPSHOT, 'sha', null);
    const fnIdx = result.indexOf('## Functions');
    const evIdx = result.indexOf('## Events');
    expect(fnIdx).toBeLessThan(evIdx);
  });

  // --- Empty snapshot ---

  it('still renders header when all sections are empty', () => {
    const empty: ContractSnapshot = { ...CONTRACT_SNAPSHOT, functions: [], events: [] };
    const result = renderContractDoc(empty, 'fff0000', null);
    expect(result).toContain('<!-- generated: commit fff0000,');
    expect(result).toContain('# LucidPassportRegistry — EVM Contract');
  });
});
