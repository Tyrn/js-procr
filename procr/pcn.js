#!/usr/bin/env node

debugger;

var __ = require('lodash');
var path = require('path');
var fs = require('fs');
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

var helper = exports.helper = (function() {
  function sansExt(pth) {
    var parts = path.parse(pth);
    return path.join(parts.dir, parts.name);
  }
  function hasExtOf(pth, ext) {
    var extension = (ext === '' || ext[0] === '.') ? ext : '.' + ext;
    return path.extname(pth).toUpperCase() === extension.toUpperCase();
  }
  function strStripNumbers(str) {
    var match = str.match(/\d+/g);
    return (match) ? match.map(__.parseInt) : match;  // null, if no digits encountered.
  }
  function arrayCmp(x, y) {
    if(x.length === 0) return (y.length === 0) ? 0 : -1;
    if(y.length === 0) return (x.length === 0) ? 0 : 1;

    for(var i = 0; x[i] === y[i]; i++) {
      if(i === x.length - 1 || i === y.length - 1) {
        // Short array is a prefix of the long one; end reached. All is equal so far.
        if(x.length === y.length) return 0;   // Long array is no longer than the short one.
        return (x.length < y.length) ? -1 : 1;
      }
    }
    // Difference encountered.
    return (x[i] < y[i]) ? -1 : 1;
  }
  function strcmp(x, y) {
    return (x < y) ? -1 : +(x > y);
  }
  function strcmpNaturally(x, y) {
    var a = strStripNumbers(x);
    var b = strStripNumbers(y);
    return (a && b) ? arrayCmp(a, b) : strcmp(x, y);
  }
  function collectDirsAndFiles(absPath, fileCondition) {
    var lst = fs.readdirSync(absPath).map(function(x) {return path.join(absPath, x)});
    var dirs = [], files = [];
    for(var i = 0; i < lst.length; i++) {
      if(fs.lstatSync(lst[i]).isDirectory()) dirs.push(lst[i]);
      else {
        if(fileCondition(lst[i])) files.push(lst[i]);
      }
    }
    return {dirs: dirs, files: files};
  }
  function fileCount(dirPath, fileCondition) {
    var cnt = 0, haul = collectDirsAndFiles(dirPath, fileCondition);
    for(var i = 0; i < haul.dirs.length; i++) {
      cnt += fileCount(haul.dirs[i], fileCondition);
    };
    for(i = 0; i < haul.files.length; i++) {
      if(fileCondition(haul.files[i])) cnt++;
    }
    return cnt;
  }
  return {
    sansExt: sansExt,
    hasExtOf: hasExtOf,
    strStripNumbers: strStripNumbers,
    arrayCmp: arrayCmp,
    strcmp: strcmp,
    strcmpNaturally: strcmpNaturally,
    collectDirsAndFiles: collectDirsAndFiles,
    fileCount: fileCount
  }
})();

var main = (function(args, helper) {
  function comparePath(xp, yp) {
    var x = helper.sansExt(xp);
    var y = helper.sansExt(yp);
    return (args.sort_lex) ? helper.strcmp(x, y) : helper.strcmpNaturally(x, y);
  }
  function compareFile(xf, yf) {
    var x = helper.sansExt(path.parse(xf).base);
    var y = helper.sansExt(path.parse(yf).base);
    return (args.sort_lex) ? helper.strcmp(x, y) : helper.strcmpNaturally(x, y);
  }
  function isAudioFile(pth) {
    if(fs.lstatSync(pth).isDirectory()) return false;
    if(['.MP3', '.M4A'].indexOf(path.extname(pth).toUpperCase()) != -1) return true;
    return false;
  }
  function listDirGroom(absPath, reverse) {
    var haul = helper.collectDirsAndFiles(absPath, isAudioFile);
    return {
      dirs: haul.dirs.sort(reverse ? function(xp, yp) {return -comparePath(xp, yp)} : comparePath),
      files: haul.files.sort(reverse ? function(xf, yf) {return -compareFile(xf, yf)} : compareFile)
    };
  }
  function decorateDirName(i, name) {
    return ('000' + i).slice(-3) + '-' + name;
  }
  function decorateFileName(cntw, i, name) {
    return ('0000' + i).slice(-4) + '-' +
            (args.unified_name ? args.unified_name + path.extname(name) : name);
  }
  function traverseFlatDst(srcDir, dstRoot, flatAcc, fcount, cntw) {
    var groom = listDirGroom(srcDir, false);
    for(var i = 0; i < groom.dirs.length; i++) {
      traverseFlatDst(groom.dirs[i], dstRoot, flatAcc, fcount, cntw);
    }
    for(i = 0; i < groom.files.length; i++) {
      var dst = path.join(dstRoot, decorateFileName(cntw, fcount[0], path.basename(groom.files[i])));
      fcount[0]++;
      flatAcc.push(dst);
    }
  }
  return {
    comparePath: comparePath,
    compareFile: compareFile,
    isAudioFile: isAudioFile,
    listDirGroom: listDirGroom,
    traverseFlatDst: traverseFlatDst
  }
})(args, helper);

if(require.main !== module) return null;  

var acc = [], fcount = [1];

var firstPassCount = helper.fileCount('/home/alexey/dir-src', main.isAudioFile);
console.log(firstPassCount);

main.traverseFlatDst('/home/alexey/dir-src', '/home/alexey/dir-dst', acc, fcount, 4);
console.log(acc);
console.log(acc.length, fcount[0]);
console.log('done');