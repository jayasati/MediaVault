const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Deploy MEDIToken
  console.log("\nDeploying MEDIToken...");
  const MEDIToken = await hre.ethers.getContractFactory("MEDIToken");
  const token = await MEDIToken.deploy();
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("MEDIToken deployed to:", tokenAddress);

  // Deploy TreatmentCompliance
  console.log("\nDeploying TreatmentCompliance...");
  const TreatmentCompliance = await hre.ethers.getContractFactory("TreatmentCompliance");
  const compliance = await TreatmentCompliance.deploy(tokenAddress, deployer.address);
  await compliance.waitForDeployment();
  const complianceAddress = await compliance.getAddress();
  console.log("TreatmentCompliance deployed to:", complianceAddress);

  // Fund compliance contract with MEDI for rewards
  console.log("\nFunding TreatmentCompliance with 100,000 MEDI for rewards...");
  await token.transfer(complianceAddress, hre.ethers.parseEther("100000"));

  // Deploy DataMarketplace
  console.log("\nDeploying DataMarketplace...");
  const DataMarketplace = await hre.ethers.getContractFactory("DataMarketplace");
  const marketplace = await DataMarketplace.deploy(tokenAddress);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log("DataMarketplace deployed to:", marketplaceAddress);

  // Approve marketplace as platform address
  console.log("\nApproving DataMarketplace as platform...");
  await token.approvePlatform(marketplaceAddress);

  console.log("\n=== Deployment Complete ===");
  console.log("MEDIToken:            ", tokenAddress);
  console.log("TreatmentCompliance:  ", complianceAddress);
  console.log("DataMarketplace:      ", marketplaceAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
