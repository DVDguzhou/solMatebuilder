const hre = require("hardhat");

async function main() {
  // 部署 TestToken
  const TestToken = await hre.ethers.getContractFactory("TestToken");
  const testToken = await TestToken.deploy(
    "Test Token",           // name
    "TEST",                 // symbol
    hre.ethers.parseEther("1000000")  // initialSupply: 1,000,000 tokens
  );
  await testToken.waitForDeployment();
  const testTokenAddress = await testToken.getAddress();
  console.log("TestToken deployed to:", testTokenAddress);

  // 部署 Senate
  const Senate = await hre.ethers.getContractFactory("Senate");
  const senate = await Senate.deploy();
  await senate.waitForDeployment();
  const senateAddress = await senate.getAddress();
  console.log("Senate deployed to:", senateAddress);

  // 部署 Community
  const Community = await hre.ethers.getContractFactory("GoalOrientedCommunity");
  const community = await Community.deploy(senateAddress, testTokenAddress);
  await community.waitForDeployment();
  console.log("Community deployed to:", await community.getAddress());

  // 等待几个区块确认
  console.log("Waiting for block confirmations...");
  await hre.network.provider.send("evm_mine");
  await hre.network.provider.send("evm_mine");
  await hre.network.provider.send("evm_mine");

  // 验证合约
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("Verifying contracts...");
    try {
      await hre.run("verify:verify", {
        address: testTokenAddress,
        constructorArguments: [
          "Test Token",
          "TEST",
          hre.ethers.parseEther("1000000")
        ],
      });
      console.log("TestToken verified");

      await hre.run("verify:verify", {
        address: senateAddress,
        constructorArguments: [],
      });
      console.log("Senate verified");

      await hre.run("verify:verify", {
        address: await community.getAddress(),
        constructorArguments: [senateAddress, testTokenAddress],
      });
      console.log("Community verified");
    } catch (error) {
      console.log("Verification failed:", error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 