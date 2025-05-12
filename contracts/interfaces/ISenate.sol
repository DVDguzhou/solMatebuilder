// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// 接口定义
interface ISenate {
    function submitVerdict(uint256 communityId, address user, uint8 score) external;
    function getPassingScore(uint256 senateId) external view returns (uint256);
    function isApproved(uint256 senateId, uint256 totalScore) external view returns (bool);
}