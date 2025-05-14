// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title CommunityTypes
 * @dev 定义社区类型和基础接口
 */
contract CommunityTypes {
    // 社区类型枚举
    enum Category {
        MUSIC,      // 音乐
        ART,        // 艺术
        SPORTS,     // 运动
        EDUCATION,  // 教育
        TECHNOLOGY, // 技术
        OTHER       // 其他
    }

    // 存储所有已注册的社区类型
    mapping(uint256 => string) public categoryNames;
    mapping(Category => bool) public categoryExists;
    
    constructor() {
        _initializeCategories();
    }

    function _initializeCategories() private {
        categoryNames[uint256(Category.MUSIC)] = "Music";
        categoryNames[uint256(Category.ART)] = "Art";
        categoryNames[uint256(Category.SPORTS)] = "Sports";
        categoryNames[uint256(Category.EDUCATION)] = "Education";
        categoryNames[uint256(Category.TECHNOLOGY)] = "Technology";
        categoryNames[uint256(Category.OTHER)] = "Other";

        for (uint i = 0; i <= uint(Category.OTHER); i++) {
            categoryExists[Category(i)] = true;
        }
    }

    function getCategoryName(Category _category) public view returns (string memory) {
        require(categoryExists[_category], "Category does not exist");
        return categoryNames[uint256(_category)];
    }
}
