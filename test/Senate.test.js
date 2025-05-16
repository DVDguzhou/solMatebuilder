const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Senate 合约测试", function () {
  let senate;
  let owner;
  let candidate1;
  let candidate2;
  let voter1;
  let voter2;
  let voter3;
  
  beforeEach(async function () {
    [owner, candidate1, candidate2, voter1, voter2, voter3] = await ethers.getSigners();
    
    // 部署 Senate 合约
    const Senate = await ethers.getContractFactory("Senate");
    senate = await Senate.deploy();
  });
  
  describe("基础功能测试", function () {
    it("应该正确初始化参议院配置", async function () {
      // 检查 MUSIC 类别的配置
      const config = await senate.senateConfigs(1); // MUSIC 类别
      expect(config.minPassScore).to.equal(70); // 默认通过分数为70
      expect(config.termDuration).to.equal(180 * 24 * 60 * 60); // 默认任期6个月
      expect(config.minVotesToElect).to.equal(100); // 默认需要100票当选
      expect(config.maxSenators).to.equal(5); // 默认每个类型最多5名参议员
    });
    
    it("应该能够添加参议员", async function () {
      await senate.addSenator(candidate1.address, 1); // MUSIC 类别
      
      // 检查参议员是否被正确添加
      expect(await senate.senatorCategories(candidate1.address)).to.equal(1);
      expect(await senate.isSenator(candidate1.address, 1)).to.be.true;
      
      // 检查活跃参议员数量
      expect(await senate.getActiveSenatorCount(1)).to.equal(1);
    });
    
    it("不能添加地址为0的参议员", async function () {
      await expect(
        senate.addSenator(ethers.ZeroAddress, 1)
      ).to.be.revertedWith("Invalid senator address");
    });
    
    it("不能重复添加同一个参议员", async function () {
      await senate.addSenator(candidate1.address, 1);
      
      await expect(
        senate.addSenator(candidate1.address, 2)
      ).to.be.revertedWith("Already a senator");
    });
  });
  
  describe("提名和投票测试", function () {
    it("应该能够提名成为参议员候选人", async function () {
      await senate.connect(candidate1).nominate(1); // MUSIC 类别
      
      // 检查候选人是否被添加到参议员列表
      const senator = await senate.senators(1, 0); // MUSIC 类别的第一个参议员
      expect(senator.addr).to.equal(candidate1.address);
      expect(senator.active).to.be.false; // 还未当选，不是活跃参议员
    });
    
    it("已经是参议员的人不能再次提名", async function () {
      await senate.addSenator(candidate1.address, 1);
      
      await expect(
        senate.connect(candidate1).nominate(2)
      ).to.be.revertedWith("Already a senator");
    });
    
    it("不能提名到无效的类别", async function () {
      await expect(
        senate.connect(candidate1).nominate(10) // 无效类别
      ).to.be.reverted; // 不检查具体错误消息
    });
    
    it("应该能够为候选人投票", async function () {
      // 候选人提名
      await senate.connect(candidate1).nominate(1);
      
      // 投票
      await senate.connect(voter1).vote(1, candidate1.address);
      
      // 检查投票记录
      expect(await senate.hasVoted(1, voter1.address)).to.be.true;
      expect(await senate.votedFor(1, voter1.address)).to.equal(candidate1.address);
      
      // 检查候选人票数
      const senator = await senate.senators(1, 0);
      expect(senator.votes).to.equal(1);
    });
    
    it("不能为自己投票", async function () {
      await senate.connect(candidate1).nominate(1);
      
      await expect(
        senate.connect(candidate1).vote(1, candidate1.address)
      ).to.be.revertedWith("Cannot vote for self");
    });
    
    it("不能重复投票", async function () {
      await senate.connect(candidate1).nominate(1);
      await senate.connect(voter1).vote(1, candidate1.address);
      
      await expect(
        senate.connect(voter1).vote(1, candidate1.address)
      ).to.be.revertedWith("Already voted");
    });
    
    it("不能为不存在的候选人投票", async function () {
      await expect(
        senate.connect(voter1).vote(1, candidate1.address)
      ).to.be.revertedWith("Candidate not found");
    });
    
    it("当票数达到要求时应该当选为参议员", async function () {
      // 修改当选所需票数为2
      await senate.addSenator(owner.address, 1); // 先添加一个参议员以便有权限修改配置
      await senate.updateMinVotesToElect(1, 2);
      
      // 候选人提名
      await senate.connect(candidate1).nominate(1);
      
      // 第一次投票
      await senate.connect(voter1).vote(1, candidate1.address);
      
      // 检查候选人状态 - 还未当选
      let senator = await senate.senators(1, 1); // 第二个参议员（索引1）
      expect(senator.active).to.be.false;
      
      // 第二次投票 - 应该当选
      await senate.connect(voter2).vote(1, candidate1.address);
      
      // 检查候选人状态 - 已当选
      senator = await senate.senators(1, 1);
      expect(senator.active).to.be.true;
      expect(senator.votes).to.equal(2);
      expect(await senate.senatorCategories(candidate1.address)).to.equal(1);
    });
  });
  
  describe("参议院管理测试", function () {
    beforeEach(async function () {
      // 添加参议员
      await senate.addSenator(candidate1.address, 1);
    });
    
    it("参议员应该能够更新通过分数", async function () {
      await senate.connect(candidate1).updateMinPassScore(1, 80);
      
      const config = await senate.senateConfigs(1);
      expect(config.minPassScore).to.equal(80);
    });
    
    it("非参议员不能更新通过分数", async function () {
      await expect(
        senate.connect(voter1).updateMinPassScore(1, 80)
      ).to.be.revertedWith("Not a senator");
    });
    
    it("通过分数必须在有效范围内", async function () {
      await expect(
        senate.connect(candidate1).updateMinPassScore(1, 0)
      ).to.be.revertedWith("Invalid score");
      
      await expect(
        senate.connect(candidate1).updateMinPassScore(1, 101)
      ).to.be.revertedWith("Invalid score");
    });
    
    it("应该能够获取通过分数", async function () {
      await senate.connect(candidate1).updateMinPassScore(1, 85);
      
      expect(await senate.getMinPassScore(1)).to.equal(85);
    });
    
    it("应该能够检查是否是参议员", async function () {
      expect(await senate.isSenator(candidate1.address, 1)).to.be.true;
      expect(await senate.isSenator(candidate2.address, 1)).to.be.false;
    });
  });
  
  describe("参议员任期测试", function () {
    it("参议员任期结束后应该不再是活跃参议员", async function () {
      // 添加参议员，任期设置为10秒
      await senate.addSenator(owner.address, 1); // 先添加一个有权限的参议员
      await senate.connect(owner).updateTermDuration(1, 10); // 设置任期为10秒
      
      // 然后添加测试用的参议员
      await senate.addSenator(candidate1.address, 1);
      
      // 初始状态应该是活跃的
      expect(await senate.isSenator(candidate1.address, 1)).to.be.true;
      
      // 增加时间，使任期过期
      await ethers.provider.send("evm_increaseTime", [15]); // 增加15秒
      await ethers.provider.send("evm_mine");
      
      // 任期结束后应该不再是活跃参议员
      expect(await senate.isSenator(candidate1.address, 1)).to.be.false;
    });
  });
});
