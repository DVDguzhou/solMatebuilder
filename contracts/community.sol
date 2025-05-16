// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./CommunityTypes.sol";
import "./Senate.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract GoalOrientedCommunity is CommunityTypes {
    // 社区代币和质押金额
    IERC20 public communityToken;
    uint256 public constant STAKE_AMOUNT = 100 * 10**18; // 100个代币

    // reviewer相关映射
    mapping(uint256 => address[]) public reviewers; // 每个社区的reviewer列表
    mapping(uint256 => mapping(address => mapping(address => bool))) public reviewerApprovals; // 社区 => 成员 => reviewer => 是否批准
    mapping(uint256 => mapping(address => mapping(address => bool))) public hasReviewerVoted; // 社区 => 成员 => reviewer => 是否已投票
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
        bool isReviewer;       // 是否是reviewer
        bool hasVotedForClose; // 是否已经为关闭社区投票
        bool closeVote;        // 关闭社区的投票(同意/反对)
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
    event ReviewerAdded(uint256 indexed id, address indexed reviewer);
    event CloseVoteSubmitted(uint256 indexed id, address indexed member, bool vote);
    event ReviewerApproval(uint256 indexed id, address indexed reviewer, address indexed member, bool approved);

    constructor(address _senateAddress, address _tokenAddress) {
        senateContract = Senate(_senateAddress);
        communityToken = IERC20(_tokenAddress);
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

        // 质押代币
        require(communityToken.transferFrom(msg.sender, address(this), STAKE_AMOUNT), "Token transfer failed");

        members[_communityId][msg.sender] = Member({
            joinTime: block.timestamp,
            isApproved: false,
            hasClaimed: false,
            submissionUrl: "",
            finalScore: 0,
            isScored: false,
            isReviewer: false,
            hasVotedForClose: false,
            closeVote: false
        });

        memberAddresses[_communityId].push(msg.sender);
        community.totalMembers++;
        community.depositPool += msg.value;

        // 检查是否需要设置为reviewer
        if (reviewers[_communityId].length < 10) {
            members[_communityId][msg.sender].isReviewer = true;
            reviewers[_communityId].push(msg.sender);
            emit ReviewerAdded(_communityId, msg.sender);
        }

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
    // reviewer对提交进行评审
    function reviewerApprove(uint256 _communityId, address _member, bool _approved) external {
        Community storage community = communities[_communityId];
        Member storage reviewer = members[_communityId][msg.sender];
        Member storage member = members[_communityId][_member];

        require(!community.isClosed, "Community closed");
        require(reviewer.isReviewer, "Not a reviewer");
        require(bytes(member.submissionUrl).length > 0, "No submission found");
        require(!member.isScored, "Already reviewed");

        // 记录reviewer的评审结果
        reviewerApprovals[_communityId][_member][msg.sender] = _approved;
        hasReviewerVoted[_communityId][_member][msg.sender] = true;

        emit ReviewerApproval(_communityId, msg.sender, _member, _approved);

        // 检查是否达到足够的reviewer投票
        uint256 totalVotes = 0;
        uint256 approveVotes = 0;

        for (uint i = 0; i < reviewers[_communityId].length; i++) {
            if (hasReviewerVoted[_communityId][_member][reviewers[_communityId][i]]) {
                totalVotes++;
                if (reviewerApprovals[_communityId][_member][reviewers[_communityId][i]]) {
                    approveVotes++;
                }
            }
        }

        // 如果超过一半的reviewer同意
        if (totalVotes >= reviewers[_communityId].length / 2) {
            member.isScored = true;
            if (approveVotes > totalVotes / 2) {
                member.isApproved = true;
                member.finalScore = 100; // 通过即满分
            } else {
                member.finalScore = 0; // 不通过即0分
            }
        }
    }

    // 参议员抽查评分
    function senateAuditScore(
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
        require(member.isScored, "Not reviewed by reviewers yet");

        memberScores[_communityId][_member].push(Score({
            senator: msg.sender,
            score: _score,
            comment: _comment
        }));

        hasSenatorScored[_communityId][_member][msg.sender] = true;
        emit ScoreSubmitted(_communityId, _member, msg.sender, _score);
    }

    // 检查参议员的抽查评分
    function _checkSenateAuditScore(
        uint256 _communityId,
        address _member
    ) internal view returns (uint256, uint256) {
        Score[] storage scores = memberScores[_communityId][_member];
        uint256 totalScore = 0;
        uint256 validScores = 0;

        for (uint i = 0; i < scores.length; i++) {
            if (hasSenatorScored[_communityId][_member][scores[i].senator]) {
                totalScore += scores[i].score;
                validScores++;
            }
        }

        return (totalScore, validScores);
    }

    // 领取奖励
    function claimReward(uint256 _communityId) external {
        Community storage community = communities[_communityId];
        Member storage member = members[_communityId][msg.sender];

        require(!community.isClosed, "Community is closed");
        require(member.isScored, "Not reviewed yet");
        require(!member.hasClaimed, "Already claimed");
        require(member.isApproved, "Task not approved by reviewers");

        // 检查参议员的抽查评分
        (uint256 totalScore, uint256 validScores) = _checkSenateAuditScore(_communityId, msg.sender);
        
        // 如果有参议员进行了抽查,需要确保平均分也达到通过线
        if (validScores > 0) {
            uint256 avgScore = totalScore / validScores;
            require(avgScore >= community.passingScore, "Did not pass senate audit");
        }

        member.hasClaimed = true;
        uint256 reward = community.rewardPerMember;
        community.rewardPool -= reward;

        // 返还押金
        uint256 deposit = community.memberDeposit;
        community.depositPool -= deposit;

        payable(msg.sender).transfer(reward + deposit);

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
    function getScores(
        uint256 _communityId,
        address _member
    ) external view returns (Score[] memory) {
        return memberScores[_communityId][_member];
    }

    // 获取成员状态
    function getMemberStatus(
        uint256 _communityId,
        address _member
    ) external view returns (bool isScored, bool isApproved) {
        Member storage member = members[_communityId][_member];
        return (member.isScored, member.isApproved);
    }

    // 为关闭社区投票
    function voteForClose(uint256 _communityId, bool _vote) public {
        Community storage community = communities[_communityId];
        Member storage member = members[_communityId][msg.sender];
        
        require(!community.isClosed, "Already closed");
        require(member.joinTime > 0, "Not a member");
        require(!member.hasVotedForClose, "Already voted");

        member.hasVotedForClose = true;
        member.closeVote = _vote;

        emit CloseVoteSubmitted(_communityId, msg.sender, _vote);

        // 检查是否达到关闭条件
        uint256 totalVotes = 0;
        uint256 approveVotes = 0;
        
        for (uint i = 0; i < memberAddresses[_communityId].length; i++) {
            Member storage votingMember = members[_communityId][memberAddresses[_communityId][i]];
            if (votingMember.hasVotedForClose) {
                totalVotes++;
                if (votingMember.closeVote) {
                    approveVotes++;
                }
            }
        }

        // 如果2/3的人同意关闭
        if (totalVotes > 0 && (approveVotes * 3 >= totalVotes * 2)) {
            community.isClosed = true;
            _distributeRemainingFunds(_communityId);
            emit CommunityClosed(_communityId);
        }
    }

    // 分配剩余资金
    function _distributeRemainingFunds(uint256 _communityId) internal {
        Community storage community = communities[_communityId];
        uint256 totalMembers = memberAddresses[_communityId].length;
        if (totalMembers == 0) return;

        // 计算每个成员可以获得的剩余资金
        uint256 remainingRewards = community.rewardPool;
        uint256 remainingDeposits = community.depositPool;
        uint256 totalRemaining = remainingRewards + remainingDeposits;
        
        if (totalRemaining == 0) return;

        uint256 sharePerMember = totalRemaining / totalMembers;
        
        // 分配给所有成员
        for (uint i = 0; i < totalMembers; i++) {
            address memberAddr = memberAddresses[_communityId][i];
            if (!members[_communityId][memberAddr].hasClaimed) {
                payable(memberAddr).transfer(sharePerMember);
            }
        }

        // 清零资金池
        community.rewardPool = 0;
        community.depositPool = 0;
    }

    // 提议关闭社区
    function proposeCloseCommunity(uint256 _communityId) external {
        Community storage community = communities[_communityId];
        require(msg.sender == community.creator, "Only creator can propose");
        require(!community.isClosed, "Already closed");
        require(block.timestamp >= community.endTime, "Community ongoing");

        // 初始化投票
        emit CloseVoteSubmitted(_communityId, msg.sender, true);

        // 创建者自动投赞成票
        members[_communityId][msg.sender].hasVotedForClose = true;
        members[_communityId][msg.sender].closeVote = true;

        // 调用投票函数开始投票过程
        voteForClose(_communityId, true);
    }

    // 获取社区成员数量
    function getMemberCount(uint256 communityId) external view returns (uint256) {
        return memberAddresses[communityId].length;
    }
}