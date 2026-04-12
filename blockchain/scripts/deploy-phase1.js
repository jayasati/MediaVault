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
  console.log("\n[1/5] Deploying MEDIToken...");
  const MEDIToken = await hre.ethers.getContractFactory("MEDIToken");
  const mediToken = await MEDIToken.deploy();
  await mediToken.waitForDeployment();
  const mediTokenAddress = await mediToken.getAddress();
  console.log("  MEDIToken deployed to:", mediTokenAddress);

  // 2. Deploy PatientRegistry
  console.log("\n[2/5] Deploying PatientRegistry...");
  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const patientRegistry = await PatientRegistry.deploy();
  await patientRegistry.waitForDeployment();
  const patientRegistryAddress = await patientRegistry.getAddress();
  console.log("  PatientRegistry deployed to:", patientRegistryAddress);

  // 3. Deploy MediAccessControl (needs PatientRegistry address)
  console.log("\n[3/5] Deploying MediAccessControl...");
  const MediAccessControl = await hre.ethers.getContractFactory("MediAccessControl");
  const accessControl = await MediAccessControl.deploy(patientRegistryAddress);
  await accessControl.waitForDeployment();
  const accessControlAddress = await accessControl.getAddress();
  console.log("  MediAccessControl deployed to:", accessControlAddress);

  // 4. Deploy PrescriptionManager (needs MediAccessControl address)
  console.log("\n[4/5] Deploying PrescriptionManager...");
  const PrescriptionManager = await hre.ethers.getContractFactory("PrescriptionManager");
  const prescriptionManager = await PrescriptionManager.deploy(accessControlAddress);
  await prescriptionManager.waitForDeployment();
  const prescriptionManagerAddress = await prescriptionManager.getAddress();
  console.log("  PrescriptionManager deployed to:", prescriptionManagerAddress);

  // 5. Deploy EmergencyAccess (needs PatientRegistry address)
  console.log("\n[5/6] Deploying EmergencyAccess...");
  const EmergencyAccess = await hre.ethers.getContractFactory("EmergencyAccess");
  const emergencyAccess = await EmergencyAccess.deploy(patientRegistryAddress);
  await emergencyAccess.waitForDeployment();
  const emergencyAccessAddress = await emergencyAccess.getAddress();
  console.log("  EmergencyAccess deployed to:", emergencyAccessAddress);

  // 6. Deploy RoleManager
  console.log("\n[6/6] Deploying RoleManager...");
  const RoleManager = await hre.ethers.getContractFactory("RoleManager");
  const roleManager = await RoleManager.deploy();
  await roleManager.waitForDeployment();
  const roleManagerAddress = await roleManager.getAddress();
  console.log("  RoleManager deployed to:", roleManagerAddress);
  console.log("  Super Admin:", deployer.address);

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("Phase 1 Deployment Complete!");
  console.log("=".repeat(60));
  console.log("  MEDIToken:             ", mediTokenAddress);
  console.log("  PatientRegistry:       ", patientRegistryAddress);
  console.log("  MediAccessControl:     ", accessControlAddress);
  console.log("  PrescriptionManager:   ", prescriptionManagerAddress);
  console.log("  EmergencyAccess:       ", emergencyAccessAddress);
  console.log("  RoleManager:           ", roleManagerAddress);
  console.log("  Super Admin:           ", deployer.address);
  console.log("=".repeat(60));

  // QR code data for first 3 patient IDs
  console.log("\n--- Emergency QR Code Data ---");
  for (let id = 1; id <= 3; id++) {
    console.log(`  Patient #${id}: medivault://emergency/${id}/${emergencyAccessAddress}`);
  }

  // Save deployment addresses to JSON
  const deployment = {
    network: network,
    deployedAt: new Date().toISOString(),
    contracts: {
      MEDIToken: mediTokenAddress,
      PatientRegistry: patientRegistryAddress,
      MediAccessControl: accessControlAddress,
      PrescriptionManager: prescriptionManagerAddress,
      EmergencyAccess: emergencyAccessAddress,
      RoleManager: roleManagerAddress,
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
