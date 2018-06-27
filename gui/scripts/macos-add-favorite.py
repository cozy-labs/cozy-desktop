#!/usr/bin/python

from Cocoa import NSURL
from CoreFoundation import CFArrayGetCount, CFArrayGetValueAtIndex, kCFAllocatorDefault
from Foundation import NSBundle
from LaunchServices import kLSSharedFileListFavoriteItems
from objc import loadBundleFunctions
from sys import argv

# For some reason, these functions cannot be imported directly and must be
# manually loaded from the SharedFileList bundle
SFL_bundle = NSBundle.bundleWithIdentifier_('com.apple.coreservices.SharedFileList')
functions = [
    ('LSSharedFileListCreate', '^{OpaqueLSSharedFileListRef=}^{__CFAllocator=}^{__CFString=}@'),
    ('LSSharedFileListCopySnapshot', '^{__CFArray=}^{OpaqueLSSharedFileListRef=}o^I'),
    ('LSSharedFileListInsertItemURL', '^{OpaqueLSSharedFileListItemRef=}^{OpaqueLSSharedFileListRef=}^{OpaqueLSSharedFileListItemRef=}^{__CFString=}^{OpaqueIconRef=}^{__CFURL=}^{__CFDictionary=}^{__CFArray=}'),
    ('kLSSharedFileListItemBeforeFirst', '^{OpaqueLSSharedFileListItemRef=}'),
]
loadBundleFunctions(SFL_bundle, globals(), functions)

# The path to added to the Finder's favorites
path = argv[1]

# Make it an URL object (which is a valid favorite item)
item = NSURL.alloc().initFileURLWithPath_(path)

# Retrieve the favorite items list
favorite_items = LSSharedFileListCreate(kCFAllocatorDefault,
                                        kLSSharedFileListFavoriteItems, None)

# Add the item to the top of the list
LSSharedFileListInsertItemURL(favorite_items, kLSSharedFileListItemBeforeFirst,
                              None, None, item, None, None)
