// Divvy engine: split the rent between housemates by who wants which room.
//
// Everyone says what each room is worth to them (their own price for it). Divvy
// then does two things at once:
//
//   1. Hands out the rooms so the group is happiest overall (the assignment
//      that adds up to the most "worth" across everyone).
//   2. Sets each room's share of the rent so that nobody would rather have paid
//      someone else's rent for their room instead. That last part is the point:
//      no swap makes anyone better off, so the split is one nobody can argue is
//      unfair to them. Fair-division people call this "envy-free", and the rents
//      always add back up to the real total.
//
// This is the rent version of the classic assignment problem. The rooms are
// handed out with the Hungarian algorithm (Kuhn 1955), which also hands back the
// numbers (its dual "potentials") that the envy-free rents are built from. The
// maths that this always works for the happiest assignment is Svensson (1983)
// and Alkan, Demange & Gale (Econometrica 1991); Spliddit (Gal, Mash, Procaccia
// & Zick, 2017) made it a public tool. Divvy stays in whole cents so the shares
// never drift, and it checks its own answer is envy-free before handing it back.
//
// Pure functions, no page code, so the site and `node --test` run the same logic.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Divvy = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Read a typed amount into whole cents. Accepts "1,234.50", "1.234,50",
  // "£900", "900", "900.5". Anything that isn't a non-negative number is null.
  function cents(x) {
    if (typeof x === "number") return isFinite(x) && x >= 0 ? Math.round(x * 100) : null;
    if (typeof x !== "string") return null;
    var s = x.replace(/[^\d.,-]/g, "").trim();
    if (!s) return null;
    // If both separators appear, the last one is the decimal point.
    var lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
      else s = s.replace(/,/g, "");
    } else if (lastComma >= 0) {
      // A lone comma: decimal if it looks like one (2 digits after), else thousands.
      s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
    }
    var n = parseFloat(s);
    if (!isFinite(n) || n < 0) return null;
    return Math.round(n * 100);
  }

  // Spread a whole total across n parts as evenly as possible, giving the odd
  // cents to the earliest parts. Keeps the sum exact.
  function spread(total, n) {
    var base = Math.floor(total / n), rem = total - base * n, out = [];
    for (var i = 0; i < n; i++) out.push(base + (i < rem ? 1 : 0));
    return out;
  }

  // Scale one person's bids so they add up to the rent, in whole cents. This
  // puts everyone on the same scale (what Spliddit asks people to do by hand),
  // keeping each person's relative likes and dislikes. A person who bids nothing
  // is treated as liking every room the same.
  function normalizeRow(row, rent) {
    var vals = row.map(function (v) { var c = cents(v); return c == null ? 0 : c; });
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    if (sum <= 0) return spread(rent, vals.length);
    // Scale to rent, then fix rounding so the row sums to exactly the rent.
    var scaled = vals.map(function (v) { return Math.round(v * rent / sum); });
    var drift = rent - scaled.reduce(function (a, b) { return a + b; }, 0);
    // Hand the drift to the rooms with the biggest fractional part, one cent each.
    var order = vals
      .map(function (v, j) { return { j: j, frac: (v * rent / sum) - Math.floor(v * rent / sum) }; })
      .sort(function (a, b) { return b.frac - a.frac; });
    for (var k = 0; k < Math.abs(drift); k++) scaled[order[k % order.length].j] += drift > 0 ? 1 : -1;
    return scaled;
  }

  // Hungarian algorithm (Kuhn-Munkres) for the maximum-weight perfect matching
  // of n people to n rooms. Works on integer values and also returns the dual
  // potentials a[] (per person) and b[] (per room), which satisfy
  //   a[i] + b[j] >= value[i][j] for every pair, with equality on matched pairs.
  // Those potentials are exactly what the envy-free rents are built from.
  // Implemented as a min-cost matching on the negated values (the well-known
  // O(n^3) potentials-and-augmenting-paths form), then mapped back.
  function assign(value) {
    var n = value.length;
    var INF = Infinity;
    // cost[i][j] = -value, 1-indexed with a padded row/column.
    var u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0);
    var p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
    for (var i = 1; i <= n; i++) {
      p[0] = i;
      var j0 = 0;
      var minv = new Array(n + 1).fill(INF);
      var used = new Array(n + 1).fill(false);
      do {
        used[j0] = true;
        var i0 = p[j0], delta = INF, j1 = -1;
        for (var j = 1; j <= n; j++) {
          if (!used[j]) {
            var cur = (-value[i0 - 1][j - 1]) - u[i0] - v[j];
            if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
            if (minv[j] < delta) { delta = minv[j]; j1 = j; }
          }
        }
        for (var jj = 0; jj <= n; jj++) {
          if (used[jj]) { u[p[jj]] += delta; v[jj] -= delta; }
          else minv[jj] -= delta;
        }
        j0 = j1;
      } while (p[j0] !== 0);
      do { var j2 = way[j0]; p[j0] = p[j2]; j0 = j2; } while (j0);
    }
    // p[j] = person matched to room j. Build person -> room.
    var room = new Array(n);
    for (var j = 1; j <= n; j++) room[p[j] - 1] = j - 1;
    // Potentials: u,v are for the min-cost on -value, so a = -u, b = -v give
    // a[i] + b[j] >= value[i][j] with equality on matched pairs.
    var a = [], b = [];
    for (var ii = 1; ii <= n; ii++) a.push(-u[ii]);
    for (var jj2 = 1; jj2 <= n; jj2++) b.push(-v[jj2]);
    return { room: room, a: a, b: b };
  }

  // The main call. Give it the rent and a bid per person per room (people and
  // rooms are the same count: one room each). Get back who takes which room,
  // what each pays, how good a deal each person feels they got, and whether the
  // split is envy-free.
  //
  //   solve({ rent: "2400", names: ["A","B","C"], rooms: ["Big","Mid","Small"],
  //           bids: [[1000,800,600],[900,900,600],[700,900,800]] })
  function solve(input) {
    var rent = cents(input.rent);
    if (rent == null || rent <= 0) return { error: "Put in the total rent first." };
    var names = (input.names || []).slice();
    var rooms = (input.rooms || []).slice();
    var n = Math.max(names.length, rooms.length, (input.bids || []).length);
    if (n < 2) return { error: "Add at least two people and two rooms." };
    while (names.length < n) names.push("Person " + (names.length + 1));
    while (rooms.length < n) rooms.push("Room " + (rooms.length + 1));

    // Normalize each person's bids to the rent, in cents.
    var value = [];
    for (var i = 0; i < n; i++) {
      var row = (input.bids && input.bids[i]) || [];
      while (row.length < n) row.push(0);
      value.push(normalizeRow(row.slice(0, n), rent));
    }

    var m = assign(value);

    // Room rents: b[j] plus one common shift so the rents add up to the rent.
    // The shift is the same for every room, so it never changes who envies who;
    // it only slides the whole lot to meet the real total.
    var sumB = m.b.reduce(function (x, y) { return x + y; }, 0);
    var shift = spread(rent - sumB, n); // at most a cent apart between rooms
    var price = m.b.map(function (bj, j) { return bj + shift[j]; });

    var result = [];
    for (var pi = 0; pi < n; pi++) {
      var rj = m.room[pi];
      result.push({
        name: names[pi],
        room: rooms[rj],
        roomIndex: rj,
        rent: price[rj],
        // What this person thinks the room is worth minus what they pay: their
        // "deal". A bigger number means a better deal in their own eyes.
        deal: value[pi][rj] - price[rj],
        value: value[pi][rj]
      });
    }

    // Check envy-freeness to the cent: nobody prefers another room at its rent.
    var envyFree = true, worstEnvy = 0;
    for (var x = 0; x < n; x++) {
      var mineRoom = m.room[x];
      var mineDeal = value[x][mineRoom] - price[mineRoom];
      for (var k = 0; k < n; k++) {
        var otherDeal = value[x][k] - price[k];
        var envy = otherDeal - mineDeal;
        if (envy > worstEnvy) worstEnvy = envy;
        if (envy > 1) envyFree = false; // within one cent counts as fair
      }
    }

    return {
      rent: rent,
      people: result,
      prices: price,
      rooms: rooms,
      envyFree: envyFree,
      worstEnvy: worstEnvy,
      // The spread of rents, handy for a one-line summary.
      highest: Math.max.apply(null, price),
      lowest: Math.min.apply(null, price)
    };
  }

  return { cents: cents, spread: spread, normalizeRow: normalizeRow, assign: assign, solve: solve };
});
