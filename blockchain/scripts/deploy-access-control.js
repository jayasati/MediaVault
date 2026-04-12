const hre = require("hardhat");

async function main() {
  // Deploy PatientRegistry first (or use existing address)
  console.log("Deploying PatientRegistry...");
  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const registry = await PatientRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("PatientRegistry deployed to:", registryAddress);

  // Deploy MediAccessControl with PatientRegistry address
  console.log("Deploying MediAccessControl...");
  const MediAccessControl = await hre.ethers.getContractFactory("MediAccessControl");
  const accessControl = await MediAccessControl.deploy(registryAddress);
  await accessControl.waitForDeployment();
  const accessAddress = await accessControl.getAddress();
  console.log("MediAccessControl deployed to:", accessAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
