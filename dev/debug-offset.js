/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the MIT License.
 */

// Quick debug script to understand offset calculation differences
// Run this to see the difference between YJS XmlText and LoroText

console.log("=== YJS XmlText Behavior ===");
// Simulate what YJS XmlText does
// In YJS, XmlText has this structure: <tag>text content</tag>
// So when we insert text at the beginning, we need to account for the opening tag
// This is why we add + 1 to the offset

console.log("YJS XmlText conceptual structure:");
console.log("Position: 0 1 2 3 4 5 6 7 8 9");
console.log("Content:  < t a g > h e l l o");
console.log("          ^     ^ text starts here (position 1)");
console.log("");

console.log("=== LoroText Behavior ===");
// LoroText is just plain text, no XML structure
console.log("LoroText structure:");
console.log("Position: 0 1 2 3 4");
console.log("Content:  h e l l o");
console.log("          ^ text starts here (position 0)");
console.log("");

console.log("=== The Problem ===");
console.log("CollabTextNode.spliceText calculates: getOffset() + 1 + index");
console.log("- getOffset() returns the position of this text node within parent");
console.log("- +1 was for YJS XmlText opening tag");
console.log("- index is the position within this text node");
console.log("");
console.log("For Loro, we should use: getOffset() + index");
console.log("(no +1 because there's no XML tag to skip)");
