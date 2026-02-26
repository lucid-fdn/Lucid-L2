/**
 * LucidToken Tests
 *
 * Tests the ERC-20 $LUCID token contract: metadata, minting, burning, access control.
 */

import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('LucidToken', function () {
  let lucidToken: any;
  let owner: any;
  let user1: any;
  let user2: any;

  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();

    const LucidToken = await ethers.getContractFactory('LucidToken');
    lucidToken = await LucidToken.deploy('Lucid', 'LUCID', owner.address);
    await lucidToken.waitForDeployment();
  });

  describe('Token metadata', function () {
    it('has correct name', async function () {
      expect(await lucidToken.name()).to.equal('Lucid');
    });

    it('has correct symbol', async function () {
      expect(await lucidToken.symbol()).to.equal('LUCID');
    });

    it('returns 9 decimals (matching Solana SPL)', async function () {
      expect(await lucidToken.decimals()).to.equal(9);
    });
  });

  describe('Ownership', function () {
    it('sets deployer as owner', async function () {
      expect(await lucidToken.owner()).to.equal(owner.address);
    });
  });

  describe('ERC-20 operations', function () {
    it('starts with zero supply', async function () {
      expect(await lucidToken.totalSupply()).to.equal(0);
    });

    it('owner balance is zero initially', async function () {
      expect(await lucidToken.balanceOf(owner.address)).to.equal(0);
    });
  });

  describe('Minting', function () {
    it('owner can mint tokens', async function () {
      const amount = ethers.parseUnits('1000', 9);
      await lucidToken.mint(user1.address, amount);
      expect(await lucidToken.balanceOf(user1.address)).to.equal(amount);
      expect(await lucidToken.totalSupply()).to.equal(amount);
    });

    it('non-owner cannot mint', async function () {
      const amount = ethers.parseUnits('1000', 9);
      await expect(
        lucidToken.connect(user1).mint(user1.address, amount)
      ).to.be.reverted;
    });
  });

  describe('Burning', function () {
    it('holder can burn own tokens', async function () {
      const amount = ethers.parseUnits('1000', 9);
      await lucidToken.mint(user1.address, amount);

      const burnAmount = ethers.parseUnits('300', 9);
      await lucidToken.connect(user1).burn(burnAmount);

      expect(await lucidToken.balanceOf(user1.address)).to.equal(amount - burnAmount);
    });

    it('holder can approve and burnFrom', async function () {
      const amount = ethers.parseUnits('1000', 9);
      await lucidToken.mint(user1.address, amount);

      await lucidToken.connect(user1).approve(owner.address, amount);
      await lucidToken.burnFrom(user1.address, amount);

      expect(await lucidToken.balanceOf(user1.address)).to.equal(0);
    });
  });

  describe('Transfers', function () {
    it('can transfer between accounts', async function () {
      const amount = ethers.parseUnits('1000', 9);
      await lucidToken.mint(user1.address, amount);

      const transferAmount = ethers.parseUnits('500', 9);
      await lucidToken.connect(user1).transfer(user2.address, transferAmount);

      expect(await lucidToken.balanceOf(user1.address)).to.equal(amount - transferAmount);
      expect(await lucidToken.balanceOf(user2.address)).to.equal(transferAmount);
    });
  });
});
