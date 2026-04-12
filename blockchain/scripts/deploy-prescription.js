const hre = require("hardhat");

async function main() {
  // Deploy dependency chain: PatientRegistry → MediAccessControl → PrescriptionManager
  console.log("Deploying PatientRegistry...");
  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const registry = await PatientRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("PatientRegistry deployed to:", registryAddress);

  console.log("Deploying MediAccessControl...");
  const MediAccessControl = await hre.ethers.getContractFactory("MediAccessControl");
  const accessControl = await MediAccessControl.deploy(registryAddress);
  await accessControl.waitForDeployment();
  const accessAddress = await accessControl.getAddress();
  console.log("MediAccessControl deployed to:", accessAddress);

  console.log("Deploying PrescriptionManager...");
  const PrescriptionManager = await hre.ethers.getContractFactory("PrescriptionManager");
  const prescriptionManager = await PrescriptionManager.deploy(accessAddress);
  await prescriptionManager.waitForDeployment();
  const rxAddress = await prescriptionManager.getAddress();
  console.log("PrescriptionManager deployed to:", rxAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
