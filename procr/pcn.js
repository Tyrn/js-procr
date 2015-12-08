#!/usr/bin/env node

debugger;

var __ = require('lodash');
var path = require('path');
var mt = require('mutagen');

var args = (function() {
  if(require.main !== module) return null;

  var ArgumentParser = require('argparse').ArgumentParser;
  var parser = new ArgumentParser({
    version: '0.0.1',
    addHelp: true,
    description:
      [
        'pcn "Procrustes" SmArT is a CLI utility for copying subtrees containing supported audio',
        'files in sequence, naturally sorted.',
        'The end result is a "flattened" copy of the source subtree. "Flattened" means',
        'that only a namesake of the root source directory is created, where all the files get',
        'copied to, names prefixed with a serial number. Tags "Track" and "Tracks Total"',
        'get set, tags "Artist" and "Album" can be replaced optionally.',
        'The writing process is strictly sequential: either starting with the number one file,',
        'or in the reversed order. This can be important for some mobile devices.'
      ].join(' ')
  });

  parser.addArgument(['-f', '--file-title'], {help: "use file name for title tag",
    action: 'storeTrue'});
  parser.addArgument(['-x', '--sort-lex'], {help: "sort files lexicographically",
    action: 'storeTrue'});
  parser.addArgument(['-t', '--tree-dst'], {help: "retain the tree structure of the source album at destination",
    action: 'storeTrue'});
  parser.addArgument(['-p', '--drop-dst'], {help: "do not create destination directory",
    action: 'storeTrue'});
  parser.addArgument(['-r', '--reverse'], {help: "copy files in reverse order (number one file is the last to be copied)",
    action: 'storeTrue'});
  parser.addArgument(['-e', '--file-type'], {help: "accept only audio files of the specified type"});
  parser.addArgument(['-u', '--unified-name'],
    {
      help: [
              "destination root directory name and file names are based on UNIFIED_NAME,",
              "serial number prepended, file extensions retained; also album tag,",
              "if the latter is not specified explicitly"
            ].join(' ')
    });
  parser.addArgument(['-b', '--album-num'], {help: "0..99; prepend ALBUM_NUM to the destination root directory name"});
  parser.addArgument(['-a', '--artist-tag'], {help: "artist tag name"});
  parser.addArgument(['-g', '--album-tag'], {help: "album tag name"});
  parser.addArgument(['src_dir'], {help: "source directory"});
  parser.addArgument(['dst_dir'], {help: "general destination directory"});

  var rg = parser.parseArgs();

  rg.src_dir = path.resolve(rg.src_dir);
  rg.dst_dir = path.resolve(rg.dst_dir);

  if(rg.tree_dst && rg.reverse) {
    console.log("  *** -t option ignored (conflicts with -r) ***");
    rg.tree_dst = false;
  }
  if(rg.unified_name && !rg.album_tag) {
    rg.album_tag = rg.unified_name;
  }
  return rg;
})();

var helper = exports.helper = {
  sansExt: function(pth) {
    var parts = path.parse(pth);
    return path.join(parts.dir, parts.name);
  },
  hasExtOf: function(pth, ext) {
    var parts = path.parse(pth);
    var extension = (ext === '' || ext[0] === '.') ? ext : '.' + ext;
    return parts.ext.toUpperCase() === extension.toUpperCase();
  },
};
