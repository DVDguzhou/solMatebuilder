// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./CommunityTypes.sol";
import "./Senate.sol";

/**
 * @title SubmissionManager
 * @dev 管理社区成员提交的内容和评分
 */
contract SubmissionManager is CommunityTypes {
    Senate public senateContract;

    struct Submission {
        address member;
        uint256 communityId;
        string contentUrl;
        uint256 submitTime;
        bool isScored;
        uint256 finalScore;
        Category category;
    }

    // 提交记录
    mapping(uint256 => mapping(address => Submission)) public submissions;
    
    // 评分记录
    mapping(uint256 => mapping(address => mapping(address => uint256))) public senatorScores;
    mapping(uint256 => mapping(address => address[])) public submissionScorers;

    event SubmissionCreated(uint256 indexed communityId, address indexed member, string contentUrl);
    event ScoreSubmitted(uint256 indexed communityId, address indexed member, address indexed senator, uint256 score);
    event FinalScoreCalculated(uint256 indexed communityId, address indexed member, uint256 finalScore);

    constructor(address _senateAddress) {
        senateContract = Senate(_senateAddress);
    }

    // 提交内容
    function submitContent(
        uint256 _communityId,
        string memory _contentUrl,
        Category _category
    ) external {
        require(bytes(_contentUrl).length > 0, "Content URL cannot be empty");
        require(!submissions[_communityId][msg.sender].isScored, "Already submitted and scored");

        submissions[_communityId][msg.sender] = Submission({
            member: msg.sender,
            communityId: _communityId,
            contentUrl: _contentUrl,
            submitTime: block.timestamp,
            isScored: false,
            finalScore: 0,
            category: _category
        });

        emit SubmissionCreated(_communityId, msg.sender, _contentUrl);
    }

    // 参议员提交评分
    function submitScore(
        uint256 _communityId,
        address _member,
        uint256 _score
    ) external {
        Submission storage submission = submissions[_communityId][_member];
        require(submission.submitTime > 0, "Submission not found");
        require(!submission.isScored, "Already scored");
        require(_score <= 100, "Score must be between 0 and 100");
        Category submissionCategory = submissions[_communityId][_member].category;
        require(senateContract.isSenator(msg.sender, submissionCategory), "Not authorized senator");
        require(senatorScores[_communityId][_member][msg.sender] == 0, "Already scored by this senator");

        senatorScores[_communityId][_member][msg.sender] = _score;
        submissionScorers[_communityId][_member].push(msg.sender);

        emit ScoreSubmitted(_communityId, _member, msg.sender, _score);

        // 检查是否所有参议员都已评分
        if (_checkAllSenatorsScored(_communityId, _member)) {
            _calculateFinalScore(_communityId, _member);
        }
    }

    // 检查是否所有参议员都已评分
    function _checkAllSenatorsScored(
        uint256 _communityId,
        address _member
    ) internal view returns (bool) {
        Category category = submissions[_communityId][_member].category;
        uint256 activeSenatorCount = senateContract.getActiveSenatorCount(category);
        return submissionScorers[_communityId][_member].length >= activeSenatorCount;
    }

    // 计算最终得分
    function _calculateFinalScore(uint256 _communityId, address _member) internal {
        address[] storage scorers = submissionScorers[_communityId][_member];
        uint256 totalScore = 0;
        
        for (uint i = 0; i < scorers.length; i++) {
            totalScore += senatorScores[_communityId][_member][scorers[i]];
        }

        uint256 finalScore = totalScore / scorers.length;
        submissions[_communityId][_member].finalScore = finalScore;
        submissions[_communityId][_member].isScored = true;

        emit FinalScoreCalculated(_communityId, _member, finalScore);
    }

    // 获取提交内容的最终得分
    function getFinalScore(
        uint256 _communityId,
        address _member
    ) external view returns (uint256, bool) {
        Submission storage submission = submissions[_communityId][_member];
        return (submission.finalScore, submission.isScored);
    }

    // 获取特定参议员的评分
    function getSenatorScore(
        uint256 _communityId,
        address _member,
        address _senator
    ) external view returns (uint256) {
        return senatorScores[_communityId][_member][_senator];
    }
}
