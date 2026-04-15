const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy PatientRegistry
  console.log("\nDeploying PatientRegistry...");
  const PatientRegistry = await hre.ethers.getContractFactory("PatientRegistry");
  const registry = await PatientRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("PatientRegistry deployed to:", registryAddress);

  // Deploy RoleManager (required by EmergencyAccess)
  console.log("\nDeploying RoleManager...");
  const RoleManager = await hre.ethers.getContractFactory("RoleManager");
  const roleManager = await RoleManager.deploy();
  await roleManager.waitForDeployment();
  const roleManagerAddress = await roleManager.getAddress();
  console.log("RoleManager deployed to:", roleManagerAddress);

  // Deploy EmergencyAccess
  console.log("\nDeploying EmergencyAccess...");
  const EmergencyAccess = await hre.ethers.getContractFactory("EmergencyAccess");
  const emergencyAccess = await EmergencyAccess.deploy(registryAddress, roleManagerAddress);
  await emergencyAccess.waitForDeployment();
  const emergencyAddress = await emergencyAccess.getAddress();
  console.log("EmergencyAccess deployed to:", emergencyAddress);

  // Generate QR code data strings for demo patients
  console.log("\n--- QR Code Data ---");
  console.log("Format: medivault://emergency/{patientId}/{contractAddress}");
  console.log("");
  for (let id = 1; id <= 3; id++) {
    const qrData = generateQRData(id, emergencyAddress);
    console.log(`Patient #${id}: ${qrData}`);
  }
}

/**
 * Generate a QR code data string for emergency scanning.
 * Format: medivault://emergency/{patientId}/{contractAddress}
 *
 * This URI is encoded into a QR code on the patient's wristband, card, or app.
 * When scanned, the responder's app calls emergencyAccess(patientId, reason, location)
 * on the EmergencyAccess contract at the given address.
 */
function generateQRData(patientId, contractAddress) {
  return `medivault://emergency/${patientId}/${contractAddress}`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
