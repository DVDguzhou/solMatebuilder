// ICommunityBase.sol
pragma solidity ^0.8.28;

interface ICommunityBase {
    struct Community {
        uint256 id;
        string name;
        string cType;
        uint256 senateId;
        address creator;
        uint256 startTime;
        uint256 endTime;
        uint256 memberDeposit;
        uint256 rewardPerMember;
        uint256 maxMembers;
        uint256 totalMembers;
        uint256 rewardPool;
        uint256 depositPool;
    }

    function getCommunity(uint256 id) external view returns (Community memory);
    function isMember(uint256 id, address user) external view returns (bool);
}

// ISenate.sol
pragma solidity ^0.8.0;

interface ISenate {
    function submitVerdict(uint256 communityId, address user, uint8 score) external;
    function getPassingScore(uint256 senateId) external view returns (uint256);
    function isApproved(uint256 senateId, uint256 totalScore) external view returns (bool);
    function recordVote(uint256 senateId, address voter) external;
}