// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ReefLedger
 * @notice Public, append-only coral damage observation registry.
 * @dev For a hackathon demo. Reports are UNVERIFIED claims, not certified findings.
 *      All coordinates, notes and evidence URLs are PUBLIC AND PERMANENT.
 */
contract ReefLedger {
    struct Report {
        address reporter;
        int32 latitudeE6;
        int32 longitudeE6;
        uint8 damageType; // 0 bleaching, 1 physical damage, 2 disease, 3 pollution, 4 other
        bytes32 photoHash; // SHA-256 of uploaded photo bytes; zero if not provided
        string photoURL;   // Public URL, optional; photo is NOT stored on-chain
        string notes;
        uint64 submittedAt;
    }

    Report[] private reports;

    event ReportSubmitted(
        uint256 indexed reportId,
        address indexed reporter,
        int32 latitudeE6,
        int32 longitudeE6,
        uint8 damageType,
        bytes32 photoHash
    );

    function submitReport(
        int32 latitudeE6,
        int32 longitudeE6,
        uint8 damageType,
        bytes32 photoHash,
        string calldata photoURL,
        string calldata notes
    ) external returns (uint256 reportId) {
        require(latitudeE6 >= -90_000_000 && latitudeE6 <= 90_000_000, "Bad latitude");
        require(longitudeE6 >= -180_000_000 && longitudeE6 <= 180_000_000, "Bad longitude");
        require(damageType <= 4, "Bad damage type");
        require(bytes(notes).length <= 400, "Notes too long");
        require(bytes(photoURL).length <= 500, "URL too long");
        require(photoHash != bytes32(0) || bytes(photoURL).length != 0, "Evidence required");

        reportId = reports.length;
        reports.push(
            Report({
                reporter: msg.sender,
                latitudeE6: latitudeE6,
                longitudeE6: longitudeE6,
                damageType: damageType,
                photoHash: photoHash,
                photoURL: photoURL,
                notes: notes,
                submittedAt: uint64(block.timestamp)
            })
        );
        emit ReportSubmitted(reportId, msg.sender, latitudeE6, longitudeE6, damageType, photoHash);
    }

    function reportCount() external view returns (uint256) {
        return reports.length;
    }

    function getReport(uint256 reportId) external view returns (Report memory) {
        require(reportId < reports.length, "Unknown report");
        return reports[reportId];
    }
}
