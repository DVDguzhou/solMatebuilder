const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GoalOrientedCommunity 基本功能测试", function () {
  let community;
  let senate;
  let token;
  let owner;
  let creator;
  
  beforeEach(async function () {
    [owner, creator] = await ethers.getSigners();
    
    // 部署测试代币
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy("Test Token", "TST", ethers.parseEther("10000"));
    
    // 部署 Senate 合约
    const Senate = await ethers.getContractFactory("Senate");
    senate = await Senate.deploy();
    
    // 部署 GoalOrientedCommunity 合约
    const Community = await ethers.getContractFactory("GoalOrientedCommunity");
    community = await Community.deploy(await senate.getAddress(), await token.getAddress());
  });
  
  describe("创建社区", function () {
    it("应该正确创建社区", async function () {
      // 创建社区
      const now = Math.floor(Date.now() / 1000);
      const startTime = now + 3600; // 1小时后开始
      const endTime = startTime + 3600; // 持续1小时
      const memberDeposit = ethers.parseEther("1");
      const rewardPerMember = ethers.parseEther("2");
      const maxMembers = 10;
      
      await community.connect(creator).createCommunity(
        "测试社区",
        "这是一个测试社区",
        "完成一幅艺术作品",
        startTime,
        endTime,
        memberDeposit,
        rewardPerMember,
        maxMembers,
        1, // ART 类别
        { value: rewardPerMember * BigInt(maxMembers) }
      );
      
      const communityInfo = await community.communities(0);
      expect(communityInfo.name).to.equal("测试社区");
      expect(communityInfo.creator).to.equal(creator.address);
      expect(communityInfo.category).to.equal(1); // ART
      expect(communityInfo.startTime).to.equal(startTime);
      expect(communityInfo.endTime).to.equal(endTime);
      expect(communityInfo.memberDeposit).to.equal(memberDeposit);
      expect(communityInfo.rewardPerMember).to.equal(rewardPerMember);
      expect(communityInfo.maxMembers).to.equal(maxMembers);
      expect(communityInfo.isClosed).to.equal(false);
    });
    
    it("创建社区时应该提供足够的奖励池", async function () {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now + 3600;
      const endTime = startTime + 3600;
      const memberDeposit = ethers.parseEther("1");
      const rewardPerMember = ethers.parseEther("2");
      const maxMembers = 5;
      
      // 不足的奖励池
      await expect(
        community.connect(creator).createCommunity(
          "测试社区2",
          "这是另一个测试社区",
          "完成一幅艺术作品",
          startTime,
          endTime,
          memberDeposit,
          rewardPerMember,
          maxMembers,
          1,
          { value: ethers.parseEther("9") } // 不足的奖励池 (应该是 10 ETH)
        )
      ).to.be.revertedWith("Insufficient reward pool");
    });
    
    it("创建社区的开始时间必须在未来", async function () {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now - 100; // 过去的时间
      const endTime = now + 3600;
      const memberDeposit = ethers.parseEther("1");
      const rewardPerMember = ethers.parseEther("2");
      const maxMembers = 5;
      
      await expect(
        community.connect(creator).createCommunity(
          "测试社区3",
          "这是另一个测试社区",
          "完成一幅艺术作品",
          startTime,
          endTime,
          memberDeposit,
          rewardPerMember,
          maxMembers,
          1,
          { value: rewardPerMember * BigInt(maxMembers) }
        )
      ).to.be.revertedWith("Start time must be in future");
    });
    
    it("结束时间必须在开始时间之后", async function () {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now + 3600;
      const endTime = startTime - 100; // 结束时间在开始时间之前
      const memberDeposit = ethers.parseEther("1");
      const rewardPerMember = ethers.parseEther("2");
      const maxMembers = 5;
      
      await expect(
        community.connect(creator).createCommunity(
          "测试社区4",
          "这是另一个测试社区",
          "完成一幅艺术作品",
          startTime,
          endTime,
          memberDeposit,
          rewardPerMember,
          maxMembers,
          1,
          { value: rewardPerMember * BigInt(maxMembers) }
        )
      ).to.be.revertedWith("End time must be after start time");
    });
  });
  
  describe("社区管理", function () {
    let communityId;
    
    beforeEach(async function () {
      // 创建社区
      const now = Math.floor(Date.now() / 1000);
      const startTime = now + 3600;
      const endTime = startTime + 3600;
      const memberDeposit = ethers.parseEther("1");
      const rewardPerMember = ethers.parseEther("2");
      const maxMembers = 10;
      
      await community.connect(creator).createCommunity(
        "测试社区",
        "这是一个测试社区",
        "完成一幅艺术作品",
        startTime,
        endTime,
        memberDeposit,
        rewardPerMember,
        maxMembers,
        1,
        { value: rewardPerMember * BigInt(maxMembers) }
      );
      
      communityId = 0;
    });
    
    it("创建者应该能够关闭社区", async function () {
      await expect(
        community.connect(creator).closeCommunityByAuthor(communityId)
      ).to.emit(community, "CommunityClosed")
        .withArgs(communityId);
      
      const communityInfo = await community.communities(communityId);
      expect(communityInfo.isClosed).to.be.true;
    });
    
    it("非创建者不能关闭社区", async function () {
      await expect(
        community.connect(owner).closeCommunityByAuthor(communityId)
      ).to.be.revertedWith("Not creator");
    });
    
    it("应该能够获取社区成员数量", async function () {
      const memberCount = await community.getMemberCount(communityId);
      expect(memberCount).to.equal(0);
    });
  });
});
