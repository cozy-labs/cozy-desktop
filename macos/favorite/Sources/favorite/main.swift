import Foundation

let path = CommandLine.arguments[1]
let url = NSURL(fileURLWithPath: path, isDirectory: true)
let listType = kLSSharedFileListFavoriteItems?.takeUnretainedValue()
let itemList = LSSharedFileListCreate(nil, listType, nil)?.takeUnretainedValue()
let items = LSSharedFileListCopySnapshot(itemList, nil)?.takeUnretainedValue()
let lastIndex = CFArrayGetCount(items) - 1
let lastItemPointer = CFArrayGetValueAtIndex(items, lastIndex)
let lastItem = unsafeBitCast(lastItemPointer, to: LSSharedFileListItem.self)

LSSharedFileListInsertItemURL(itemList, lastItem, nil, nil, url, nil, nil)
