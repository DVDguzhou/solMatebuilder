pragma solidity ^0.8.28;
import "./interfaces/ICommunityBase.sol";
import "./interfaces/ISenate.sol";

contract RewardSystem {
    ICommunityBase public community;
    ISenate public senate;

    struct RewardRecord {
        uint256 claimedAmount;
        bool isCompleted;
    }

    mapping(uint256 => mapping(address => RewardRecord)) public rewards;

    constructor(address _community, address _senate) {
        community = ICommunityBase(_community);
        senate = ISenate(_senate);
    }

    function calculateReward(uint256 communityId, address user) public view returns (uint256) {
        ICommunityBase.Community memory c = community.getCommunity(communityId);
        uint256 totalScore = getTotalScore(communityId, user);

        if(senate.isApproved(c.senateId, totalScore)) {
            return c.rewardPerMember + c.memberDeposit;
        } else {
            return c.memberDeposit / 2;
        }
    }

    function claimReward(uint256 communityId) external {
        ICommunityBase.Community memory c = community.getCommunity(communityId);
        require(block.timestamp > c.endTime + 7 days, "Claiming not open");

        uint256 amount = calculateReward(communityId, msg.sender);
        payable(msg.sender).transfer(amount);

        rewards[communityId][msg.sender] = RewardRecord({
            claimedAmount: amount,
            isCompleted: true
        });
    }
}