#!/usr/bin/env node

debugger;
// Debugging in iron-node
require("fake-require-main").fakeFor(require, __filename, "electron");

var __ = require('lodash');
var path = require('path');
var fs = require('fs-extra');

/** @module args */
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
/** @module helper */
var helper = exports.helper = (function() {
  /**
   * Returns path pth with extension discarded.
   * @function sansExt
   * @param  {String} pth Path complete with extension.
   * @return {String}     Path with extension discarded.
   */
  function sansExt(pth) {
    var parts = path.parse(pth);
    return path.join(parts.dir, parts.name);
  }
  /**
   * Returns true, if extension ext is present in path ext. Extension
   * is case and leading dot insensitive.
   * @function hasExtOf
   * @param  {String}  pth Path to be checked for extension.
   * @param  {String}  ext Extension.
   * @return {Boolean}     Extension is present.
   */
  function hasExtOf(pth, ext) {
    var extension = (ext === '' || ext[0] === '.') ? ext : '.' + ext;
    return path.extname(pth).toUpperCase() === extension.toUpperCase();
  }
  /**
   * Returns an array of integers embedded in str as clusters of
   * one or more digits. Leading zeros affect no values.
   * @function strStripNumbers
   * @param  {String}  str Any string (as a file name).
   * @return {Array}       Array of integers.
   */
  function strStripNumbers(str) {
    var match = str.match(/\d+/g);
    return (match) ? match.map(__.parseInt) : match;  // null, if no digits encountered.
  }
  /**
   * Compares two arrays of integers, x and y, 'string semantics'.
   * @function arrayCmp
   * @param  {Array} x   Array of integers.
   * @param  {Array} y   Array of integers.
   * @return {Integer}   Less than zero, zero, greater than zero.
   */
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
  /**
   * String comparison, C style.
   * @function strcmp
   * @param  {String} x  String.
   * @param  {String} y  String.
   * @return {Integer}   Less than zero, zero, greater than zero.
   */
  function strcmp(x, y) {
    return (x < y) ? -1 : +(x > y);
  }
  /**
   * If both strings contain digits, returns numerical comparison based on the numeric
   * values embedded in the strings, otherwise returns the standard string comparison.
   * The idea of the natural sort as opposed to the standard lexicographic sort is one of coping
   * with the possible absence of the leading zeros in 'numbers' of files or directories.     
   * @function strcmpNaturally
   * @param  {String/Array} x String or Array of integers.
   * @param  {String/Array} y String or Array of integers.
   * @return {Integer}         Less than zero, zero, greater than zero.
   */
  function strcmpNaturally(x, y) {
    var a = strStripNumbers(x);
    var b = strStripNumbers(y);
    return (a && b) ? arrayCmp(a, b) : strcmp(x, y);
  }
  /**
   * Returns an array of directories and an array of files under absPath directory.
   * @function collectDirsAndFiles
   * @param  {String}   absPath       Parent directory.
   * @param  {Function} fileCondition File check function.
   * @return {Object}                 {dirs, files}.
   */
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
  /**
   * Counts files in a subtree according to fileCondition.
   * @function fileCount
   * @param  {String}   dirPath       Root of the subtree.
   * @param  {Function} fileCondition File check function.
   * @return {Integer}                File count.
   */
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
  /**
   * Reduces a sequence of names to initials.
   * @function makeInitials
   * @param  {String} names Space Delimited sequence of names.
   * @param  {String} sep   A period separating the initials.
   * @param  {String} trail A period ending the initials.
   * @param  {String} hyph  A hypen separating double names.
   * @return {String}       Properly formatted initials.
   */
  function makeInitials(names, sep=".", trail=".", hyph="-") {
    function splitBySpace(nm) {
      let reg = new RegExp(`[\\s${sep}]+`)
      return nm.split(reg).filter(x => x).map(x => x[0]).join(sep).toUpperCase();
    }
    function splitByHyph(nm) {
      let reg = new RegExp(`\\s*(?:${hyph}\\s*)+`)
      return nm.split(reg).map(splitBySpace).join(hyph) + trail;
    }
    let sans_monikers = names.replace(/\"(?:\\.|[^\"\\])*\"/, " ");
    return sans_monikers.split(",").map(splitByHyph).join(",");
  }
  return {
    sansExt: sansExt,
    hasExtOf: hasExtOf,
    strStripNumbers: strStripNumbers,
    arrayCmp: arrayCmp,
    strcmpNaturally: strcmpNaturally,
    collectDirsAndFiles: collectDirsAndFiles,
    fileCount: fileCount,
    makeInitials: makeInitials
  }
})();
/** @module main */
var main = (function(args, helper) {
  /**
   * Compares paths xp and yp naturally, ignoring extensions.
   * @function comparePath
   * @param  {String}  xp Path.
   * @param  {String}  yp Path.
   * @return {Integer}    Less than zero, zero, greater than zero.
   */
  function comparePath(xp, yp) {
    var x = helper.sansExt(xp);
    var y = helper.sansExt(yp);
    return (args.sort_lex) ? helper.strcmp(x, y) : helper.strcmpNaturally(x, y);
  }
  /**
   * Compares file names ignoring extensions, lexicographically or naturally.
   * @function compareFile
   * @param  {String}  xf Path.
   * @param  {String}  yf Path.
   * @return {Integer}    Less than zero, zero, greater than zero.
   */
  function compareFile(xf, yf) {
    var x = helper.sansExt(path.parse(xf).base);
    var y = helper.sansExt(path.parse(yf).base);
    return (args.sort_lex) ? helper.strcmp(x, y) : helper.strcmpNaturally(x, y);
  }
  /**
   * Checks if pth is an audio file.
   * @function isAudioFile
   * @param  {String}  pth Path.
   * @return {Boolean}     True, if pth is an audio file.
   */
  function isAudioFile(pth) {
    if(fs.lstatSync(pth).isDirectory()) return false;
    if(['.MP3', '.M4A'].indexOf(path.extname(pth).toUpperCase()) != -1) return true;
    return false;
  }
  /**
   * Sorts child directories and files of absPath, separately.
   * @function listDirGroom
   * @param  {String}  absPath Parent directory.
   * @param  {Boolean} reverse If true, sort in descending order. 
   * @return {Object}  {dirs, files}.
   */
  function listDirGroom(absPath, reverse) {
    var haul = helper.collectDirsAndFiles(absPath, isAudioFile);
    return {
      dirs: haul.dirs.sort(reverse ? function(xp, yp) {return -comparePath(xp, yp)} : comparePath),
      files: haul.files.sort(reverse ? function(xf, yf) {return -compareFile(xf, yf)} : compareFile)
    };
  }
  function zeroPad(w, i) {
    return (['ZZZ', '0', '00', '000', '0000', '00000'][w] + i).slice(-w);
  }
  function spacePad(w, i) {
    return (['ZZZ', ' ', '  ', '   ', '    ', '     '][w] + i).slice(-w);
  }
  function decorateDirName(i, name) {
    return zeroPad(3, i) + '-' + name;
  }
  function decorateFileName(cntw, i, name) {
    return zeroPad(cntw, i) + '-' +
            (args.unified_name ? args.unified_name + path.extname(name) : name);
  }
  /**
   * Recursively traverses the source directory and yields a sequence of
   * (src, flat dst) pairs in descending order; the destination directory and file names
   * get decorated according to options.
   * @function traverseFlatDstReverse
   * @param  {String}    srcDir  Source directory.
   * @param  {String}    dstRoot Destination directory.
   * @param  {Array}     flatAcc Result accumulator.
   * @param  {Array}     fcount  File counter (fcount[0]).
   * @param  {Integer}   cntw    File number width.
   * @return {Undefined}         No return value.
   */
  function traverseFlatDstReverse(srcDir, dstRoot, flatAcc, fcount, cntw) {
    var groom = listDirGroom(srcDir, true);
    for(let file of groom.files) {
      var dst = path.join(dstRoot, decorateFileName(cntw, fcount[0], path.basename(file)));
      flatAcc.push({src: file, dst: dst});
      fcount[0]--;
    }
    for(let dir of groom.dirs) {
      traverseFlatDstReverse(dir, dstRoot, flatAcc, fcount, cntw);
    }
  }
  /**
   * Recursively traverses the source directory and yields a sequence of
   * (src, dst) sorted pairs; the destination directory and file names
   * get decorated according to options; the destination directory structure is created.
   * @function traverseTreeDst
   * @param  {String}    srcDir  Source directory.
   * @param  {String}    dstRoot Destination directory.
   * @param  {Array}     flatAcc Result accumulator.
   * @param  {String}    dstStep Path to destination child directory.
   * @param  {Integer}   cntw    File number width.
   * @return {Undefined}         No return value.
   */
  function traverseTreeDst(srcDir, dstRoot, flatAcc, dstStep, cntw) {
    var step = '', groom = listDirGroom(srcDir, false);
    for(var i = 0; i < groom.dirs.length; i++) {
      step = path.join(dstStep, decorateDirName(i, path.basename(groom.dirs[i])));
      fs.mkdirSync(path.join(dstRoot, step));
      traverseTreeDst(groom.dirs[i], dstRoot, flatAcc, step, cntw);
    }
    for(i = 0; i < groom.files.length; i++) {
      var dst = path.join(dstRoot, path.join(dstStep, decorateFileName(cntw, i, path.basename(groom.files[i]))));
      flatAcc.push({src: groom.files[i], dst: dst});
    }
  }
  /**
   * Recursively traverses the source directory and yields a sequence of
   * (src, flat dst) sorted pairs; the destination directory and file names
   * get decorated according to options.
   * @function traverseFlatDist
   * @param  {String}    srcDir  Source directory.
   * @param  {String}    dstRoot Destination directory.
   * @param  {Array}     flatAcc Result accumulator.
   * @param  {Array}     fcount  File counter (fcount[0]).
   * @param  {Integer}   cntw    File number width.
   * @return {Undefined}         No return value.
   */
  function traverseFlatDst(srcDir, dstRoot, flatAcc, fcount, cntw) {
    var groom = listDirGroom(srcDir, false);
    for(let dir of groom.dirs) {
      traverseFlatDst(dir, dstRoot, flatAcc, fcount, cntw);
    }
    for(let file of groom.files) {
      var dst = path.join(dstRoot, decorateFileName(cntw, fcount[0], path.basename(file)));
      flatAcc.push({src: file, dst: dst});
      fcount[0]++;
    }
  }
  /**
   * Traverses the source directory src according to options.
   * @function groom
   * @param  {String}  src Source directory.
   * @param  {String}  dst Destination directory.
   * @param  {Integer} cnt File count.
   * @return {Array}   Array of {src, dst} pairs.
   */
  function groom(src, dst, cnt) {
    var cntw = cnt.toString().length;
    var flatAcc = [];

    if(args.tree_dst) {
      traverseTreeDst(src, dst, flatAcc, '', cntw);
    } else {
      if(args.reverse) {
        traverseFlatDstReverse(src, dst, flatAcc, [cnt], cntw);
      } else {
        traverseFlatDst(src, dst, flatAcc, [1], cntw);
      }
    }
    return flatAcc;
  }
  /**
   * Creates album according to options.
   * @function buildAlbum
   * @return {Object} {count, [{src, dst}...]}.
   */
  function buildAlbum() {
    var srcName = path.basename(args.src_dir);
    var prefix = (args.album_num) ? zeroPad(2, args.album_num) + '-' : '';
    var baseDst = prefix + (args.unified_name ? args.unified_name : srcName);
    var executiveDst = path.join(args.dst_dir, args.drop_dst ? '' : baseDst);

    if(!args.drop_dst) {
      if(fs.existsSync(executiveDst)) {
        console.log('Destination directory "' + executiveDst + '" already exists.');
        process.exit();
      } else {
        fs.mkdirSync(executiveDst);
      }
    }
    var tot = helper.fileCount(args.src_dir, isAudioFile);
    var belt = groom(args.src_dir, executiveDst, tot);
    if(!args.drop_dst && tot === 0) {
      fs.unlinkSync(executiveDst);
      console.log('There are no supported audio files in the source directory "' + args.src_dir + '".');
      process.exit();
    }
    return {count: tot, belt: belt};
  }
  /**
   * Copies album
   * @function copyAlbum
   * @return {Undefined} No return value.
   */
  function copyAlbum() {
    function copyFile(i, total, entry) {
      fs.copySync(entry.src, entry.dst);
      console.log(spacePad(4, i) + '/' + total + ' \u2665 ' + entry.dst);
    }
    var alb = buildAlbum();

    if(args.reverse) {
      for(const [i, entry] of alb.belt.entries()) {
        copyFile(alb.count - i, alb.count, entry);
      }
    } else {
      for(const [i, entry] of alb.belt.entries()) {
        copyFile(i + 1, alb.count, entry);
      }
    }
  }
  return {  
    copyAlbum: copyAlbum
  }
})(args, helper);

if(require.main === module) {
  main.copyAlbum();
}
