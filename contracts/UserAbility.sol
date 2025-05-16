// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./CommunityTypes.sol";
import "./community.sol";

/**
 * @title UserAbility
 * @dev 管理用户在不同类别任务中的能力值
 */
contract UserAbility is CommunityTypes {
    // 社区合约引用
    GoalOrientedCommunity public communityContract;
    
    // 用户能力值映射 (用户地址 => 类别 => 能力值)
    mapping(address => mapping(Category => uint256)) public abilityScores;
    
    // 用户完成的社区任务记录 (用户地址 => 社区ID => 是否已记录能力值)
    mapping(address => mapping(uint256 => bool)) public recordedCommunities;
    
    // 事件
    event AbilityScoreIncreased(address indexed user, Category indexed category, uint256 newScore);
    event CommunityCompletionRecorded(address indexed user, uint256 indexed communityId, Category category);
    
    constructor(address _communityAddress) {
        communityContract = GoalOrientedCommunity(_communityAddress);
    }
    
    /**
     * @dev 记录用户完成社区任务，增加相应类别的能力值
     * @param _communityId 社区ID
     */
    function recordCompletion(uint256 _communityId) external {
        // 检查用户是否已经记录过该社区的能力值
        require(!recordedCommunities[msg.sender][_communityId], "Ability score already recorded for this community");
        
        // 检查用户是否已完成社区任务
        (bool isScored, bool isApproved) = communityContract.getMemberStatus(_communityId, msg.sender);
        require(isScored && isApproved, "Community task not completed");
        
        // 获取社区类别
        (,,,,,,,,,,,,, , Category category,) = communityContract.communities(_communityId);
        
        // 增加用户在该类别的能力值
        abilityScores[msg.sender][category] += 1;
        
        // 标记该社区任务已记录能力值
        recordedCommunities[msg.sender][_communityId] = true;
        
        emit AbilityScoreIncreased(msg.sender, category, abilityScores[msg.sender][category]);
        emit CommunityCompletionRecorded(msg.sender, _communityId, category);
    }
    
    /**
     * @dev 获取用户在指定类别的能力值
     * @param _user 用户地址
     * @param _category 类别
     * @return 能力值
     */
    function getAbilityScore(address _user, Category _category) external view returns (uint256) {
        return abilityScores[_user][_category];
    }
    
    /**
     * @dev 获取用户在所有类别的能力值
     * @param _user 用户地址
     * @return categories 类别数组
     * @return scores 对应的能力值数组
     */
    function getAllAbilityScores(address _user) external view returns (Category[] memory categories, uint256[] memory scores) {
        // 计算用户有多少个非零能力值类别
        uint256 count = 0;
        for (uint i = 0; i <= uint(Category.OTHER); i++) {
            Category cat = Category(i);
            if (abilityScores[_user][cat] > 0) {
                count++;
            }
        }
        
        // 初始化返回数组
        categories = new Category[](count);
        scores = new uint256[](count);
        
        // 填充数组
        uint256 index = 0;
        for (uint i = 0; i <= uint(Category.OTHER); i++) {
            Category cat = Category(i);
            if (abilityScores[_user][cat] > 0) {
                categories[index] = cat;
                scores[index] = abilityScores[_user][cat];
                index++;
            }
        }
        
        return (categories, scores);
    }
    
    /**
     * @dev 检查用户是否已记录某社区的能力值
     * @param _user 用户地址
     * @param _communityId 社区ID
     * @return 是否已记录
     */
    function isCompletionRecorded(address _user, uint256 _communityId) external view returns (bool) {
        return recordedCommunities[_user][_communityId];
    }
    
    /**
     * @dev 获取用户总能力值（所有类别能力值之和）
     * @param _user 用户地址
     * @return 总能力值
     */
    function getTotalAbilityScore(address _user) external view returns (uint256) {
        uint256 total = 0;
        for (uint i = 0; i <= uint(Category.OTHER); i++) {
            Category cat = Category(i);
            total += abilityScores[_user][cat];
        }
        return total;
    }
    
    /**
     * @dev 获取用户最高能力值的类别
     * @param _user 用户地址
     * @return 类别和对应的能力值
     */
    function getTopAbility(address _user) external view returns (Category, uint256) {
        Category topCategory = Category.NONE;
        uint256 topScore = 0;
        
        for (uint i = 0; i <= uint(Category.OTHER); i++) {
            Category cat = Category(i);
            if (abilityScores[_user][cat] > topScore) {
                topScore = abilityScores[_user][cat];
                topCategory = cat;
            }
        }
        
        return (topCategory, topScore);
    }
}
