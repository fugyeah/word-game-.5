// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract WordGame {
    using SafeMath for uint256;

    address public owner;
    address[] public players;
    uint256 public costToPlay;
    AggregatorV3Interface private priceFeed;
    string private lastWord;
    uint256 private lastUpdateTime;
    uint256 private dailyPot;
    address private creatorsFund;

    mapping(string => bool) private wordsSubmitted;
    mapping(address => uint256) private playerScores;
    mapping(address => mapping(string => bool)) private playerWordHistory;
    mapping(bytes1 => uint256) private letterScores; // Map to store the scores of individual letters

    constructor(address _priceFeed, address _creatorsFund) {
        owner = msg.sender;
        costToPlay = .005 ether;
        priceFeed = AggregatorV3Interface(_priceFeed);
        creatorsFund = _creatorsFund;
        lastUpdateTime = block.timestamp;
        lastWord = "MATIC";

        // Initialize the letter scores
        bytes1[6] memory vowels = [bytes1("A"), "E", "I", "O", "U", "Y"];
        bytes1[4] memory specialCharacters = [bytes1("Q"), "Z", "X", "J"];
        for(uint256 i = 0; i < 6; i++) {
            letterScores[vowels[i]] = 2;
        }
        for(uint256 i = 0; i < 4; i++) {
            letterScores[specialCharacters[i]] = 3;
        }
    }

    function submitWord(string memory word) public payable {
        require(msg.value >= costToPlay, "Insufficient payment");
        require(validateWord(word), "Invalid word");

        uint256 score = 0;
        if (!wordsSubmitted[word]) {
            // Only calculate score if word hasn't been submitted before
            score = calculateScore(word);
            wordsSubmitted[word] = true;
            playerWordHistory[msg.sender][word] = true;
        }

        playerScores[msg.sender] += score;
        dailyPot += msg.value;

        uint256 previousCostToPlay = costToPlay;
        costToPlay = costToPlay * 102 / 100;

        lastWord = word;
        lastUpdateTime += 2 hours;

        if (block.timestamp >= lastUpdateTime + 86400) {
            endGame();
        }
    }

    function endGame() private {
        lastWord = "MATIC";
        lastUpdateTime = block.timestamp;
        // Reset all player scores and words
        for (uint i=0; i<players.length; i++) {
            playerScores[players[i]] = 0;
            delete playerWordHistory[players[i]];
        }
        delete wordsSubmitted;
    }

    function calculateScore(string memory word) public view returns (uint256 score) {
        uint256 wordLength = bytes(word).length;

        for (uint256 i = 0; i < wordLength; i++) {
            bytes1 letter = bytes(word)[i];
            if (letterScores[letter] > 0) {
                score += letterScores[letter];
            } else {
                score += 1;  // Every other letter is worth 1 point
            }
        }

        return score;
    }

    function validateWord(string memory word) private view returns (bool) {
        // Validate word length
        if (bytes(word).length < 3 || bytes(word).length > 10) return false;

        // Validate first letter matches last letter of previous word
        if (bytes(word)[0] != bytes(lastWord)[bytes(lastWord).length - 1]) return false;

        return true;
    }

    /**
     * @notice Allows the contract owner to withdraw the contract balance.
     */
    function withdraw() public {
        require(msg.sender == owner, "Not the contract owner");
        payable(owner).transfer(address(this).balance);
    }

    /**
     * @notice Returns the current cost to play the game as a string.
     * @return costToPlayString The cost to play as a string.
     */
    function getCostToPlay() public view returns (string memory costToPlayString) {
        return Strings.toString(costToPlay);
    }

    /**
     * @notice Returns the current daily pot as a string.
     * @return dailyPotString The daily pot as a string.
     */
    function getDailyPot() public view returns (string memory dailyPotString) {
        return Strings.toString(dailyPot);
    }

    /**
     * @notice Returns the time left in seconds before the game automatically resets.
     * @return timeLeft The time left before the game resets.
     */
    function getTimeLeft() public view returns (uint256 timeLeft) {
        if (block.timestamp >= lastUpdateTime + 86400) {
            return 0;
        } else {
            return lastUpdateTime + 86400 - block.timestamp;
        }
    }

    /**
     * @notice Returns the latest Ethereum price using the Chainlink price feed.
     * @return ethPrice The latest Ethereum price.
     */
    function getEthPrice() public view returns (uint256) {
        (, int256 price, , , ) = priceFeed.latestRoundData();
        return uint256(price);
    }
}
