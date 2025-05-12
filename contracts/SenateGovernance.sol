pragma solidity ^0.8.28;
import "./interfaces/ICommunityBase.sol";

contract SenateGovernance is ISenate {
    struct Senate {
        uint256 id;
        string sType;
        uint256 passingScore;
        address[] members;
        mapping(address => bool) isMember;
    }

    struct Candidate {
        address account;
        uint256 votes;
        uint256 stake;
        uint256 nominationEnd;
    }

    uint256 public senateCount;
    ICommunityBase public communityContract;

    mapping(uint256 => Senate) public senates;
    mapping(string => uint256) public typeToSenateId;
    mapping(uint256 => Candidate[]) public candidates;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    constructor(address _community) {
        communityContract = ICommunityBase(_community);
    }

    function createSenate(string memory _type, uint256 _passingScore) external {
        require(typeToSenateId[_type] == 0, "Senate exists");

        senateCount++;
        senates[senateCount] = Senate({
            id: senateCount,
            sType: _type,
            passingScore: _passingScore,
            members: new address[](0)
        });

        typeToSenateId[_type] = senateCount;
    }

    function nominate(uint256 senateId) external payable {
        require(msg.value >= 1 ether, "Minimum 1 ETH");
        candidates[senateId].push(Candidate({
            account: msg.sender,
            votes: 0,
            stake: msg.value,
            nominationEnd: block.timestamp + 7 days
        }));
    }

    function vote(uint256 senateId, uint256 candidateIndex) external {
        Candidate storage c = candidates[senateId][candidateIndex];
        require(block.timestamp < c.nominationEnd, "Voting ended");
        require(!hasVoted[senateId][msg.sender], "Already voted");

        c.votes++;
        hasVoted[senateId][msg.sender] = true;
    }

    function submitVerdict(uint256 communityId, address user, uint8 score) external override {
        ICommunityBase.Community memory c = communityContract.getCommunity(communityId);
        Senate storage s = senates[c.senateId];
        require(s.isMember[msg.sender], "Not senator");

        // 存储评分逻辑
        // ...
    }
}