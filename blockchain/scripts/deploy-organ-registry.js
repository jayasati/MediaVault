const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  console.log("\nDeploying PatientRegistry...");
  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const registry = await PatientRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("PatientRegistry deployed to:", registryAddress);

  console.log("\nDeploying OrganDonorRegistry...");
  const OrganDonorRegistry = await hre.ethers.getContractFactory("OrganDonorRegistry");
  const organRegistry = await OrganDonorRegistry.deploy(registryAddress);
  await organRegistry.waitForDeployment();
  const organAddress = await organRegistry.getAddress();
  console.log("OrganDonorRegistry deployed to:", organAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
