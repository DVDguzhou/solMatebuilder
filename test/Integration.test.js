const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("合约交互集成测试", function () {
  let senate;
  let submissionManager;
  let community;
  let token;
  let owner;
  let senator1;
  let senator2;
  let member1;
  let member2;
  
  const CATEGORY_MUSIC = 1; // 音乐类别
  const CATEGORY_ART = 2;   // 艺术类别
  const communityId = 0;
  const stakeAmount = ethers.parseEther("100");
  
  beforeEach(async function () {
    [owner, senator1, senator2, member1, member2] = await ethers.getSigners();
    
    // 部署测试代币
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy("Test Token", "TST", ethers.parseEther("10000"));
    
    // 部署 Senate 合约
    const Senate = await ethers.getContractFactory("Senate");
    senate = await Senate.deploy();
    
    // 部署 SubmissionManager 合约
    const SubmissionManager = await ethers.getContractFactory("SubmissionManager");
    submissionManager = await SubmissionManager.deploy(await senate.getAddress());
    
    // 部署 Community 合约
    const Community = await ethers.getContractFactory("GoalOrientedCommunity");
    community = await Community.deploy(await senate.getAddress(), await token.getAddress());
    
    // 为测试账户分配代币
    await token.transfer(member1.address, stakeAmount);
    await token.transfer(member2.address, stakeAmount);
    
    // 添加参议员
    await senate.addSenator(senator1.address, CATEGORY_MUSIC);
    await senate.addSenator(senator2.address, CATEGORY_ART);
    
    // 设置区块时间
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const currentTimestamp = blockBefore.timestamp;
    
    // 创建社区，确保开始时间在未来
    const startTime = currentTimestamp + 3600; // 1小时后开始
    const endTime = startTime + 3600; // 持续1小时
    const memberDeposit = ethers.parseEther("1");
    const rewardPerMember = ethers.parseEther("2");
    const maxMembers = 10;
    
    await community.connect(owner).createCommunity(
      "音乐社区",
      "这是一个音乐社区",
      "创作一首歌曲",
      startTime,
      endTime,
      memberDeposit,
      rewardPerMember,
      maxMembers,
      CATEGORY_MUSIC, // 音乐类别
      { value: rewardPerMember * BigInt(maxMembers) }
    );
    
    // 让时间前进，使社区开始
    await ethers.provider.send("evm_increaseTime", [3700]); // 增加时间超过开始时间
    await ethers.provider.send("evm_mine");
  });
  
  describe("Senate 和 SubmissionManager 交互测试", function () {
    it("参议员应该能够对相同类别的提交内容进行评分", async function () {
      // 成员提交内容
      const contentUrl = "https://example.com/music";
      await submissionManager.connect(member1).submitContent(communityId, contentUrl, CATEGORY_MUSIC);
      
      // 同类别参议员评分
      await expect(
        submissionManager.connect(senator1).submitScore(communityId, member1.address, 85)
      ).to.emit(submissionManager, "ScoreSubmitted")
        .withArgs(communityId, member1.address, senator1.address, 85);
      
      // 验证评分记录
      expect(await submissionManager.senatorScores(communityId, member1.address, senator1.address)).to.equal(85);
    });
    
    it("参议员不能对不同类别的提交内容进行评分", async function () {
      // 成员提交内容
      const contentUrl = "https://example.com/music";
      await submissionManager.connect(member1).submitContent(communityId, contentUrl, CATEGORY_MUSIC);
      
      // 不同类别参议员评分
      await expect(
        submissionManager.connect(senator2).submitScore(communityId, member1.address, 85)
      ).to.be.revertedWith("Not authorized senator");
    });
    
    it("非参议员不能提交评分", async function () {
      // 成员提交内容
      const contentUrl = "https://example.com/music";
      await submissionManager.connect(member1).submitContent(communityId, contentUrl, CATEGORY_MUSIC);
      
      // 非参议员评分
      await expect(
        submissionManager.connect(member2).submitScore(communityId, member1.address, 85)
      ).to.be.revertedWith("Not authorized senator");
    });
    
    it("所有参议员评分后应该计算最终分数", async function () {
      // 添加另一个音乐类别参议员
      await senate.addSenator(member2.address, CATEGORY_MUSIC);
      
      // 成员提交内容
      const contentUrl = "https://example.com/music";
      await submissionManager.connect(member1).submitContent(communityId, contentUrl, CATEGORY_MUSIC);
      
      // 第一个参议员评分
      await submissionManager.connect(senator1).submitScore(communityId, member1.address, 80);
      
      // 第二个参议员评分
      await submissionManager.connect(member2).submitScore(communityId, member1.address, 90);
      
      // 验证最终分数
      const [finalScore, isScored] = await submissionManager.getFinalScore(communityId, member1.address);
      expect(isScored).to.be.true;
      expect(finalScore).to.equal(85); // (80 + 90) / 2 = 85
    });
  });
  
  describe("Senate 和 Community 交互测试", function () {
    beforeEach(async function () {
      // 成员加入社区
      await token.connect(member1).approve(await community.getAddress(), stakeAmount);
      await community.connect(member1).joinCommunity(communityId, {
        value: ethers.parseEther("1") // 押金
      });
      
      // 成员提交完成证明
      await community.connect(member1).submitCompletion(communityId, "https://example.com/music-submission");
    });
    
    it("参议员应该能够对相同类别的社区提交进行抽查评分", async function () {
      // 先由 reviewer 进行评审
      const reviewerAddress = await community.reviewers(communityId, 0);
      await community.connect(await ethers.getSigner(reviewerAddress)).reviewerApprove(communityId, member1.address, true);
      
      // 参议员抽查评分
      await expect(
        community.connect(senator1).senateAuditScore(communityId, member1.address, 85, "Good work")
      ).to.emit(community, "ScoreSubmitted")
        .withArgs(communityId, member1.address, senator1.address, 85);
      
      // 验证评分记录
      const scores = await community.getScores(communityId, member1.address);
      expect(scores.length).to.equal(1);
      expect(scores[0].senator).to.equal(senator1.address);
      expect(scores[0].score).to.equal(85);
    });
    
    it("不同类别的参议员不能对社区提交进行抽查评分", async function () {
      // 先由 reviewer 进行评审
      const reviewerAddress = await community.reviewers(communityId, 0);
      await community.connect(await ethers.getSigner(reviewerAddress)).reviewerApprove(communityId, member1.address, true);
      
      // 不同类别参议员抽查评分
      await expect(
        community.connect(senator2).senateAuditScore(communityId, member1.address, 85, "Good work")
      ).to.be.revertedWith("Not authorized senator");
    });
  });
  
  describe("SubmissionManager 和 Community 交互测试", function () {
    beforeEach(async function () {
      // 成员加入社区
      await token.connect(member1).approve(await community.getAddress(), stakeAmount);
      await community.connect(member1).joinCommunity(communityId, {
        value: ethers.parseEther("1") // 押金
      });
    });
    
    it("成员应该能够在 SubmissionManager 和 Community 中提交内容", async function () {
      // 在 SubmissionManager 中提交内容
      const contentUrl1 = "https://example.com/music-submission-manager";
      await expect(
        submissionManager.connect(member1).submitContent(communityId, contentUrl1, CATEGORY_MUSIC)
      ).to.emit(submissionManager, "SubmissionCreated")
        .withArgs(communityId, member1.address, contentUrl1);
      
      // 在 Community 中提交完成证明
      const contentUrl2 = "https://example.com/music-community";
      await expect(
        community.connect(member1).submitCompletion(communityId, contentUrl2)
      ).to.emit(community, "SubmissionUploaded")
        .withArgs(communityId, member1.address, contentUrl2);
      
      // 验证 SubmissionManager 中的提交记录
      const submission = await submissionManager.submissions(communityId, member1.address);
      expect(submission.contentUrl).to.equal(contentUrl1);
      expect(submission.category).to.equal(CATEGORY_MUSIC);
      
      // 验证 Community 中的提交记录
      const member = await community.members(communityId, member1.address);
      expect(member.submissionUrl).to.equal(contentUrl2);
    });
    
    it("成员在 SubmissionManager 中获得评分后应该能够在 Community 中领取奖励", async function () {
      // 在 SubmissionManager 中提交内容
      await submissionManager.connect(member1).submitContent(communityId, "https://example.com/music", CATEGORY_MUSIC);
      
      // 在 Community 中提交完成证明
      await community.connect(member1).submitCompletion(communityId, "https://example.com/music-community");
      
      // reviewer 批准提交
      const reviewerAddress = await community.reviewers(communityId, 0);
      await community.connect(await ethers.getSigner(reviewerAddress)).reviewerApprove(communityId, member1.address, true);
      
      // 参议员在 SubmissionManager 中评分
      await submissionManager.connect(senator1).submitScore(communityId, member1.address, 85);
      
      // 验证成员是否可以领取奖励
      const balanceBefore = await ethers.provider.getBalance(member1.address);
      
      await community.connect(member1).claimReward(communityId);
      
      const balanceAfter = await ethers.provider.getBalance(member1.address);
      // 考虑到gas费用，余额应该增加接近3 ETH（2 ETH奖励 + 1 ETH押金）
      expect(balanceAfter - balanceBefore).to.be.gt(ethers.parseEther("2.9"));
    });
  });
});
