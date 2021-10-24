var assert = require("assert");

var pcn = require("../procr/pcn");
var helper = pcn.helper;

describe("helper", function () {
  describe(".sansExt(path)", function () {
    it("returns path with file extension dropped", function () {
      assert.equal(
        "/alfa/bra.vo/masha",
        helper.sansExt("/alfa/bra.vo/masha.txt")
      );
      assert.equal(
        helper.sansExt("/alfa/bravo/charlie.dat"),
        "/alfa/bravo/charlie"
      );
      // assert.equal(helper.sansExt(""), "");
      assert.equal(
        helper.sansExt("/alfa/bravo/charlie"),
        "/alfa/bravo/charlie"
      );
      assert.equal(
        helper.sansExt("/alfa/bravo/charlie/"),
        "/alfa/bravo/charlie"
      );
      assert.equal(
        helper.sansExt("/alfa/bra.vo/charlie.dat"),
        "/alfa/bra.vo/charlie"
      );
    });
  });
});

describe("helper", function () {
  describe(".hasExtOf(path, ext)", function () {
    it("returns true, if path ends with ext", function () {
      assert.equal(true, helper.hasExtOf("/alfa/bra.vo/masha.TXT", ".txt"));
      assert.equal(true, helper.hasExtOf("/alfa/bra.vo/masha.txt", "TxT"));
      assert.equal(true, helper.hasExtOf("/alfa/bra.vo/masha", ""));
      assert.equal(true, helper.hasExtOf("/alfa/bra.vo/masha.", "."));
    });
  });
});

describe("helper", function () {
  describe(".strStripNumbers(str)", function () {
    it("returns an array of numbers embedded in str", function () {
      assert.deepEqual([13, 4, 8, 11], helper.strStripNumbers("13uk4_8pz11n"));
      assert.deepEqual(null, helper.strStripNumbers("Mocha"));
    });
  });
});

describe("helper", function () {
  describe(".arrayCmp(x, y)", function () {
    it('compares arrays of integers using "string semantics"', function () {
      assert.equal(helper.arrayCmp([], [8]), -1);
      assert.equal(helper.arrayCmp([], []), 0);
      assert.equal(helper.arrayCmp([1], []), 1);
      assert.equal(helper.arrayCmp([3], []), 1);
      assert.equal(helper.arrayCmp([1, 2, 3], [1, 2, 3, 4, 5]), -1);
      assert.equal(helper.arrayCmp([1, 4], [1, 4, 16]), -1);
      assert.equal(helper.arrayCmp([2, 8], [2, 2, 3]), 1);
      assert.equal(helper.arrayCmp([0, 0, 2, 4], [0, 0, 15]), -1);
      assert.equal(helper.arrayCmp([0, 13], [0, 2, 2]), 1);
      assert.equal(helper.arrayCmp([11, 2], [11, 2]), 0);
    });
  });
});

describe("helper", function () {
  describe(".strcmpNaturally(x, y)", function () {
    it('compares strings "naturally" with respect to embedded numbers', function () {
      assert.equal(1, helper.strcmpNaturally("zulu", "charlie"));
      assert.equal(0, helper.strcmpNaturally("", ""));
      assert.equal(0, helper.strcmpNaturally("Grima", "Grima"));
      assert.equal(-1, helper.strcmpNaturally("2a", "10a"));
      assert.equal(-1, helper.strcmpNaturally("alfa", "bravo"));
    });
  });
});

// There are four delimiters: comma, hyphen, dot, and space. makeInitials()
// syntax philosophy: if a delimiter is misplaced, it's ignored.
describe("helper", function () {
  describe(".makeInitials(name)", function () {
    it("reduces a string of names to initials", function () {
      assert.equal(helper.makeInitials(""), "");
      assert.equal(helper.makeInitials(" "), "");
      assert.equal(helper.makeInitials(".. , .. "), "");
      assert.equal(helper.makeInitials(" ,, .,"), "");
      assert.equal(helper.makeInitials(", a. g, "), "A.G.");
      assert.equal(
        helper.makeInitials("- , -I.V.-A,E.C.N-, ."),
        "I.V-A.,E.C.N."
      );
      assert.equal(helper.makeInitials(""), "");
      assert.equal(
        helper.makeInitials("John ronald reuel Tolkien"),
        "J.R.R.T."
      );
      assert.equal(helper.makeInitials("e. B. Sledge"), "E.B.S.");
      assert.equal(helper.makeInitials("Apsley Cherry-Garrard"), "A.C-G.");
      assert.equal(
        helper.makeInitials("Windsor Saxe-\tCoburg - Gotha"),
        "W.S-C-G."
      );
      assert.equal(helper.makeInitials("Elisabeth Kubler-- - Ross"), "E.K-R.");
      assert.equal(helper.makeInitials('Arleigh "31-knot"Burke '), "A.B.");
      assert.equal(
        helper.makeInitials("Fitz-Simmons   Ashton-Burke Leigh"),
        "F-S.A-B.L."
      );
      assert.equal(
        helper.makeInitials('Harry "Bing" Crosby, Kris "Tanto" Paronto'),
        "H.C.,K.P."
      );
      assert.equal(
        helper.makeInitials(
          'William J. "Wild Bill" Donovan, Marta "Cinta Gonzalez'
        ),
        "W.J.D.,M.C.G."
      );
      assert.equal(helper.makeInitials("a.s , - . ,b.s."), "A.S.,B.S.");
      assert.equal(
        helper.makeInitials("A. Strugatsky, B...Strugatsky. "),
        "A.S.,B.S."
      );
      assert.equal(
        helper.makeInitials("Иржи Кропачек,, Йозеф Новотный"),
        "И.К.,Й.Н."
      );
      assert.equal(helper.makeInitials("Österreich über alles"), "Ö.Ü.A.");
    });
  });
});
