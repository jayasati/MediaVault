const hre = require("hardhat");

async function main() {
  console.log("Deploying MEDIToken contract...");

  const MEDIToken = await hre.ethers.getContractFactory("MEDIToken");
  const token = await MEDIToken.deploy();
  await token.waitForDeployment();

  const address = await token.getAddress();
  console.log("MEDIToken deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
