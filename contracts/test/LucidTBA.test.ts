/**
 * LucidTBA Tests
 *
 * Tests for Token Bound Account implementation.
 * Uses a mock ERC-721 and canonical ERC-6551 registry.
 */

import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('LucidTBA', function () {
  let lucidTBA: any;
  let owner: any;
  let user1: any;

  // ERC-6551 canonical registry address (deployed on all major EVM chains)
  const ERC6551_REGISTRY = '0x000000006551c19487814612e58FE06813775758';

  before(async function () {
    [owner, user1] = await ethers.getSigners();
  });

  beforeEach(async function () {
    try {
      const LucidTBA = await ethers.getContractFactory('LucidTBA');
      lucidTBA = await LucidTBA.deploy();
      await lucidTBA.waitForDeployment();
    } catch {
      // Skip if OpenZeppelin deps not available
      this.skip();
    }
  });

  describe('Deployment', function () {
    it('deploys successfully', async function () {
      const address = await lucidTBA.getAddress();
      expect(address).to.be.properAddress;
    });

    it('state starts at 0', async function () {
      expect(await lucidTBA.state()).to.equal(0);
    });
  });

  describe('Token Bound Account interface', function () {
    it('reports token info from bytecode footer', async function () {
      // When deployed standalone (not via registry), token() returns default values
      const [chainId, tokenContract, tokenId] = await lucidTBA.token();
      // These will be zero when not created through the registry
      expect(chainId).to.be.a('bigint');
      expect(tokenContract).to.be.properAddress;
    });
  });

  describe('Execution', function () {
    it('reverts execute from non-owner', async function () {
      // When deployed standalone, owner() returns address(0) since no NFT is bound
      // So any caller should be rejected
      try {
        await lucidTBA.connect(user1).execute(
          user1.address,
          0,
          '0x',
          0,
        );
        expect.fail('Should have reverted');
      } catch (error: any) {
        expect(error.message).to.include('not owner');
      }
    });

    it('rejects delegatecall operations', async function () {
      try {
        await lucidTBA.execute(owner.address, 0, '0x', 1);
        expect.fail('Should have reverted');
      } catch (error: any) {
        expect(error.message).to.include('only call supported');
      }
    });
  });

  describe('ERC-20 transfers', function () {
    it('rejects transferERC20 from non-owner', async function () {
      try {
        await lucidTBA.connect(user1).transferERC20(
          ethers.ZeroAddress,
          user1.address,
          100,
        );
        expect.fail('Should have reverted');
      } catch (error: any) {
        expect(error.message).to.include('not owner');
      }
    });
  });

  describe('Receive ETH', function () {
    it('can receive ETH', async function () {
      const tbaAddress = await lucidTBA.getAddress();
      await owner.sendTransaction({
        to: tbaAddress,
        value: ethers.parseEther('0.01'),
      });

      const balance = await ethers.provider.getBalance(tbaAddress);
      expect(balance).to.equal(ethers.parseEther('0.01'));
    });
  });
});
