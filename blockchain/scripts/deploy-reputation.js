const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  console.log("\nDeploying PatientRegistry...");
  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const registry = await PatientRegistry.deploy();
  await registry.waitForDeployment();
  console.log("PatientRegistry:", await registry.getAddress());

  console.log("\nDeploying MediAccessControl...");
  const MediAccessControl = await hre.ethers.getContractFactory("MediAccessControl");
  const accessControl = await MediAccessControl.deploy(await registry.getAddress());
  await accessControl.waitForDeployment();
  console.log("MediAccessControl:", await accessControl.getAddress());

  console.log("\nDeploying DoctorReputation...");
  const DoctorReputation = await hre.ethers.getContractFactory("DoctorReputation");
  const reputation = await DoctorReputation.deploy(await accessControl.getAddress());
  await reputation.waitForDeployment();
  console.log("DoctorReputation:", await reputation.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
