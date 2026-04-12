// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./MEDIToken.sol";

contract DataMarketplace is Ownable, ReentrancyGuard {
    MEDIToken public mediToken;

    uint256 public constant PLATFORM_FEE_BPS = 1000; // 10%

    enum ConsentLevel { BASIC, DETAILED, FULL }

    struct DataListing {
        uint256 listingId;
        address patientAddress;
        string anonymizedCID;
        ConsentLevel consentLevel;
        uint256 pricePerAccess;
        uint256 accessCount;
        bool isActive;
    }

    struct DataAccess {
        uint256 accessId;
        uint256 listingId;
        address researcherAddress;
        uint256 accessedAt;
        uint256 amountPaid;
    }

    uint256 private _listingIdCounter;
    uint256 private _accessIdCounter;

    mapping(uint256 => DataListing) private listings;
    mapping(uint256 => DataAccess) private accesses;
    mapping(address => uint256[]) private patientListings;
    mapping(address => uint256[]) private researcherPurchases;

    uint256[] private allListingIds;

    event DataListed(uint256 indexed listingId, address indexed patient, ConsentLevel consentLevel, uint256 price);
    event DataDelisted(uint256 indexed listingId, address indexed patient);
    event DataAccessed(uint256 indexed accessId, uint256 indexed listingId, address indexed researcher, uint256 amountPaid);
    event PaymentSent(address indexed patient, uint256 patientAmount, address indexed platformOwner, uint256 platformFee);

    constructor(address _mediToken) Ownable(msg.sender) {
        mediToken = MEDIToken(_mediToken);
    }

    function listData(
        string calldata anonymizedCID,
        ConsentLevel consentLevel,
        uint256 pricePerAccess
    ) external {
        require(bytes(anonymizedCID).length > 0, "CID required");
        require(pricePerAccess > 0, "Price must be > 0");

        _listingIdCounter++;
        uint256 newId = _listingIdCounter;

        listings[newId] = DataListing({
            listingId: newId,
            patientAddress: msg.sender,
            anonymizedCID: anonymizedCID,
            consentLevel: consentLevel,
            pricePerAccess: pricePerAccess,
            accessCount: 0,
            isActive: true
        });

        patientListings[msg.sender].push(newId);
        allListingIds.push(newId);

        emit DataListed(newId, msg.sender, consentLevel, pricePerAccess);
    }

    function delistData(uint256 listingId) external {
        DataListing storage listing = listings[listingId];
        require(listing.listingId != 0, "Listing does not exist");
        require(msg.sender == listing.patientAddress, "Not the owner");
        require(listing.isActive, "Already delisted");

        listing.isActive = false;
        emit DataDelisted(listingId, msg.sender);
    }

    function purchaseAccess(uint256 listingId) external nonReentrant {
        DataListing storage listing = listings[listingId];
        require(listing.listingId != 0, "Listing does not exist");
        require(listing.isActive, "Listing is not active");
        require(msg.sender != listing.patientAddress, "Cannot buy own data");

        uint256 price = listing.pricePerAccess;

        // Transfer from researcher to contract
        require(
            mediToken.transferFrom(msg.sender, address(this), price),
            "Payment transfer failed"
        );

        // Calculate splits
        uint256 platformFee = (price * PLATFORM_FEE_BPS) / 10000;
        uint256 patientPayout = price - platformFee;

        // Pay patient and platform
        require(mediToken.transfer(listing.patientAddress, patientPayout), "Patient payout failed");
        if (platformFee > 0) {
            require(mediToken.transfer(owner(), platformFee), "Platform fee failed");
        }

        listing.accessCount++;

        _accessIdCounter++;
        uint256 newId = _accessIdCounter;

        accesses[newId] = DataAccess({
            accessId: newId,
            listingId: listingId,
            researcherAddress: msg.sender,
            accessedAt: block.timestamp,
            amountPaid: price
        });

        researcherPurchases[msg.sender].push(newId);

        emit DataAccessed(newId, listingId, msg.sender, price);
        emit PaymentSent(listing.patientAddress, patientPayout, owner(), platformFee);
    }

    function getListing(uint256 listingId) external view returns (DataListing memory) {
        return listings[listingId];
    }

    function getAccess(uint256 accessId) external view returns (DataAccess memory) {
        return accesses[accessId];
    }

    function getListings(ConsentLevel consentLevel) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < allListingIds.length; i++) {
            DataListing storage l = listings[allListingIds[i]];
            if (l.isActive && l.consentLevel == consentLevel) count++;
        }

        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < allListingIds.length; i++) {
            DataListing storage l = listings[allListingIds[i]];
            if (l.isActive && l.consentLevel == consentLevel) {
                result[idx] = allListingIds[i];
                idx++;
            }
        }
        return result;
    }

    function getMyListings(address patientAddress) external view returns (uint256[] memory) {
        return patientListings[patientAddress];
    }

    function getMyPurchases(address researcherAddress) external view returns (uint256[] memory) {
        return researcherPurchases[researcherAddress];
    }
}
