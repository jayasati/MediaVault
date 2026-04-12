const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  console.log("\nDeploying MEDIToken...");
  const MEDIToken = await hre.ethers.getContractFactory("MEDIToken");
  const token = await MEDIToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("MEDIToken deployed to:", tokenAddress);

  console.log("\nDeploying SecondOpinionMarket...");
  const SecondOpinionMarket = await hre.ethers.getContractFactory("SecondOpinionMarket");
  const market = await SecondOpinionMarket.deploy(tokenAddress);
  await market.waitForDeployment();
  const marketAddress = await market.getAddress();
  console.log("SecondOpinionMarket deployed to:", marketAddress);

  // Approve market as platform for gasless transfers
  console.log("\nApproving market as platform address...");
  await token.approvePlatform(marketAddress);
  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
