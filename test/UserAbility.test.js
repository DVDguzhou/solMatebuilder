const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("用户能力值合约测试", function () {
  let userAbility;
  let community;
  let senate;
  let token;
  let owner;
  let user1;
  let user2;
  
  // 类别常量
  const CATEGORY_MUSIC = 1;    // 音乐
  const CATEGORY_ART = 2;      // 艺术
  const CATEGORY_SPORTS = 3;   // 体育
  const CATEGORY_EDUCATION = 4; // 教育
  
  beforeEach(async function () {
    [owner, user1, user2] = await ethers.getSigners();
    
    // 部署测试代币
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy("Test Token", "TST", ethers.parseEther("10000"));
    
    // 部署 Senate 合约
    const Senate = await ethers.getContractFactory("Senate");
    senate = await Senate.deploy();
    
    // 部署 Community 合约
    const Community = await ethers.getContractFactory("GoalOrientedCommunity");
    community = await Community.deploy(await senate.getAddress(), await token.getAddress());
    
    // 部署 UserAbility 合约
    const UserAbility = await ethers.getContractFactory("UserAbility");
    userAbility = await UserAbility.deploy(await community.getAddress());
    
    // 为测试账户分配代币
    await token.transfer(user1.address, ethers.parseEther("1000"));
    await token.transfer(user2.address, ethers.parseEther("1000"));
    
    // 设置区块时间
    const blockNumBefore = await ethers.provider.getBlockNumber();
    const blockBefore = await ethers.provider.getBlock(blockNumBefore);
    const currentTimestamp = blockBefore.timestamp;
    
    // 创建不同类别的社区
    // 音乐社区
    await createCommunity(CATEGORY_MUSIC, "音乐社区", currentTimestamp);
    // 艺术社区
    await createCommunity(CATEGORY_ART, "艺术社区", currentTimestamp + 10);
    // 体育社区
    await createCommunity(CATEGORY_SPORTS, "体育社区", currentTimestamp + 20);
    
    // 让时间前进，使社区开始
    await ethers.provider.send("evm_increaseTime", [3700]);
    await ethers.provider.send("evm_mine");
    
    // 用户加入社区并完成任务
    await joinAndCompleteTask(0, user1); // 用户1完成音乐社区
    await joinAndCompleteTask(1, user1); // 用户1完成艺术社区
    await joinAndCompleteTask(2, user2); // 用户2完成体育社区
  });
  
  // 辅助函数：创建社区
  async function createCommunity(category, name, timestamp) {
    const startTime = timestamp + 3600;
    const endTime = startTime + 3600;
    const memberDeposit = ethers.parseEther("1");
    const rewardPerMember = ethers.parseEther("2");
    const maxMembers = 10;
    
    await community.connect(owner).createCommunity(
      name,
      `这是一个${name}`,
      `完成${name}任务`,
      startTime,
      endTime,
      memberDeposit,
      rewardPerMember,
      maxMembers,
      category,
      { value: rewardPerMember * BigInt(maxMembers) }
    );
  }
  
  // 辅助函数：加入社区并完成任务
  async function joinAndCompleteTask(communityId, user) {
    // 批准代币转账
    await token.connect(user).approve(await community.getAddress(), ethers.parseEther("100"));
    
    // 加入社区
    await community.connect(user).joinCommunity(communityId, {
      value: ethers.parseEther("1")
    });
    
    // 提交完成证明
    await community.connect(user).submitCompletion(communityId, `https://example.com/submission-${communityId}`);
    
    // 获取reviewer并批准
    const reviewerAddress = await community.reviewers(communityId, 0);
    const reviewerSigner = await ethers.provider.getSigner(reviewerAddress);
    await community.connect(reviewerSigner).reviewerApprove(communityId, user.address, true);
  }
  
  describe("基础功能测试", function () {
    it("应该正确初始化合约", async function () {
      expect(await userAbility.communityContract()).to.equal(await community.getAddress());
    });
    
    it("用户完成社区任务后应该能够记录能力值", async function () {
      // 用户1记录音乐社区完成情况
      await expect(userAbility.connect(user1).recordCompletion(0))
        .to.emit(userAbility, "AbilityScoreIncreased")
        .withArgs(user1.address, CATEGORY_MUSIC, 1);
      
      // 验证能力值
      expect(await userAbility.getAbilityScore(user1.address, CATEGORY_MUSIC)).to.equal(1);
      expect(await userAbility.isCompletionRecorded(user1.address, 0)).to.be.true;
    });
    
    it("用户不能重复记录同一社区的能力值", async function () {
      // 第一次记录
      await userAbility.connect(user1).recordCompletion(0);
      
      // 尝试重复记录
      await expect(
        userAbility.connect(user1).recordCompletion(0)
      ).to.be.revertedWith("Ability score already recorded for this community");
    });
    
    it("未完成社区任务的用户不能记录能力值", async function () {
      // 用户2尝试记录未完成的音乐社区
      await expect(
        userAbility.connect(user2).recordCompletion(0)
      ).to.be.revertedWith("Community task not completed");
    });
  });
  
  describe("能力值统计功能测试", function () {
    beforeEach(async function () {
      // 用户1记录音乐和艺术社区完成情况
      await userAbility.connect(user1).recordCompletion(0); // 音乐
      await userAbility.connect(user1).recordCompletion(1); // 艺术
      
      // 用户2记录体育社区完成情况
      await userAbility.connect(user2).recordCompletion(2); // 体育
    });
    
    it("应该能够获取用户在所有类别的能力值", async function () {
      const [categories, scores] = await userAbility.getAllAbilityScores(user1.address);
      
      expect(categories.length).to.equal(2);
      expect(scores.length).to.equal(2);
      
      // 验证类别和分数
      const musicIndex = categories.findIndex(cat => cat.toString() === CATEGORY_MUSIC.toString());
      const artIndex = categories.findIndex(cat => cat.toString() === CATEGORY_ART.toString());
      
      expect(musicIndex).to.not.equal(-1);
      expect(artIndex).to.not.equal(-1);
      expect(scores[musicIndex]).to.equal(1);
      expect(scores[artIndex]).to.equal(1);
    });
    
    it("应该能够获取用户总能力值", async function () {
      expect(await userAbility.getTotalAbilityScore(user1.address)).to.equal(2); // 音乐1 + 艺术1
      expect(await userAbility.getTotalAbilityScore(user2.address)).to.equal(1); // 体育1
    });
    
    it("应该能够获取用户最高能力值的类别", async function () {
      // 再完成一个音乐社区
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const currentTimestamp = blockBefore.timestamp;
      
      await createCommunity(CATEGORY_MUSIC, "音乐社区2", currentTimestamp);
      await ethers.provider.send("evm_increaseTime", [3700]);
      await ethers.provider.send("evm_mine");
      await joinAndCompleteTask(3, user1);
      await userAbility.connect(user1).recordCompletion(3);
      
      const [topCategory, topScore] = await userAbility.getTopAbility(user1.address);
      expect(topCategory).to.equal(CATEGORY_MUSIC);
      expect(topScore).to.equal(2);
    });
    
    it("完成多个不同类别的社区任务应该正确累加能力值", async function () {
      // 获取当前区块时间
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const currentTimestamp = blockBefore.timestamp;
      
      // 用户1再完成一个音乐社区
      await createCommunity(CATEGORY_MUSIC, "音乐社区2", currentTimestamp);
      await ethers.provider.send("evm_increaseTime", [3700]);
      await ethers.provider.send("evm_mine");
      await joinAndCompleteTask(3, user1);
      await userAbility.connect(user1).recordCompletion(3);
      
      // 获取新的区块时间
      const blockNumBefore2 = await ethers.provider.getBlockNumber();
      const blockBefore2 = await ethers.provider.getBlock(blockNumBefore2);
      const currentTimestamp2 = blockBefore2.timestamp;
      
      // 用户1再完成一个体育社区
      await createCommunity(CATEGORY_SPORTS, "体育社区2", currentTimestamp2);
      await ethers.provider.send("evm_increaseTime", [3700]);
      await ethers.provider.send("evm_mine");
      await joinAndCompleteTask(4, user1);
      await userAbility.connect(user1).recordCompletion(4);
      
      // 验证能力值
      expect(await userAbility.getAbilityScore(user1.address, CATEGORY_MUSIC)).to.equal(2);
      expect(await userAbility.getAbilityScore(user1.address, CATEGORY_ART)).to.equal(1);
      expect(await userAbility.getAbilityScore(user1.address, CATEGORY_SPORTS)).to.equal(1);
      expect(await userAbility.getTotalAbilityScore(user1.address)).to.equal(4);
    });
  });
});
