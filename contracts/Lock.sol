// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./community.sol";

contract Lock {
    IERC20 public stakingToken;
    GoalOrientedCommunity public communityContract;

    // 用户质押记录
    struct StakeInfo {
        uint256 communityId;
        uint256 amount;
        uint256 timestamp;
    }

    mapping(address => StakeInfo) public stakes;

    event TokensStaked(address indexed user, uint256 indexed communityId, uint256 amount);
    event TokensUnstaked(address indexed user, uint256 indexed communityId, uint256 amount);

    constructor(address _tokenAddress, address _communityAddress) {
        stakingToken = IERC20(_tokenAddress);
        communityContract = GoalOrientedCommunity(_communityAddress);
    }

    // 质押代币
    function stake(uint256 _communityId, uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than 0");
        require(stakes[msg.sender].amount == 0, "Already staked");

        require(stakingToken.transferFrom(msg.sender, address(this), _amount), "Transfer failed");

        stakes[msg.sender] = StakeInfo({
            communityId: _communityId,
            amount: _amount,
            timestamp: block.timestamp
        });

        emit TokensStaked(msg.sender, _communityId, _amount);
    }

    // 取回质押的代币
    function unstake() external {
        StakeInfo storage stakeInfo = stakes[msg.sender];
        require(stakeInfo.amount > 0, "No stake found");

        // 检查用户是否完成了社区任务
        (, bool isApproved) = communityContract.getMemberStatus(stakeInfo.communityId, msg.sender);
        require(isApproved, "Task not completed");

        uint256 amount = stakeInfo.amount;
        uint256 communityId = stakeInfo.communityId;

        delete stakes[msg.sender];

        require(stakingToken.transfer(msg.sender, amount), "Transfer failed");

        emit TokensUnstaked(msg.sender, communityId, amount);
    }
}
