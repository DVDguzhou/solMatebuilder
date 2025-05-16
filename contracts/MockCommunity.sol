// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title MockCommunity
 * @dev 用于测试的模拟社区合约
 */
contract MockCommunity {
    // 成员状态映射
    mapping(uint256 => mapping(address => bool)) public memberScored;
    mapping(uint256 => mapping(address => bool)) public memberApproved;
    
    // 设置成员状态
    function setMemberStatus(uint256 _communityId, address _member, bool _isScored, bool _isApproved) external {
        memberScored[_communityId][_member] = _isScored;
        memberApproved[_communityId][_member] = _isApproved;
    }
    
    // 获取成员状态
    function getMemberStatus(uint256 _communityId, address _member) external view returns (bool isScored, bool isApproved) {
        return (memberScored[_communityId][_member], memberApproved[_communityId][_member]);
    }
}
