const hre = require("hardhat");

async function main() {
  console.log("Deploying MediVault contract...");

  const MediVault = await hre.ethers.getContractFactory("MediVault");
  const medivault = await MediVault.deploy();
  await medivault.waitForDeployment();

  const address = await medivault.getAddress();
  console.log("MediVault deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
