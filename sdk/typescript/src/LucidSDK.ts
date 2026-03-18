/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseHttpRequest } from './core/BaseHttpRequest';
import type { OpenAPIConfig } from './core/OpenAPI';
import { FetchHttpRequest } from './core/FetchHttpRequest';
import { A2AService } from './services/A2AService';
import { AgentDeployService } from './services/AgentDeployService';
import { AgentLaunchService } from './services/AgentLaunchService';
import { AgentMirrorService } from './services/AgentMirrorService';
import { AgentRevenueService } from './services/AgentRevenueService';
import { AgentsService } from './services/AgentsService';
import { AgentWalletService } from './services/AgentWalletService';
import { AnchoringService } from './services/AnchoringService';
import { ComputeService } from './services/ComputeService';
import { CrossChainService } from './services/CrossChainService';
import { DisputesService } from './services/DisputesService';
import { EpochsService } from './services/EpochsService';
import { EscrowService } from './services/EscrowService';
import { HealthService } from './services/HealthService';
import { IdentityService } from './services/IdentityService';
import { MatchService } from './services/MatchService';
import { MemoryService } from './services/MemoryService';
import { ModulesService } from './services/ModulesService';
import { PassportsService } from './services/PassportsService';
import { PaymasterService } from './services/PaymasterService';
import { PaymentsService } from './services/PaymentsService';
import { PayoutsService } from './services/PayoutsService';
import { ReceiptsService } from './services/ReceiptsService';
import { ReputationService } from './services/ReputationService';
import { RunService } from './services/RunService';
import { SharesService } from './services/SharesService';
import { TbaService } from './services/TbaService';
import { WebhooksService } from './services/WebhooksService';
import { ZkMlService } from './services/ZkMlService';
type HttpRequestConstructor = new (config: OpenAPIConfig) => BaseHttpRequest;
export class LucidSDK {
    public readonly a2A: A2AService;
    public readonly agentDeploy: AgentDeployService;
    public readonly agentLaunch: AgentLaunchService;
    public readonly agentMirror: AgentMirrorService;
    public readonly agentRevenue: AgentRevenueService;
    public readonly agents: AgentsService;
    public readonly agentWallet: AgentWalletService;
    public readonly anchoring: AnchoringService;
    public readonly compute: ComputeService;
    public readonly crossChain: CrossChainService;
    public readonly disputes: DisputesService;
    public readonly epochs: EpochsService;
    public readonly escrow: EscrowService;
    public readonly health: HealthService;
    public readonly identity: IdentityService;
    public readonly match: MatchService;
    public readonly memory: MemoryService;
    public readonly modules: ModulesService;
    public readonly passports: PassportsService;
    public readonly paymaster: PaymasterService;
    public readonly payments: PaymentsService;
    public readonly payouts: PayoutsService;
    public readonly receipts: ReceiptsService;
    public readonly reputation: ReputationService;
    public readonly run: RunService;
    public readonly shares: SharesService;
    public readonly tba: TbaService;
    public readonly webhooks: WebhooksService;
    public readonly zkMl: ZkMlService;
    public readonly request: BaseHttpRequest;
    constructor(config?: Partial<OpenAPIConfig>, HttpRequest: HttpRequestConstructor = FetchHttpRequest) {
        this.request = new HttpRequest({
            BASE: config?.BASE ?? 'http://localhost:3001',
            VERSION: config?.VERSION ?? '1.0.0',
            WITH_CREDENTIALS: config?.WITH_CREDENTIALS ?? false,
            CREDENTIALS: config?.CREDENTIALS ?? 'include',
            TOKEN: config?.TOKEN,
            USERNAME: config?.USERNAME,
            PASSWORD: config?.PASSWORD,
            HEADERS: config?.HEADERS,
            ENCODE_PATH: config?.ENCODE_PATH,
        });
        this.a2A = new A2AService(this.request);
        this.agentDeploy = new AgentDeployService(this.request);
        this.agentLaunch = new AgentLaunchService(this.request);
        this.agentMirror = new AgentMirrorService(this.request);
        this.agentRevenue = new AgentRevenueService(this.request);
        this.agents = new AgentsService(this.request);
        this.agentWallet = new AgentWalletService(this.request);
        this.anchoring = new AnchoringService(this.request);
        this.compute = new ComputeService(this.request);
        this.crossChain = new CrossChainService(this.request);
        this.disputes = new DisputesService(this.request);
        this.epochs = new EpochsService(this.request);
        this.escrow = new EscrowService(this.request);
        this.health = new HealthService(this.request);
        this.identity = new IdentityService(this.request);
        this.match = new MatchService(this.request);
        this.memory = new MemoryService(this.request);
        this.modules = new ModulesService(this.request);
        this.passports = new PassportsService(this.request);
        this.paymaster = new PaymasterService(this.request);
        this.payments = new PaymentsService(this.request);
        this.payouts = new PayoutsService(this.request);
        this.receipts = new ReceiptsService(this.request);
        this.reputation = new ReputationService(this.request);
        this.run = new RunService(this.request);
        this.shares = new SharesService(this.request);
        this.tba = new TbaService(this.request);
        this.webhooks = new WebhooksService(this.request);
        this.zkMl = new ZkMlService(this.request);
    }
}

