const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DataMarketplace", function () {
  let mediToken, marketplace;
  let owner, patient, patient2, researcher, researcher2, stranger;

  const PRICE = ethers.parseEther("10");
  const CONSENT = { BASIC: 0, DETAILED: 1, FULL: 2 };

  beforeEach(async function () {
    [owner, patient, patient2, researcher, researcher2, stranger] = await ethers.getSigners();

    const MEDIToken = await ethers.getContractFactory("MEDIToken");
    mediToken = await MEDIToken.deploy();

    const DataMarketplace = await ethers.getContractFactory("DataMarketplace");
    marketplace = await DataMarketplace.deploy(await mediToken.getAddress());

    // Approve marketplace as platform for transfers
    await mediToken.approvePlatform(await marketplace.getAddress());

    // Fund researchers with MEDI tokens
    await mediToken.mint(researcher.address, ethers.parseEther("1000"));
    await mediToken.mint(researcher2.address, ethers.parseEther("1000"));
  });

  describe("Listing Data", function () {
    it("should list data with correct details", async function () {
      await marketplace.connect(patient).listData("QmAnon123", CONSENT.BASIC, PRICE);
      const listing = await marketplace.getListing(1);
      expect(listing.listingId).to.equal(1);
      expect(listing.patientAddress).to.equal(patient.address);
      expect(listing.anonymizedCID).to.equal("QmAnon123");
      expect(listing.consentLevel).to.equal(CONSENT.BASIC);
      expect(listing.pricePerAccess).to.equal(PRICE);
      expect(listing.accessCount).to.equal(0);
      expect(listing.isActive).to.be.true;
    });

    it("should emit DataListed event", async function () {
      await expect(marketplace.connect(patient).listData("QmCid", CONSENT.DETAILED, PRICE))
        .to.emit(marketplace, "DataListed")
        .withArgs(1, patient.address, CONSENT.DETAILED, PRICE);
    });

    it("should reject empty CID", async function () {
      await expect(
        marketplace.connect(patient).listData("", CONSENT.BASIC, PRICE)
      ).to.be.revertedWith("CID required");
    });

    it("should reject zero price", async function () {
      await expect(
        marketplace.connect(patient).listData("QmCid", CONSENT.BASIC, 0)
      ).to.be.revertedWith("Price must be > 0");
    });

    it("should track listings per patient", async function () {
      await marketplace.connect(patient).listData("QmA", CONSENT.BASIC, PRICE);
      await marketplace.connect(patient).listData("QmB", CONSENT.FULL, PRICE);
      const ids = await marketplace.getMyListings(patient.address);
      expect(ids.length).to.equal(2);
    });
  });

  describe("Delisting", function () {
    beforeEach(async function () {
      await marketplace.connect(patient).listData("QmAnon", CONSENT.BASIC, PRICE);
    });

    it("should delist data", async function () {
      await marketplace.connect(patient).delistData(1);
      const listing = await marketplace.getListing(1);
      expect(listing.isActive).to.be.false;
    });

    it("should emit DataDelisted event", async function () {
      await expect(marketplace.connect(patient).delistData(1))
        .to.emit(marketplace, "DataDelisted")
        .withArgs(1, patient.address);
    });

    it("should reject delist from non-owner", async function () {
      await expect(
        marketplace.connect(stranger).delistData(1)
      ).to.be.revertedWith("Not the owner");
    });

    it("should reject double delist", async function () {
      await marketplace.connect(patient).delistData(1);
      await expect(
        marketplace.connect(patient).delistData(1)
      ).to.be.revertedWith("Already delisted");
    });

    it("should reject delist of non-existent listing", async function () {
      await expect(
        marketplace.connect(patient).delistData(999)
      ).to.be.revertedWith("Listing does not exist");
    });
  });

  describe("Purchasing Access", function () {
    beforeEach(async function () {
      await marketplace.connect(patient).listData("QmAnon123", CONSENT.BASIC, PRICE);
    });

    it("should transfer 90% to patient and 10% to platform", async function () {
      const patientBefore = await mediToken.balanceOf(patient.address);
      const ownerBefore = await mediToken.balanceOf(owner.address);

      await marketplace.connect(researcher).purchaseAccess(1);

      const patientAfter = await mediToken.balanceOf(patient.address);
      const ownerAfter = await mediToken.balanceOf(owner.address);

      const expectedPatient = PRICE - (PRICE * 1000n / 10000n); // 9 MEDI
      const expectedFee = PRICE * 1000n / 10000n; // 1 MEDI

      expect(patientAfter - patientBefore).to.equal(expectedPatient);
      expect(ownerAfter - ownerBefore).to.equal(expectedFee);
    });

    it("should emit DataAccessed and PaymentSent events", async function () {
      const tx = marketplace.connect(researcher).purchaseAccess(1);
      await expect(tx).to.emit(marketplace, "DataAccessed");
      await expect(tx).to.emit(marketplace, "PaymentSent");
    });

    it("should increment access count", async function () {
      await marketplace.connect(researcher).purchaseAccess(1);
      const listing = await marketplace.getListing(1);
      expect(listing.accessCount).to.equal(1);
    });

    it("should allow multiple researchers to purchase same listing", async function () {
      await marketplace.connect(researcher).purchaseAccess(1);
      await marketplace.connect(researcher2).purchaseAccess(1);
      const listing = await marketplace.getListing(1);
      expect(listing.accessCount).to.equal(2);
    });

    it("should track purchases per researcher", async function () {
      await marketplace.connect(researcher).purchaseAccess(1);
      const purchases = await marketplace.getMyPurchases(researcher.address);
      expect(purchases.length).to.equal(1);
    });

    it("should store access record with correct data", async function () {
      await marketplace.connect(researcher).purchaseAccess(1);
      const access = await marketplace.getAccess(1);
      expect(access.listingId).to.equal(1);
      expect(access.researcherAddress).to.equal(researcher.address);
      expect(access.amountPaid).to.equal(PRICE);
    });

    it("should reject purchase of inactive listing", async function () {
      await marketplace.connect(patient).delistData(1);
      await expect(
        marketplace.connect(researcher).purchaseAccess(1)
      ).to.be.revertedWith("Listing is not active");
    });

    it("should reject purchase of non-existent listing", async function () {
      await expect(
        marketplace.connect(researcher).purchaseAccess(999)
      ).to.be.revertedWith("Listing does not exist");
    });

    it("should reject patient buying own data", async function () {
      await expect(
        marketplace.connect(patient).purchaseAccess(1)
      ).to.be.revertedWith("Cannot buy own data");
    });
  });

  describe("Browsing Listings by Consent Level", function () {
    beforeEach(async function () {
      await marketplace.connect(patient).listData("QmBasic1", CONSENT.BASIC, PRICE);
      await marketplace.connect(patient).listData("QmDetailed1", CONSENT.DETAILED, PRICE);
      await marketplace.connect(patient2).listData("QmBasic2", CONSENT.BASIC, PRICE);
      await marketplace.connect(patient2).listData("QmFull1", CONSENT.FULL, PRICE);
    });

    it("should return only BASIC listings", async function () {
      const ids = await marketplace.getListings(CONSENT.BASIC);
      expect(ids.length).to.equal(2);
    });

    it("should return only DETAILED listings", async function () {
      const ids = await marketplace.getListings(CONSENT.DETAILED);
      expect(ids.length).to.equal(1);
    });

    it("should return only FULL listings", async function () {
      const ids = await marketplace.getListings(CONSENT.FULL);
      expect(ids.length).to.equal(1);
    });

    it("should exclude delisted from results", async function () {
      await marketplace.connect(patient).delistData(1); // delist QmBasic1
      const ids = await marketplace.getListings(CONSENT.BASIC);
      expect(ids.length).to.equal(1);
      expect(ids[0]).to.equal(3); // QmBasic2 only
    });

    it("should return empty for consent level with no listings", async function () {
      // Delist all FULL
      await marketplace.connect(patient2).delistData(4);
      const ids = await marketplace.getListings(CONSENT.FULL);
      expect(ids.length).to.equal(0);
    });
  });
});
