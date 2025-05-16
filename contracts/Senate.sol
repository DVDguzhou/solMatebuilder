// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./CommunityTypes.sol";

/**
 * @title Senate
 * @dev 管理各类型社区的参议院
 */
contract Senate is CommunityTypes {
    struct Senator {
        address addr;
        uint256 votes;
        uint256 startTime;
        uint256 endTime;
        bool active;
    }

    struct SenateConfig {
        uint256 minPassScore;      // 通过所需的最低分数
        uint256 termDuration;      // 参议员任期（秒）
        uint256 minVotesToElect;   // 当选所需的最少票数
        uint256 maxSenators;       // 每个类型的最大参议员数量
    }

    // 每个类型的参议院配置
    mapping(Category => SenateConfig) public senateConfigs;
    
    // 每个类型的参议员列表
    mapping(Category => Senator[]) public senators;
    
    // 参议员地址到类型的映射
    mapping(address => Category) public senatorCategories;
    
    // 投票记录
    mapping(Category => mapping(address => bool)) public hasVoted;
    mapping(Category => mapping(address => address)) public votedFor;

    event SenatorElected(Category indexed category, address indexed senator);
    event SenatorRetired(Category indexed category, address indexed senator);
    event VoteCast(Category indexed category, address indexed voter, address indexed candidate);
    event MinPassScoreUpdated(Category indexed category, uint256 newScore);

    constructor() {
        _initializeSenateConfigs();
    }

    function _initializeSenateConfigs() private {
        // 为每个类型设置默认配置
        for (uint i = 0; i <= uint(Category.OTHER); i++) {
            Category cat = Category(i);
            senateConfigs[cat] = SenateConfig({
                minPassScore: 70,           // 默认通过分数为70
                termDuration: 180 days,     // 默认任期6个月
                minVotesToElect: 100,       // 默认需要100票当选
                maxSenators: 5              // 默认每个类型最多5名参议员
            });
        }
    }

    // 提名成为参议员候选人
    function nominate(Category _category) external {
        require(categoryExists[_category], "Invalid category");
        require(senatorCategories[msg.sender] == Category(0), "Already a senator");
        
        // 检查是否已经是候选人
        Senator[] storage categorySenators = senators[_category];
        for (uint i = 0; i < categorySenators.length; i++) {
            require(categorySenators[i].addr != msg.sender, "Already nominated");
        }

        // 添加新的候选人
        categorySenators.push(Senator({
            addr: msg.sender,
            votes: 0,
            startTime: 0,
            endTime: 0,
            active: false
        }));
    }

    // 为候选人投票
    function vote(Category _category, address _candidate) external {
        require(!hasVoted[_category][msg.sender], "Already voted");
        require(_candidate != msg.sender, "Cannot vote for self");
        
        Senator[] storage categorySenators = senators[_category];
        bool found = false;
        for (uint i = 0; i < categorySenators.length; i++) {
            if (categorySenators[i].addr == _candidate) {
                categorySenators[i].votes++;
                found = true;
                
                // 检查是否达到当选条件
                if (categorySenators[i].votes >= senateConfigs[_category].minVotesToElect) {
                    _electSenator(_category, i);
                }
                break;
            }
        }
        
        require(found, "Candidate not found");
        hasVoted[_category][msg.sender] = true;
        votedFor[_category][msg.sender] = _candidate;
        
        emit VoteCast(_category, msg.sender, _candidate);
    }

    // 内部函数：选举参议员
    function _electSenator(Category _category, uint256 _index) private {
        Senator storage senator = senators[_category][_index];
        require(!senator.active, "Already a senator");
        
        // 检查是否超过最大参议员数量
        uint256 activeSenators = 0;
        for (uint i = 0; i < senators[_category].length; i++) {
            if (senators[_category][i].active) {
                activeSenators++;
            }
        }
        require(activeSenators < senateConfigs[_category].maxSenators, "Max senators reached");

        // 设置参议员状态
        senator.active = true;
        senator.startTime = block.timestamp;
        senator.endTime = block.timestamp + senateConfigs[_category].termDuration;
        senatorCategories[senator.addr] = _category;

        emit SenatorElected(_category, senator.addr);
    }

    // 更新通过分数（仅限活跃参议员）
    function updateMinPassScore(Category _category, uint256 _newScore) external {
        require(isSenator(msg.sender, _category), "Not a senator");
        require(_newScore > 0 && _newScore <= 100, "Invalid score");
        
        senateConfigs[_category].minPassScore = _newScore;
        emit MinPassScoreUpdated(_category, _newScore);
    }
    
    // 更新参议员任期时间（仅限活跃参议员）
    function updateTermDuration(Category _category, uint256 _newDuration) external {
        require(isSenator(msg.sender, _category), "Not a senator");
        require(_newDuration > 0, "Invalid duration");
        
        senateConfigs[_category].termDuration = _newDuration;
    }
    
    // 更新当选所需票数（仅限活跃参议员）
    function updateMinVotesToElect(Category _category, uint256 _newMinVotes) external {
        require(isSenator(msg.sender, _category), "Not a senator");
        require(_newMinVotes > 0, "Invalid vote count");
        
        senateConfigs[_category].minVotesToElect = _newMinVotes;
    }

    // 添加参议员（仅用于测试）
    function addSenator(address _senator, Category _category) public {
        require(_senator != address(0), "Invalid senator address");
        require(senatorCategories[_senator] == Category.NONE, "Already a senator");
        
        senators[_category].push(Senator({
            addr: _senator,
            votes: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + senateConfigs[_category].termDuration,
            active: true
        }));
        
        senatorCategories[_senator] = _category;
        emit SenatorElected(_category, _senator);
    }

    // 检查是否是特定类型的参议员
    function isSenator(address _addr, Category _category) public view returns (bool) {
        Senator[] storage categorySenators = senators[_category];
        for (uint i = 0; i < categorySenators.length; i++) {
            if (categorySenators[i].addr == _addr && 
                categorySenators[i].active && 
                categorySenators[i].endTime > block.timestamp) {
                return true;
            }
        }
        return false;
    }

    // 获取活跃参议员数量
    function getActiveSenatorCount(Category _category) public view returns (uint256) {
        uint256 count = 0;
        Senator[] storage categorySenators = senators[_category];
        for (uint i = 0; i < categorySenators.length; i++) {
            if (categorySenators[i].active && categorySenators[i].endTime > block.timestamp) {
                count++;
            }
        }
        return count;
    }

    // 获取通过分数
    function getMinPassScore(Category _category) external view returns (uint256) {
        return senateConfigs[_category].minPassScore;
    }
}
