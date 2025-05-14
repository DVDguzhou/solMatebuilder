// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./CommunityTypes.sol";
import "./Senate.sol";

contract GoalOrientedCommunity is CommunityTypes {
    Senate public senateContract;

    // 社区状态结构体
    struct Community {
        uint256 id;
        string name;
        string description;
        address creator;
        uint256 startTime;
        uint256 endTime;
        string targetGoal;
        uint256 memberDeposit;
        uint256 rewardPerMember;
        uint256 maxMembers;
        uint256 totalMembers;
        uint256 rewardPool;
        uint256 depositPool;
        bool isClosed;
        Category category;      // 社区类型
        uint256 passingScore;  // 通过分数
    }

    // 成员状态结构体
    struct Member {
        uint256 joinTime;
        bool isApproved;
        bool hasClaimed;
        string submissionUrl;   // IPFS或其他存储的提交内容URL
        uint256 finalScore;    // 最终得分
        bool isScored;         // 是否已评分
    }

    // 评分结构体
    struct Score {
        address senator;
        uint256 score;
        string comment;
    }

    uint256 public communityCount;
    mapping(uint256 => Community) public communities;
    mapping(uint256 => mapping(address => Member)) public members;
    mapping(uint256 => address[]) public memberAddresses;
    
    // 评分记录
    mapping(uint256 => mapping(address => Score[])) public memberScores;
    mapping(uint256 => mapping(address => mapping(address => bool))) public hasSenatorScored;

    // 事件定义
    event CommunityCreated(uint256 indexed id, address creator, Category category);
    event MemberJoined(uint256 indexed id, address member);
    event SubmissionUploaded(uint256 indexed id, address member, string submissionUrl);
    event ScoreSubmitted(uint256 indexed id, address indexed member, address indexed senator, uint256 score);
    event GoalApproved(uint256 indexed id, address member);
    event RewardClaimed(uint256 indexed id, address member, uint256 amount);
    event CommunityClosed(uint256 indexed id);

    constructor(address _senateAddress) {
        senateContract = Senate(_senateAddress);
    }

    // 创建新社区
    function createCommunity(
        string memory _name,
        string memory _description,
        string memory _targetGoal,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _memberDeposit,
        uint256 _rewardPerMember,
        uint256 _maxMembers,
        Category _category
    ) external payable {
        require(_startTime > block.timestamp, "Start time must be in future");
        require(_endTime > _startTime, "End time must be after start time");
        require(_memberDeposit > 0, "Member deposit must be positive");
        require(_rewardPerMember > 0, "Reward per member must be positive");
        require(_maxMembers > 0, "Max members must be positive");
        require(msg.value >= _rewardPerMember * _maxMembers, "Insufficient reward pool");

        uint256 communityId = communityCount++;
        communities[communityId] = Community({
            id: communityId,
            name: _name,
            description: _description,
            creator: msg.sender,
            startTime: _startTime,
            endTime: _endTime,
            targetGoal: _targetGoal,
            memberDeposit: _memberDeposit,
            rewardPerMember: _rewardPerMember,
            maxMembers: _maxMembers,
            totalMembers: 0,
            rewardPool: msg.value,
            depositPool: 0,
            isClosed: false,
            category: _category,
            passingScore: senateContract.getMinPassScore(_category)
        });

        emit CommunityCreated(communityId, msg.sender, _category);
    }

    // 加入社区
    function joinCommunity(uint256 _communityId) external payable {
        Community storage community = communities[_communityId];
        require(!community.isClosed, "Community is closed");
        require(block.timestamp >= community.startTime, "Community not started");
        require(block.timestamp < community.endTime, "Community ended");
        require(community.totalMembers < community.maxMembers, "Community full");
        require(msg.value == community.memberDeposit, "Incorrect deposit amount");
        require(members[_communityId][msg.sender].joinTime == 0, "Already joined");

        members[_communityId][msg.sender] = Member({
            joinTime: block.timestamp,
            isApproved: false,
            hasClaimed: false,
            submissionUrl: "",
            finalScore: 0,
            isScored: false
        });

        memberAddresses[_communityId].push(msg.sender);
        community.totalMembers++;
        community.depositPool += msg.value;

        emit MemberJoined(_communityId, msg.sender);
    }

    // 提交目标完成证明
    function submitCompletion(
        uint256 _communityId,
        string memory _submissionUrl
    ) external {
        Community storage community = communities[_communityId];
        Member storage member = members[_communityId][msg.sender];

        require(!community.isClosed, "Community is closed");
        require(member.joinTime > 0, "Not a member");
        require(!member.isScored, "Already submitted");
        require(bytes(_submissionUrl).length > 0, "Empty submission URL");

        member.submissionUrl = _submissionUrl;
        emit SubmissionUploaded(_communityId, msg.sender, _submissionUrl);
    }

    // 参议员提交评分
    function submitScore(
        uint256 _communityId,
        address _member,
        uint256 _score,
        string memory _comment
    ) external {
        require(senateContract.isSenator(msg.sender, communities[_communityId].category),
                "Not authorized senator");
        require(_score <= 100, "Score must be between 0 and 100");
        require(!hasSenatorScored[_communityId][_member][msg.sender], "Already scored");

        Member storage member = members[_communityId][_member];
        require(bytes(member.submissionUrl).length > 0, "No submission found");

        memberScores[_communityId][_member].push(Score({
            senator: msg.sender,
            score: _score,
            comment: _comment
        }));

        hasSenatorScored[_communityId][_member][msg.sender] = true;
        
        // 计算最终得分
        if (_checkAllSenatorsScored(_communityId, _member)) {
            _calculateFinalScore(_communityId, _member);
        }

        emit ScoreSubmitted(_communityId, _member, msg.sender, _score);
    }

    // 检查是否所有参议员都已评分
    function _checkAllSenatorsScored(
        uint256 _communityId,
        address _member
    ) internal view returns (bool) {
        Community storage community = communities[_communityId];
        uint256 activeSenatorCount = senateContract.getActiveSenatorCount(community.category);
        uint256 scoredCount = 0;
        
        for (uint i = 0; i < memberScores[_communityId][_member].length; i++) {
            if (hasSenatorScored[_communityId][_member][memberScores[_communityId][_member][i].senator]) {
                scoredCount++;
            }
        }
        
        return scoredCount >= activeSenatorCount;
    }

    // 计算最终得分
    function _calculateFinalScore(uint256 _communityId, address _member) internal {
        Score[] storage scores = memberScores[_communityId][_member];
        uint256 totalScore = 0;
        uint256 validScores = 0;

        for (uint i = 0; i < scores.length; i++) {
            if (hasSenatorScored[_communityId][_member][scores[i].senator]) {
                totalScore += scores[i].score;
                validScores++;
            }
        }

        if (validScores > 0) {
            uint256 finalScore = totalScore / validScores;
            members[_communityId][_member].finalScore = finalScore;
            members[_communityId][_member].isScored = true;
            
            if (finalScore >= communities[_communityId].passingScore) {
                members[_communityId][_member].isApproved = true;
                emit GoalApproved(_communityId, _member);
            }
        }
    }

    // 领取奖励
    function claimReward(uint256 _communityId) external {
        Community storage community = communities[_communityId];
        Member storage member = members[_communityId][msg.sender];

        require(member.isApproved, "Not approved");
        require(!member.hasClaimed, "Already claimed");
        require(block.timestamp >= community.endTime || community.isClosed, "Community not ended");

        uint256 reward = community.rewardPerMember + community.memberDeposit;
        require(address(this).balance >= reward, "Insufficient contract balance");

        member.hasClaimed = true;
        community.rewardPool -= community.rewardPerMember;
        community.depositPool -= community.memberDeposit;

        payable(msg.sender).transfer(reward);
        emit RewardClaimed(_communityId, msg.sender, reward);
    }

    // 关闭社区（仅创建者）
    function closeCommunityByAuthor(uint256 _communityId) external {
        Community storage community = communities[_communityId];
        require(msg.sender == community.creator, "Not creator");
        require(!community.isClosed, "Already closed");

        community.isClosed = true;
        emit CommunityClosed(_communityId);
    }

    // 获取成员评分详情
    function getMemberScores(
        uint256 _communityId,
        address _member
    ) external view returns (Score[] memory) {
        return memberScores[_communityId][_member];
    }

    // 关闭社区并结算资金
    function closeCommunity(uint256 communityId) external {
        Community storage c = communities[communityId];
        require(msg.sender == c.creator, "Unauthorized");
        require(block.timestamp >= c.endTime, "Community ongoing");
        require(!c.isClosed, "Already closed");

        c.isClosed = true;
        
        // 将剩余资金转移给创建者
        uint256 remainingBalance = c.rewardPool + c.depositPool;
        if (remainingBalance > 0) {
            payable(c.creator).transfer(remainingBalance);
        }
        
        emit CommunityClosed(communityId);
    }

    // 获取社区成员数量
    function getMemberCount(uint256 communityId) external view returns (uint256) {
        return memberAddresses[communityId].length;
    }
}