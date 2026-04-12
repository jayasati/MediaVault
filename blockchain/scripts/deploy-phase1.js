const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;

  console.log("=".repeat(60));
  console.log("MediVault Phase 1 Deployment");
  console.log("=".repeat(60));
  console.log("Network:", network);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");
  console.log("-".repeat(60));

  // 1. Deploy MEDIToken
  console.log("\n[1/3] Deploying MEDIToken...");
  const MEDIToken = await hre.ethers.getContractFactory("MEDIToken");
  const mediToken = await MEDIToken.deploy();
  await mediToken.waitForDeployment();
  const mediTokenAddress = await mediToken.getAddress();
  console.log("  MEDIToken deployed to:", mediTokenAddress);

  // 2. Deploy PatientRegistry
  console.log("\n[2/3] Deploying PatientRegistry...");
  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const patientRegistry = await PatientRegistry.deploy();
  await patientRegistry.waitForDeployment();
  const patientRegistryAddress = await patientRegistry.getAddress();
  console.log("  PatientRegistry deployed to:", patientRegistryAddress);

  // 3. Deploy MediAccessControl (needs PatientRegistry address)
  console.log("\n[3/3] Deploying MediAccessControl...");
  const MediAccessControl = await hre.ethers.getContractFactory("MediAccessControl");
  const accessControl = await MediAccessControl.deploy(patientRegistryAddress);
  await accessControl.waitForDeployment();
  const accessControlAddress = await accessControl.getAddress();
  console.log("  MediAccessControl deployed to:", accessControlAddress);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Phase 1 Deployment Complete!");
  console.log("=".repeat(60));
  console.log("  MEDIToken:          ", mediTokenAddress);
  console.log("  PatientRegistry:    ", patientRegistryAddress);
  console.log("  MediAccessControl:  ", accessControlAddress);
  console.log("=".repeat(60));

  // Save deployment addresses to JSON
  const deployment = {
    network: network,
    deployedAt: new Date().toISOString(),
    contracts: {
      MEDIToken: mediTokenAddress,
      PatientRegistry: patientRegistryAddress,
      MediAccessControl: accessControlAddress,
    },
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const outputPath = path.join(deploymentsDir, `${network}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(deployment, null, 2));
  console.log("\nDeployment addresses saved to:", outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
