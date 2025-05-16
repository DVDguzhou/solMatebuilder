const { expect } = require("chai");
const { ethers } = require("hardhat");

// 创建一个模拟的 Community 合约
const MockCommunityFactory = async () => {
  const MockCommunity = await ethers.getContractFactory("MockCommunity");
  return await MockCommunity.deploy();
};

describe("Lock 合约测试", function () {
  let lock;
  let token;
  let mockCommunity;
  let owner;
  let user1;
  let user2;
  const communityId = 0;
  const stakeAmount = ethers.parseEther("100");
  
  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // 部署测试代币
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy("Test Token", "TST", ethers.parseEther("10000"));
    
    // 部署模拟的 Community 合约
    mockCommunity = await MockCommunityFactory();
    
    // 部署 Lock 合约
    const Lock = await ethers.getContractFactory("Lock");
    lock = await Lock.deploy(await token.getAddress(), await mockCommunity.getAddress());
    
    // 为测试账户分配代币
    await token.transfer(user1.address, stakeAmount);
    await token.transfer(user2.address, stakeAmount);
    
    // 设置 user1 已完成任务
    await mockCommunity.setMemberStatus(communityId, user1.address, true, true);
  });
  
  describe("基础功能测试", function () {
    it("应该正确初始化合约", async function () {
      expect(await lock.stakingToken()).to.equal(await token.getAddress());
      expect(await lock.communityContract()).to.equal(await mockCommunity.getAddress());
    });
  });
  
  describe("质押功能测试", function () {
    it("用户应该能够质押代币", async function () {
      // 批准代币转账
      await token.connect(user1).approve(await lock.getAddress(), stakeAmount);
      
      // 质押代币
      await expect(lock.connect(user1).stake(communityId, stakeAmount))
        .to.emit(lock, "TokensStaked")
        .withArgs(user1.address, communityId, stakeAmount);
      
      // 检查质押记录
      const stakeInfo = await lock.stakes(user1.address);
      expect(stakeInfo.communityId).to.equal(communityId);
      expect(stakeInfo.amount).to.equal(stakeAmount);
      expect(stakeInfo.timestamp).to.be.gt(0);
      
      // 检查合约余额
      expect(await token.balanceOf(await lock.getAddress())).to.equal(stakeAmount);
    });
    
    it("质押金额必须大于0", async function () {
      await token.connect(user1).approve(await lock.getAddress(), stakeAmount);
      
      await expect(
        lock.connect(user1).stake(communityId, 0)
      ).to.be.revertedWith("Amount must be greater than 0");
    });
    
    it("用户不能重复质押", async function () {
      await token.connect(user1).approve(await lock.getAddress(), stakeAmount);
      await lock.connect(user1).stake(communityId, stakeAmount);
      
      await token.connect(user1).approve(await lock.getAddress(), stakeAmount);
      await expect(
        lock.connect(user1).stake(communityId, stakeAmount)
      ).to.be.revertedWith("Already staked");
    });
  });
  
  describe("取回质押功能测试", function () {
    beforeEach(async function () {
      // 用户1质押代币
      await token.connect(user1).approve(await lock.getAddress(), stakeAmount);
      await lock.connect(user1).stake(communityId, stakeAmount);
    });
    
    it("完成任务的用户应该能够取回质押的代币", async function () {
      const balanceBefore = await token.balanceOf(user1.address);
      
      // 取回质押
      await expect(lock.connect(user1).unstake())
        .to.emit(lock, "TokensUnstaked")
        .withArgs(user1.address, communityId, stakeAmount);
      
      // 检查质押记录已被删除
      const stakeInfo = await lock.stakes(user1.address);
      expect(stakeInfo.amount).to.equal(0);
      
      // 检查用户余额
      const balanceAfter = await token.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(stakeAmount);
    });
    
    it("未质押的用户不能取回代币", async function () {
      await expect(
        lock.connect(user2).unstake()
      ).to.be.revertedWith("No stake found");
    });
    
    it("未完成任务的用户不能取回代币", async function () {
      // 设置成员状态为未完成
      await mockCommunity.setMemberStatus(communityId, user1.address, true, false); // isScored=true, isApproved=false
      
      await expect(
        lock.connect(user1).unstake()
      ).to.be.revertedWith("Task not completed");
    });
  });
});
