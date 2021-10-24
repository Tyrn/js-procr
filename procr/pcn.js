#!/usr/bin/env node

debugger;
// Debugging in iron-node
require("fake-require-main").fakeFor(require, __filename, "electron");

const __ = require("lodash");
const path = require("path");
const fs = require("fs-extra");

/** @module args */
const args = (function () {
  if (require.main !== module) return null;

  const version = "v1.0.0";

  const ArgumentParser = require("argparse").ArgumentParser;
  const parser = new ArgumentParser({
    //version: version,
    addHelp: true,
    description: [
      'pcn "Procrustes" SmArT is a CLI utility for copying subtrees containing supported audio',
      "files in sequence, naturally sorted.",
      'The end result is a "flattened" copy of the source subtree. "Flattened" means',
      "that only a namesake of the root source directory is created, where all the files get",
      'copied to, names prefixed with a serial number. Tags "Track" and "Tracks Total"',
      'get set, tags "Artist" and "Album" can be replaced optionally.',
      "The writing process is strictly sequential: either starting with the number one file,",
      "or in the reversed order. This can be important for some mobile devices.",
    ].join(" "),
  });

  parser.addArgument(["-V", "--version"], {
    help: "package version",
    action: "version",
    version: version,
  });
  parser.addArgument(["-v", "--verbose"], {
    help: "verbose output",
    action: "storeTrue",
  });
  parser.addArgument(["-f", "--file-title"], {
    help: "use file name for title tag",
    action: "storeTrue",
  });
  parser.addArgument(["-x", "--sort-lex"], {
    help: "sort files lexicographically",
    action: "storeTrue",
  });
  parser.addArgument(["-t", "--tree-dst"], {
    help: "retain the tree structure of the source album at destination",
    action: "storeTrue",
  });
  parser.addArgument(["-p", "--drop-dst"], {
    help: "do not create destination directory",
    action: "storeTrue",
  });
  parser.addArgument(["-r", "--reverse"], {
    help:
      "copy files in reverse order (number one file is the last to be copied)",
    action: "storeTrue",
  });
  parser.addArgument(["-w", "--overwrite"], {
    help: "silently remove existing destination directory (not recommended)",
    action: "storeTrue",
  });
  parser.addArgument(["-y", "--dry-run"], {
    help: "without actually copying the files",
    action: "storeTrue",
  });
  parser.addArgument(["-i", "--prepend-subdir-name"], {
    help: "prepend current subdirectory name to a file name",
    action: "storeTrue",
  });
  parser.addArgument(["-e", "--file-type"], {
    help: "accept only audio files of the specified type",
  });
  parser.addArgument(["-u", "--unified-name"], {
    help: [
      "destination root directory name and file names are based on UNIFIED_NAME,",
      "serial number prepended, file extensions retained; also album tag,",
      "if the latter is not specified explicitly",
    ].join(" "),
  });
  parser.addArgument(["-b", "--album-num"], {
    help: "0..99; prepend ALBUM_NUM to the destination root directory name",
  });
  parser.addArgument(["-a", "--artist-tag"], { help: "artist tag name" });
  parser.addArgument(["-g", "--album-tag"], { help: "album tag name" });
  parser.addArgument(["src_dir"], { help: "source directory" });
  parser.addArgument(["dst_dir"], { help: "general destination directory" });

  const rg = parser.parseArgs();

  rg.src_dir = path.resolve(rg.src_dir);
  rg.dst_dir = path.resolve(rg.dst_dir);

  if (rg.unified_name && !rg.album_tag) {
    rg.album_tag = rg.unified_name;
  }
  return rg;
})();
/** @module helper */
const helper = (exports.helper = (function () {
  /**
   * Returns path pth with extension discarded.
   * @function sansExt
   * @param  {String} pth Path complete with extension.
   * @return {String}     Path with extension discarded.
   */
  function sansExt(pth) {
    const parts = path.parse(pth);
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
    const extension = ext === "" || ext[0] === "." ? ext : "." + ext;
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
    const match = str.match(/\d+/g);
    return match ? match.map(__.parseInt) : match; // null, if no digits encountered.
  }
  /**
   * Compares two arrays of integers, x and y, 'string semantics'.
   * @function arrayCmp
   * @param  {Array} x   Array of integers.
   * @param  {Array} y   Array of integers.
   * @return {Integer}   Less than zero, zero, greater than zero.
   */
  function arrayCmp(x, y) {
    if (x.length === 0) return y.length === 0 ? 0 : -1;
    if (y.length === 0) return x.length === 0 ? 0 : 1;

    for (var i = 0; x[i] === y[i]; i++) {
      if (i === x.length - 1 || i === y.length - 1) {
        // Short array is a prefix of the long one; end reached. All is equal so far.
        if (x.length === y.length) return 0; // Long array is no longer than the short one.
        return x.length < y.length ? -1 : 1;
      }
    }
    // Difference encountered.
    return x[i] < y[i] ? -1 : 1;
  }
  /**
   * String comparison, C style.
   * @function strcmp
   * @param  {String} x  String.
   * @param  {String} y  String.
   * @return {Integer}   Less than zero, zero, greater than zero.
   */
  function strcmp(x, y) {
    return x < y ? -1 : +(x > y);
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
    const a = strStripNumbers(x);
    const b = strStripNumbers(y);
    return a && b ? arrayCmp(a, b) : strcmp(x, y);
  }
  /**
   * Returns an array of directories and an array of files under absPath directory.
   * @function collectDirsAndFiles
   * @param  {String}   absPath       Parent directory.
   * @param  {Function} fileCondition File check function.
   * @return {Object}                 {dirs, files}.
   */
  function collectDirsAndFiles(absPath, fileCondition) {
    const lst = fs.readdirSync(absPath);
    const dirs = [],
      files = [];
    for (const entry of lst) {
      if (fs.lstatSync(path.join(absPath, entry)).isDirectory())
        dirs.push(entry);
      else {
        if (fileCondition(path.join(absPath, entry))) files.push(entry);
      }
    }
    return { dirs: dirs, files: files };
  }
  /**
   * Counts files in a subtree according to fileCondition.
   * @function fileCount
   * @param  {String}   dirPath       Root of the subtree.
   * @param  {Function} fileCondition File check function.
   * @return {Integer}                File count.
   */
  function fileCount(dirPath, fileCondition) {
    let cnt = 0,
      haul = collectDirsAndFiles(dirPath, fileCondition);
    for (const dir of haul.dirs) {
      cnt += fileCount(path.join(dirPath, dir), fileCondition);
    }
    for (const file of haul.files) {
      if (fileCondition(path.join(dirPath, file))) cnt++;
    }
    return cnt;
  }
  /**
   * Reduces a sequence of names to initials.
   * @function makeInitials
   * @param  {String} authors A comma-delimited list of authors.
   * @param  {String} sep     A period separating the initials.
   * @param  {String} trail   A period ending the initials.
   * @param  {String} hyph    A hyphen separating double-barrelled names.
   * @return {String}         Properly formatted initials.
   */
  function makeInitials(authors, sep = ".", trail = ".", hyph = "-") {
    const rDot = new RegExp(`[\\s${sep}]+`);
    return authors
      .replace(/\"(?:\\.|[^\"\\])*\"/g, " ")
      .replaceAll('"', " ")
      .split(",")
      .filter((author) =>
        author.replaceAll(sep, "").replaceAll(hyph, "").trim()
      )
      .map(
        (author) =>
          author
            .split(hyph)
            .filter((barrel) => barrel.replaceAll(sep, "").trim())
            .map((barrel) =>
              barrel
                .split(rDot)
                .filter((name) => name)
                .map((name) => name[0])
                .join(sep)
                .toUpperCase()
            )
            .join(hyph) + trail
      )
      .join(",");
  }
  return {
    sansExt: sansExt,
    hasExtOf: hasExtOf,
    strStripNumbers: strStripNumbers,
    arrayCmp: arrayCmp,
    strcmpNaturally: strcmpNaturally,
    collectDirsAndFiles: collectDirsAndFiles,
    fileCount: fileCount,
    makeInitials: makeInitials,
  };
})());
/** @module main */
const main = (function (args, helper) {
  /**
   * Compares paths xp and yp naturally, ignoring extensions.
   * @function comparePath
   * @param  {String}  xp Path.
   * @param  {String}  yp Path.
   * @return {Integer}    Less than zero, zero, greater than zero.
   */
  function comparePath(xp, yp) {
    const x = helper.sansExt(xp);
    const y = helper.sansExt(yp);
    return args.sort_lex ? helper.strcmp(x, y) : helper.strcmpNaturally(x, y);
  }
  /**
   * Compares file names ignoring extensions, lexicographically or naturally.
   * @function compareFile
   * @param  {String}  xf Path.
   * @param  {String}  yf Path.
   * @return {Integer}    Less than zero, zero, greater than zero.
   */
  function compareFile(xf, yf) {
    const x = helper.sansExt(path.parse(xf).base);
    const y = helper.sansExt(path.parse(yf).base);
    return args.sort_lex ? helper.strcmp(x, y) : helper.strcmpNaturally(x, y);
  }
  /**
   * Checks if pth is an audio file.
   * @function isAudioFile
   * @param  {String}  pth Path.
   * @return {Boolean}     True, if pth is an audio file.
   */
  function isAudioFile(pth) {
    if (fs.lstatSync(pth).isDirectory()) return false;
    if (
      [".MP3", ".M4A", ".M4B", ".OGG", ".WMA", ".FLAC"].indexOf(
        path.extname(pth).toUpperCase()
      ) != -1
    )
      return true;
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
    const haul = helper.collectDirsAndFiles(absPath, isAudioFile);
    return {
      dirs: haul.dirs.sort(
        reverse ? (xp, yp) => -comparePath(xp, yp) : comparePath
      ),
      files: haul.files.sort(
        reverse ? (xf, yf) => -compareFile(xf, yf) : compareFile
      ),
    };
  }
  function zeroPad(w, i) {
    return (["ZZZ", "0", "00", "000", "0000", "00000"][w] + i).slice(-w);
  }
  function spacePad(w, i) {
    return (["ZZZ", " ", "  ", "   ", "    ", "     "][w] + i).slice(-w);
  }
  function decorateDirName(i, name) {
    return zeroPad(3, i) + "-" + name;
  }
  function decorateFileName(cntw, i, dstStep, name) {
    const prefix =
      zeroPad(cntw, i) +
      (args.prepend_subdir_name && !args.tree_dst && dstStep.length > 0
        ? "-[" + dstStep.join("^") + "]-"
        : "-");
    return (
      prefix +
      (args.unified_name ? args.unified_name + path.extname(name) : name)
    );
  }
  /**
   * Recursively traverses the source directory and yields a sequence of
   * (src, dst) sorted pairs; the destination directory and file names
   * get decorated according to options; the destination directory structure is created.
   * @function walkFileTree
   * @param  {String}    srcDir  Source directory.
   * @param  {String}    dstRoot Destination directory.
   * @param  {String}    dstStep Path to destination child directory.
   * @param  {Array}     fcount  File counter (fcount[0]).
   * @param  {Integer}   cntw    File number width.
   * @return {Undefined}         No return value.
   */
  function* walkFileTree(srcDir, dstRoot, dstStep, fcount, cntw) {
    const groom = listDirGroom(srcDir, args.reverse);

    function* dirFlat(dirs) {
      for (const dir of dirs) {
        const step = [...dstStep];
        step.push(path.basename(dir));
        yield* walkFileTree(
          path.join(srcDir, dir),
          dstRoot,
          step,
          fcount,
          cntw
        );
      }
    }
    function* fileFlat(files) {
      for (const file of files) {
        const tgt = decorateFileName(
          cntw,
          fcount[0],
          dstStep,
          path.basename(file)
        );
        yield {
          index: fcount[0],
          src: path.join(srcDir, file),
          dst_path: dstRoot,
          target: tgt,
        };
        fcount[0] += args.reverse ? -1 : 1;
      }
    }
    function reverse(i, lst) {
      return args.reverse ? lst.length - i : i + 1;
    }
    function* dirTree(dirs) {
      for (const [i, dir] of dirs.entries()) {
        const step = [...dstStep];
        step.push(decorateDirName(reverse(i, dirs), path.basename(dir)));
        yield* walkFileTree(
          path.join(srcDir, dir),
          dstRoot,
          step,
          fcount,
          cntw
        );
      }
    }
    function* fileTree(files) {
      for (const [i, file] of files.entries()) {
        const dst = path.join(dstRoot, ...dstStep);
        const tgt = decorateFileName(
          cntw,
          reverse(i, files),
          dstStep,
          path.basename(file)
        );
        yield {
          index: fcount[0],
          src: path.join(srcDir, file),
          dst_path: dst,
          target: tgt,
        };
        fcount[0] += args.reverse ? -1 : 1;
      }
    }
    const [dirFund, fileFund] = args.tree_dst
      ? [dirTree, fileTree]
      : [dirFlat, fileFlat];
    if (args.reverse) {
      yield* fileFund(groom.files);
      yield* dirFund(groom.dirs);
    } else {
      yield* dirFund(groom.dirs);
      yield* fileFund(groom.files);
    }
  }
  /**
   * Creates album according to options.
   * @function buildAlbum
   * @return {Object} {count, [{src, dst}...]}.
   */
  function buildAlbum() {
    const srcName = path.basename(args.src_dir);
    const prefix = args.album_num ? zeroPad(2, args.album_num) + "-" : "";
    const baseDst = prefix + (args.unified_name ? args.unified_name : srcName);
    const executiveDst = path.join(args.dst_dir, args.drop_dst ? "" : baseDst);

    if (!args.drop_dst && !args.dry_run) {
      if (fs.existsSync(executiveDst)) {
        if (args.overwrite) {
          try {
            fs.rmdirSync(executiveDst, { recursive: true });
          } catch (err) {
            console.error(`Failed to remove "${executive_dst}".`);
            process.exit();
          }
        } else {
          console.log(
            'Destination directory "' + executiveDst + '" already exists.'
          );
          process.exit();
        }
        fs.mkdirSync(executiveDst);
      }
    }
    const tot = helper.fileCount(args.src_dir, isAudioFile);
    if (!args.drop_dst && tot === 0) {
      fs.unlinkSync(executiveDst);
      console.log(
        'There are no supported audio files in the source directory "' +
          args.src_dir +
          '".'
      );
      process.exit();
    }
    return {
      count: tot,
      belt: walkFileTree(
        args.src_dir,
        executiveDst,
        [],
        [args.reverse ? tot : 1],
        tot.toString().length
      ),
    };
  }
  /**
   * Copies album
   * @function copyAlbum
   * @return {Undefined} No return value.
   */
  function copyAlbum() {
    function copyFile(total, entry) {
      const dst = path.join(entry.dst_path, entry.target);
      if (!args.dry_run) {
        if (!fs.existsSync(entry.dst_path)) {
          fs.mkdirSync(entry.dst_path, {
            recursive: true,
          });
        }
        fs.copySync(entry.src, dst);
      }
      if (args.verbose) {
        console.log(
          spacePad(4, entry.index) + "/" + total + " \u{1f509} " + dst
        );
      } else {
        process.stdout.write(".");
      }
    }
    const alb = buildAlbum();

    if (!args.verbose) {
      process.stdout.write("Starting ");
    }
    for (const entry of alb.belt) {
      copyFile(alb.count, entry);
    }
    if (!args.verbose) {
      process.stdout.write(` Done (${alb.count}).\n`);
    }
  }
  return {
    copyAlbum: copyAlbum,
  };
})(args, helper);

if (require.main === module) {
  main.copyAlbum();
}
