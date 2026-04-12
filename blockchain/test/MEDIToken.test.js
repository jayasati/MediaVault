const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MEDIToken", function () {
  let token;
  let owner, user1, user2, platform;

  const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10M tokens

  beforeEach(async function () {
    [owner, user1, user2, platform] = await ethers.getSigners();
    const MEDIToken = await ethers.getContractFactory("MEDIToken");
    token = await MEDIToken.deploy();
  });

  describe("Deployment", function () {
    it("should set correct name and symbol", async function () {
      expect(await token.name()).to.equal("MediVault Token");
      expect(await token.symbol()).to.equal("MEDI");
    });

    it("should mint initial supply to deployer", async function () {
      expect(await token.balanceOf(owner.address)).to.equal(INITIAL_SUPPLY);
    });

    it("should set deployer as owner", async function () {
      expect(await token.owner()).to.equal(owner.address);
    });
  });

  describe("Minting", function () {
    it("should allow owner to mint tokens", async function () {
      const amount = ethers.parseEther("1000");
      await token.mint(user1.address, amount);
      expect(await token.balanceOf(user1.address)).to.equal(amount);
    });

    it("should emit TokensMinted event", async function () {
      const amount = ethers.parseEther("1000");
      await expect(token.mint(user1.address, amount))
        .to.emit(token, "TokensMinted")
        .withArgs(user1.address, amount);
    });

    it("should reject minting from non-owner", async function () {
      const amount = ethers.parseEther("1000");
      await expect(
        token.connect(user1).mint(user1.address, amount)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("Burning", function () {
    it("should allow users to burn their own tokens", async function () {
      const mintAmount = ethers.parseEther("500");
      const burnAmount = ethers.parseEther("200");
      await token.mint(user1.address, mintAmount);
      await token.connect(user1).burn(burnAmount);
      expect(await token.balanceOf(user1.address)).to.equal(
        mintAmount - burnAmount
      );
    });

    it("should emit TokensBurned event", async function () {
      const amount = ethers.parseEther("100");
      await token.mint(user1.address, amount);
      await expect(token.connect(user1).burn(amount))
        .to.emit(token, "TokensBurned")
        .withArgs(user1.address, amount);
    });

    it("should revert when burning more than balance", async function () {
      const amount = ethers.parseEther("100");
      await expect(
        token.connect(user1).burn(amount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  describe("Platform Approval", function () {
    it("should allow owner to approve a platform", async function () {
      await token.approvePlatform(platform.address);
      expect(await token.platformAddresses(platform.address)).to.be.true;
    });

    it("should emit PlatformApproved event", async function () {
      await expect(token.approvePlatform(platform.address))
        .to.emit(token, "PlatformApproved")
        .withArgs(platform.address);
    });

    it("should reject platform approval from non-owner", async function () {
      await expect(
        token.connect(user1).approvePlatform(platform.address)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("Transfers", function () {
    const amount = ethers.parseEther("1000");

    beforeEach(async function () {
      await token.mint(user1.address, amount);
    });

    it("should allow normal transfers", async function () {
      await token.connect(user1).transfer(user2.address, amount);
      expect(await token.balanceOf(user2.address)).to.equal(amount);
      expect(await token.balanceOf(user1.address)).to.equal(0);
    });

    it("should allow approved platform to transferFrom without allowance", async function () {
      await token.approvePlatform(platform.address);
      await token
        .connect(platform)
        .transferFrom(user1.address, user2.address, amount);
      expect(await token.balanceOf(user2.address)).to.equal(amount);
    });

    it("should reject transferFrom from non-platform without allowance", async function () {
      await expect(
        token
          .connect(user2)
          .transferFrom(user1.address, user2.address, amount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("should allow transferFrom with standard allowance", async function () {
      await token.connect(user1).approve(user2.address, amount);
      await token
        .connect(user2)
        .transferFrom(user1.address, user2.address, amount);
      expect(await token.balanceOf(user2.address)).to.equal(amount);
    });
  });
});
