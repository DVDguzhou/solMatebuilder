const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GoalOrientedCommunity Encryption", function () {
  let community;
  let senate;
  let token;
  let owner;
  let creator;
  let members = [];
  let senator;
  
  const STAKE_AMOUNT = ethers.parseEther("100");
  const communityId = 0;
  
  // 模拟的密钥对
  const mockPublicKey = "mock-public-key";
  const mockEncryptedPrivateKey = "mock-encrypted-private-key";
  
  beforeEach(async function () {
    // 获取测试账户
    const signers = await ethers.getSigners();
    [owner, creator] = signers;
    members = signers.slice(2, 12); // 取10个成员
    senator = signers[12];

    // 部署测试代币
    const Token = await ethers.getContractFactory("TestToken");
    token = await Token.deploy("Test Token", "TST", ethers.parseEther("10000"));
    await token.waitForDeployment();
    
    // 部署 Senate 合约
    const Senate = await ethers.getContractFactory("Senate");
    senate = await Senate.deploy();
    await senate.waitForDeployment();

    // 部署 GoalOrientedCommunity 合约
    const Community = await ethers.getContractFactory("GoalOrientedCommunity");
    community = await Community.deploy(
      await senate.getAddress(),
      await token.getAddress()
    );
    await community.waitForDeployment();
    
    // 设置参议员
    await senate.addSenator(senator.address, 1); // 假设类别为 ART
    
    // 为测试账户分配代币
    for (let member of members.slice(0, 10)) {
      await token.transfer(member.address, STAKE_AMOUNT);
    }
    
    // 创建社区
    const now = Math.floor(Date.now() / 1000);
    const startTime = now + 100;
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
      1, // ART 类别
      { value: rewardPerMember * BigInt(maxMembers) }
    );

    // 让时间前进使社区开始
    await ethers.provider.send("evm_increaseTime", [startTime - now + 10]);
    await ethers.provider.send("evm_mine");

    // 让10个成员加入社区
    for (let member of members.slice(0, 10)) {
      await token.connect(member).approve(community.address, STAKE_AMOUNT);
      await community.connect(member).joinCommunity(communityId, {
        value: ethers.parseEther("1")
      });
    }
  });

  describe("密钥管理", function () {
    it("应该在10个reviewer都加入后才能设置密钥", async function () {
      // 验证已经有10个reviewer
      expect(await community.reviewers(communityId, 9)).to.not.equal(ethers.ZeroAddress);
      
      // 设置社区公钥
      await expect(community.setCommunityKeys(communityId, mockPublicKey))
        .to.emit(community, "CommunityKeysGenerated")
        .withArgs(communityId, mockPublicKey);
      
      // 验证公钥已设置
      expect(await community.communityPublicKey(communityId)).to.equal(mockPublicKey);
      expect(await community.hasGeneratedKeys(communityId)).to.be.true;
    });

    it("不能重复设置社区密钥", async function () {
      await community.setCommunityKeys(communityId, mockPublicKey);
      await expect(
        community.setCommunityKeys(communityId, "another-public-key")
      ).to.be.revertedWith("Keys already generated");
    });

    it("应该能为reviewer设置加密的私钥", async function () {
      await community.setCommunityKeys(communityId, mockPublicKey);
      
      const reviewer = members[0];
      await expect(
        community.setEncryptedPrivateKey(
          communityId,
          reviewer.address,
          mockEncryptedPrivateKey,
          false
        )
      ).to.emit(community, "PrivateKeyEncrypted")
        .withArgs(communityId, reviewer.address, false);

      expect(await community.encryptedPrivateKeys(communityId, reviewer.address))
        .to.equal(mockEncryptedPrivateKey);
    });

    it("应该能为senator设置加密的私钥", async function () {
      await community.setCommunityKeys(communityId, mockPublicKey);
      
      await expect(
        community.setEncryptedPrivateKey(
          communityId,
          senator.address,
          mockEncryptedPrivateKey,
          true
        )
      ).to.emit(community, "PrivateKeyEncrypted")
        .withArgs(communityId, senator.address, true);

      expect(await community.encryptedPrivateKeys(communityId, senator.address))
        .to.equal(mockEncryptedPrivateKey);
    });

    it("非reviewer不能设置加密私钥", async function () {
      await community.setCommunityKeys(communityId, mockPublicKey);
      
      const nonReviewer = members[10]; // 第11个成员，不是reviewer
      await expect(
        community.setEncryptedPrivateKey(
          communityId,
          nonReviewer.address,
          mockEncryptedPrivateKey,
          false
        )
      ).to.be.revertedWith("Not a valid reviewer");
    });

    it("非senator不能设置senator加密私钥", async function () {
      await community.setCommunityKeys(communityId, mockPublicKey);
      
      const nonSenator = members[0];
      await expect(
        community.setEncryptedPrivateKey(
          communityId,
          nonSenator.address,
          mockEncryptedPrivateKey,
          true
        )
      ).to.be.revertedWith("Not a valid senator");
    });

    it("不能在设置密钥前提交内容", async function () {
      const member = members[0];
      await expect(
        community.connect(member).submitCompletion(
          communityId,
          "ipfs://QmHash"
        )
      ).to.be.revertedWith("Community keys not generated");
    });

    it("应该能在设置密钥后提交内容", async function () {
      await community.setCommunityKeys(communityId, mockPublicKey);
      
      const member = members[0];
      const submissionUrl = "ipfs://QmHash";
      
      await expect(
        community.connect(member).submitCompletion(communityId, submissionUrl)
      ).to.emit(community, "SubmissionUploaded")
        .withArgs(communityId, member.address, submissionUrl);
    });
  });
});
