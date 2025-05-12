pragma solidity ^0.8.28;

import "./interfaces/ICommunityBase.sol";
import "./interfaces/ISenate.sol";

contract CommunityBase is ICommunityBase {
    uint256 public communityCount;
    mapping(uint256 => Community) public communities;
    mapping(uint256 => mapping(address => bool)) public members;

    ISenate public senateContract;

    event CommunityCreated(uint256 indexed id, address creator);
    event MemberJoined(uint256 indexed id, address member);

    constructor(address _senate) {
        senateContract = ISenate(_senate);
    }

    function createCommunity(
        string memory _name,
        string memory _type,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _deposit,
        uint256 _reward,
        uint256 _maxMembers
    ) external payable {
        // 参数校验与资金处理
        require(_startTime > block.timestamp, "Invalid start");
        require(msg.value == _reward * _maxMembers, "Incorrect funds");

        // 创建社区
        communityCount++;
        communities[communityCount] = Community({
            id: communityCount,
            name: _name,
            cType: _type,
            senateId: senateContract.getSenateId(_type),
            creator: msg.sender,
            startTime: _startTime,
            endTime: _endTime,
            memberDeposit: _deposit,
            rewardPerMember: _reward,
            maxMembers: _maxMembers,
            totalMembers: 0,
            rewardPool: msg.value,
            depositPool: 0
        });

        emit CommunityCreated(communityCount, msg.sender);
    }

    function joinCommunity(uint256 id) external payable {
        Community storage c = communities[id];
        require(block.timestamp < c.startTime, "Already started");
        require(msg.value == c.memberDeposit, "Deposit mismatch");

        members[id][msg.sender] = true;
        c.depositPool += msg.value;
        c.totalMembers++;

        emit MemberJoined(id, msg.sender);
    }
}