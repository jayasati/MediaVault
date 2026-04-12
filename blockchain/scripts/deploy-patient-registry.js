const hre = require("hardhat");

async function main() {
  console.log("Deploying PatientRegistry contract...");

  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const registry = await PatientRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("PatientRegistry deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
