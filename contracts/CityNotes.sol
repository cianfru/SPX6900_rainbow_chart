// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CityNotes — the noticeboard for Aeon City and Whale City.
///
/// One function, one event, no storage. A note is not saved anywhere: it is emitted as a log and
/// the chain keeps it. That is the entire point — spx6900rainbow.xyz stores nothing, hosts nothing
/// and can censor nothing. The site is a reader.
///
/// Deliberately absent, and none of it should be added later:
///   • no owner, no admin, no pause, no upgrade path — there is nothing to seize or rug
///   • no storage writes — a note costs an event emit, which is why it is cheap
///   • no payable function — this contract can never hold value, so there is nothing to steal
///   • no ownership check — the contract cannot know who holds AEON or SPX. The city decides at
///     render time which senders have a building. Anyone may write; the city shows its residents.
///
/// Consequences worth being honest about: a note is permanent. It cannot be edited or deleted by
/// anyone, including us. Posting again supersedes the previous note only by the reader's
/// convention of taking the latest per sender — the old one is still on-chain forever.
contract CityNotes {
    /// @param who   the sender; indexed so a wallet's notes can be filtered directly
    /// @param city  which city the note belongs to ("aeon" or "whale")
    /// @param text  the note itself, UTF-8
    event Note(address indexed who, string city, string text);

    error TooLong();

    /// Cap is on BYTES, not characters, and is generous: it exists to stop someone burning
    /// megabytes of calldata into the log, not to enforce house style. Length and content rules
    /// (140 characters, no links) are the reader's job — a contract cannot be re-deployed when
    /// those rules change, and they will.
    uint256 public constant MAX_BYTES = 512;

    function post(string calldata city, string calldata text) external {
        if (bytes(text).length > MAX_BYTES || bytes(city).length > 16) revert TooLong();
        emit Note(msg.sender, city, text);
    }
}
