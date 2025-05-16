const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GoalOrientedCommunity", function () {
  let community;
  let senate;
  let token;
  let owner;
  let creator;
  let member1;
  let member2;
  let reviewer;
  let senator;
  
  const STAKE_AMOUNT = ethers.parseEther("100");
  const communityId = 0;
  
  beforeEach(async function () {
    // 部署测试代币
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy("Test Token", "TST", ethers.parseEther("10000"));
    
    // 部署 Senate 合约
    const Senate = await ethers.getContractFactory("Senate");
    senate = await Senate.deploy();
    
    // 部署 GoalOrientedCommunity 合约
    const Community = await ethers.getContractFactory("GoalOrientedCommunity");
    community = await Community.deploy(await senate.getAddress(), await token.getAddress());
    
    [owner, creator, member1, member2, reviewer, senator] = await ethers.getSigners();
    
    // 设置参议员
    await senate.addSenator(senator.address, 1); // 假设类别为 ART
    
    // 为测试账户分配代币
    await token.transfer(member1.address, STAKE_AMOUNT);
    await token.transfer(member2.address, STAKE_AMOUNT);
    await token.transfer(reviewer.address, STAKE_AMOUNT);
    
    // 创建社区
    const now = Math.floor(Date.now() / 1000);
    const startTime = now + 100; // 开始时间在将来
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
  });
  
  describe("创建社区", function () {
    it("应该正确创建社区", async function () {
      const communityInfo = await community.communities(communityId);
      expect(communityInfo.name).to.equal("测试社区");
      expect(communityInfo.creator).to.equal(creator.address);
      expect(communityInfo.category).to.equal(1); // ART
    });
    
    it("创建社区时应该提供足够的奖励池", async function () {
      const now = Math.floor(Date.now() / 1000);
      const startTime = now + 100;
      const endTime = startTime + 3600;
      const memberDeposit = ethers.parseEther("1");
      const rewardPerMember = ethers.parseEther("2");
      const maxMembers = 5;
      
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
          { value: ethers.parseEther("9") } // 不足的奖励池
        )
      ).to.be.revertedWith("Insufficient reward pool");
    });
  });
  
  describe("加入社区", function () {
    it("应该能够加入社区", async function () {
      // 让时间前进使社区开始
      const communityInfo = await community.communities(communityId);
      await ethers.provider.send("evm_increaseTime", [Number(communityInfo.startTime) - Math.floor(Date.now() / 1000) + 10]);
      await ethers.provider.send("evm_mine");
      
      // 批准代币转账
      await token.connect(member1).approve(community.address, STAKE_AMOUNT);
      
      // 加入社区
      await community.connect(member1).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
      
      const memberInfo = await community.members(communityId, member1.address);
      expect(memberInfo.joinTime).to.be.gt(0);
      
      // 检查是否成为reviewer（第一个加入的应该是reviewer）
      expect(memberInfo.isReviewer).to.be.true;
    });
    
    it("不能用错误的押金金额加入社区", async function () {
      const communityInfo = await community.communities(communityId);
      const startTime = Number(communityInfo.startTime);
      
      await ethers.provider.send("evm_setNextBlockTimestamp", [startTime + 10]);
      await ethers.provider.send("evm_mine");
      
      await token.connect(member1).approve(community.address, STAKE_AMOUNT);
      
      await expect(
        community.connect(member1).joinCommunity(communityId, {
          value: ethers.parseEther("0.5") // 错误的押金金额
        })
      ).to.be.revertedWith("Incorrect deposit amount");
    });
  });
  
  describe("提交完成证明", function () {
    beforeEach(async function () {
      // 让时间前进使社区开始
      const communityInfo = await community.communities(communityId);
      await ethers.provider.send("evm_increaseTime", [Number(communityInfo.startTime) - Math.floor(Date.now() / 1000) + 10]);
      await ethers.provider.send("evm_mine");
      
      // 成员加入社区
      await token.connect(member1).approve(community.address, STAKE_AMOUNT);
      await community.connect(member1).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
    });
    
    it("成员应该能够提交完成证明", async function () {
      const submissionUrl = "https://example.com/submission";
      await expect(
        community.connect(member1).submitCompletion(communityId, submissionUrl)
      ).to.emit(community, "SubmissionUploaded")
        .withArgs(communityId, member1.address, submissionUrl);
      
      const memberInfo = await community.members(communityId, member1.address);
      expect(memberInfo.submissionUrl).to.equal(submissionUrl);
    });
    
    it("非成员不能提交完成证明", async function () {
      await expect(
        community.connect(member2).submitCompletion(communityId, "https://example.com/submission")
      ).to.be.revertedWith("Not a member");
    });
  });
  
  describe("Reviewer评审", function () {
    beforeEach(async function () {
      // 让时间前进使社区开始
      const communityInfo = await community.communities(communityId);
      await ethers.provider.send("evm_increaseTime", [Number(communityInfo.startTime) - Math.floor(Date.now() / 1000) + 10]);
      await ethers.provider.send("evm_mine");
      
      // 成员加入社区
      await token.connect(member1).approve(community.address, STAKE_AMOUNT);
      await community.connect(member1).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
      
      // reviewer加入社区
      await token.connect(reviewer).approve(community.address, STAKE_AMOUNT);
      await community.connect(reviewer).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
      
      // 成员提交完成证明
      await community.connect(member1).submitCompletion(communityId, "https://example.com/submission");
    });
    
    it("reviewer应该能够评审提交", async function () {
      await expect(
        community.connect(reviewer).reviewerApprove(communityId, member1.address, true)
      ).to.emit(community, "ReviewerApproval")
        .withArgs(communityId, reviewer.address, member1.address, true);
    });
    
    it("非reviewer不能评审提交", async function () {
      await expect(
        community.connect(member2).reviewerApprove(communityId, member1.address, true)
      ).to.be.revertedWith("Not a reviewer");
    });
  });
  
  describe("参议员抽查", function () {
    beforeEach(async function () {
      // 让时间前进使社区开始
      const communityInfo = await community.communities(communityId);
      await ethers.provider.send("evm_increaseTime", [Number(communityInfo.startTime) - Math.floor(Date.now() / 1000) + 10]);
      await ethers.provider.send("evm_mine");
      
      // 成员加入社区
      await token.connect(member1).approve(community.address, STAKE_AMOUNT);
      await community.connect(member1).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
      
      // reviewer加入社区
      await token.connect(reviewer).approve(community.address, STAKE_AMOUNT);
      await community.connect(reviewer).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
      
      // 成员提交完成证明
      await community.connect(member1).submitCompletion(communityId, "https://example.com/submission");
      
      // reviewer评审通过
      await community.connect(reviewer).reviewerApprove(communityId, member1.address, true);
    });
    
    it("参议员应该能够抽查评分", async function () {
      await expect(
        community.connect(senator).senateAuditScore(communityId, member1.address, 80, "Good work")
      ).to.emit(community, "ScoreSubmitted")
        .withArgs(communityId, member1.address, senator.address, 80);
    });
    
    it("非参议员不能抽查评分", async function () {
      await expect(
        community.connect(member2).senateAuditScore(communityId, member1.address, 80, "Good work")
      ).to.be.revertedWith("Not authorized senator");
    });
  });
  
  describe("领取奖励", function () {
    beforeEach(async function () {
      // 让时间前进使社区开始
      const communityInfo = await community.communities(communityId);
      await ethers.provider.send("evm_increaseTime", [Number(communityInfo.startTime) - Math.floor(Date.now() / 1000) + 10]);
      await ethers.provider.send("evm_mine");
      
      // 成员加入社区
      await token.connect(member1).approve(community.address, STAKE_AMOUNT);
      await community.connect(member1).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
      
      // reviewer加入社区
      await token.connect(reviewer).approve(community.address, STAKE_AMOUNT);
      await community.connect(reviewer).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
      
      // 成员提交完成证明
      await community.connect(member1).submitCompletion(communityId, "https://example.com/submission");
      
      // reviewer评审通过
      await community.connect(reviewer).reviewerApprove(communityId, member1.address, true);
    });
    
    it("完成任务的成员应该能够领取奖励", async function () {
      const balanceBefore = await ethers.provider.getBalance(member1.address);
      
      await expect(
        community.connect(member1).claimReward(communityId)
      ).to.emit(community, "RewardClaimed")
        .withArgs(communityId, member1.address, ethers.parseEther("2"));
      
      const balanceAfter = await ethers.provider.getBalance(member1.address);
      // 考虑到gas费用，余额应该增加接近3 ETH（2 ETH奖励 + 1 ETH押金）
      expect(balanceAfter - balanceBefore).to.be.gt(ethers.parseEther("2.9"));
    });
    
    it("未完成任务的成员不能领取奖励", async function () {
      // 成员2加入但未提交
      await token.connect(member2).approve(community.address, STAKE_AMOUNT);
      await community.connect(member2).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
      
      await expect(
        community.connect(member2).claimReward(communityId)
      ).to.be.revertedWith("Not reviewed yet");
    });
  });
  
  describe("关闭社区", function () {
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
        community.connect(member1).closeCommunityByAuthor(communityId)
      ).to.be.revertedWith("Not creator");
    });
  });
});
