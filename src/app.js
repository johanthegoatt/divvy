// Divvy page. Holds the rooms and people, draws the inputs, runs the engine
// and shows the split. All the sums live in engine.js; this file is only the
// page. Nothing is sent anywhere: the share link keeps everything in the part
// of the URL after '#', which browsers never send to a server.
(function () {
  "use strict";
  var E = window.Divvy, N = window.Nook;
  var $ = function (id) { return document.getElementById(id); };

  var rentEl = $("rent"), roomsEl = $("rooms"), peopleEl = $("people");
  var resultEl = $("result"), splitEl = $("split"), verdictEl = $("verdict"), saidEl = $("said");
  var tplRoom = $("tpl-room").content, tplPerson = $("tpl-person").content;

  // State: room names, and a person per entry with a bid per room.
  var rooms = [];      // ["Big room", ...]
  var people = [];     // [{ name, bids: ["800", ...] }]

  function money(cents) {
    var neg = cents < 0; cents = Math.abs(cents);
    var s = (cents / 100).toFixed(2).replace(/\.00$/, "");
    return (neg ? "-" : "") + s;
  }

  function renderRooms() {
    roomsEl.textContent = "";
    rooms.forEach(function (name, i) {
      var node = tplRoom.cloneNode(true);
      var input = node.querySelector(".room-name");
      input.value = name;
      input.placeholder = "Room " + (i + 1);
      input.addEventListener("input", function () { rooms[i] = input.value; renderPeople(); });
      node.querySelector(".room-del").addEventListener("click", function () {
        rooms.splice(i, 1);
        people.forEach(function (p) { p.bids.splice(i, 1); });
        renderRooms(); renderPeople();
      });
      roomsEl.appendChild(node);
    });
  }

  function renderPeople() {
    peopleEl.textContent = "";
    people.forEach(function (person, pi) {
      while (person.bids.length < rooms.length) person.bids.push("");
      var node = tplPerson.cloneNode(true);
      var nameEl = node.querySelector(".person-name");
      nameEl.value = person.name;
      nameEl.placeholder = "Person " + (pi + 1);
      nameEl.addEventListener("input", function () { person.name = nameEl.value; });
      node.querySelector(".person-del").addEventListener("click", function () {
        people.splice(pi, 1); renderPeople();
      });

      var bidsEl = node.querySelector(".bids");
      rooms.forEach(function (roomName, ri) {
        var wrap = document.createElement("label");
        wrap.className = "bid";
        var span = document.createElement("span");
        span.textContent = roomName || ("Room " + (ri + 1));
        var inWrap = document.createElement("span");
        inWrap.className = "wrap";
        var cur = document.createElement("span");
        cur.className = "cur"; cur.textContent = "$";
        var input = document.createElement("input");
        input.type = "text"; input.inputMode = "decimal"; input.className = "bid-in";
        input.value = person.bids[ri] || "";
        input.placeholder = "0";
        input.addEventListener("input", function () { person.bids[ri] = input.value; updateSum(node, person); });
        inWrap.appendChild(cur); inWrap.appendChild(input);
        wrap.appendChild(span); wrap.appendChild(inWrap);
        bidsEl.appendChild(wrap);
      });

      updateSum(node, person);
      peopleEl.appendChild(node);
    });
  }

  function updateSum(node, person) {
    var sumEl = node.querySelector(".person-sum");
    var rent = E.cents(rentEl.value);
    var sum = person.bids.reduce(function (a, b) { var c = E.cents(b); return a + (c || 0); }, 0);
    if (sum === 0) { sumEl.textContent = "Leave these blank and they'll like every room the same."; sumEl.classList.remove("off"); return; }
    var txt = "Adds up to $" + money(sum);
    if (rent && Math.abs(sum - rent) > 100) {
      txt += " (the rent is $" + money(rent) + ", but that's fine)";
      sumEl.classList.remove("off");
    } else { sumEl.classList.remove("off"); }
    sumEl.textContent = txt;
  }

  function addRoom(name) { rooms.push(name || ""); renderRooms(); renderPeople(); }
  function addPerson(name) { people.push({ name: name || "", bids: rooms.map(function () { return ""; }) }); renderPeople(); }

  function run() {
    var rent = E.cents(rentEl.value);
    if (!rent) { N.context("worried"); N.react("worried"); N.say("Put in the total rent first.", 5000); rentEl.focus(); return; }
    if (people.length !== rooms.length) {
      N.context("worried"); N.react("worried");
      N.say("You need the same number of people and rooms, one each. Right now it's " + people.length + " and " + rooms.length + ".", 6000);
      return;
    }
    if (people.length < 2) { N.context("worried"); N.react("worried"); N.say("Add at least two people and two rooms.", 5000); return; }

    var out = E.solve({
      rent: rentEl.value,
      names: people.map(function (p, i) { return (p.name || "").trim() || ("Person " + (i + 1)); }),
      rooms: rooms.map(function (r, i) { return (r || "").trim() || ("Room " + (i + 1)); }),
      bids: people.map(function (p) { return p.bids.slice(); })
    });
    if (out.error) { N.context("worried"); N.react("worried"); N.say(out.error, 5000); return; }

    showResult(out);
    N.context("done"); N.react("done");
  }

  function dealWord(deal) {
    // How Divvy describes the deal, in plain words, from the person's own view.
    if (deal > 3000) return "a great deal for them";
    if (deal > 500) return "a good deal for them";
    if (deal >= -500) return "about right for them";
    return "a fair price for them";
  }

  function showResult(out) {
    splitEl.textContent = "";
    out.people.forEach(function (p) {
      var li = document.createElement("li");
      var main = document.createElement("div");
      main.className = "s-main";
      var who = document.createElement("div"); who.className = "s-who"; who.textContent = p.name;
      var room = document.createElement("div"); room.className = "s-room"; room.textContent = "takes " + p.room;
      var deal = document.createElement("div"); deal.className = "s-deal"; deal.textContent = dealWord(p.deal);
      main.appendChild(who); main.appendChild(room); main.appendChild(deal);
      var rent = document.createElement("div"); rent.className = "s-rent"; rent.textContent = "$" + money(p.rent);
      li.appendChild(main); li.appendChild(rent);
      splitEl.appendChild(li);
    });
    if (out.envyFree) {
      verdictEl.className = "verdict ok";
      verdictEl.textContent = "Everyone is glad of their own room at this price. Nobody would rather pay what someone else pays for their room.";
    } else {
      verdictEl.className = "verdict";
      verdictEl.textContent = "This is the closest fair split for these bids.";
    }
    resultEl.classList.remove("hidden");
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
    writeLink();
  }

  function copyText() {
    var rent = E.cents(rentEl.value);
    var lines = ["Here's the rent split ($" + money(rent) + " total):"];
    [].forEach.call(splitEl.children, function (li) {
      var who = li.querySelector(".s-who").textContent;
      var room = li.querySelector(".s-room").textContent;
      var pay = li.querySelector(".s-rent").textContent;
      lines.push("- " + who + " " + room + ": " + pay);
    });
    lines.push("Worked out so everyone's happy with their own room. (Divvy)");
    navigator.clipboard.writeText(lines.join("\n")).then(function () { N.react("copied"); });
  }

  // ---- share link (everything in the URL fragment) ----
  function writeLink() {
    try {
      var data = { r: rentEl.value, rm: rooms, p: people.map(function (x) { return { n: x.name, b: x.bids }; }) };
      var packed = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      history.replaceState(null, "", "#" + packed);
    } catch (e) { /* ignore */ }
  }
  function copyLink() { writeLink(); navigator.clipboard.writeText(location.href).then(function () { N.react("link"); }); }

  function readLink() {
    if (!location.hash || location.hash.length < 2) return false;
    try {
      var s = location.hash.slice(1).replace(/-/g, "+").replace(/_/g, "/");
      var data = JSON.parse(decodeURIComponent(escape(atob(s))));
      if (!data || !Array.isArray(data.rm) || !Array.isArray(data.p)) return false;
      rentEl.value = String(data.r || "");
      rooms = data.rm.map(function (x) { return String(x || "").slice(0, 24); }).slice(0, 10);
      people = data.p.map(function (x) {
        return { name: String((x && x.n) || "").slice(0, 24), bids: ((x && x.b) || []).map(function (y) { return String(y || "").slice(0, 12); }) };
      }).slice(0, 10);
      return rooms.length > 0 && people.length > 0;
    } catch (e) { return false; }
  }

  function example() {
    rentEl.value = "2400";
    rooms = ["Big room with the ensuite", "Middle room", "Small room"];
    people = [
      { name: "Alex", bids: ["1100", "800", "500"] },
      { name: "Sam", bids: ["950", "900", "550"] },
      { name: "Jo", bids: ["800", "850", "750"] }
    ];
    renderRooms(); renderPeople();
    N.context("bids");
    N.say("Three housemates, one nicer room. Tap Work out the split.", 6000);
  }

  // ---- wire up ----
  rentEl.addEventListener("input", function () { [].forEach.call(peopleEl.children, function (node, i) { updateSum(node, people[i]); }); });
  $("add-room").addEventListener("click", function () { addRoom(""); N.context("start"); });
  $("add-person").addEventListener("click", function () { addPerson(""); N.context("bids"); });
  $("go").addEventListener("click", run);
  $("example").addEventListener("click", example);
  $("copy").addEventListener("click", copyText);
  $("share").addEventListener("click", copyLink);
  rentEl.addEventListener("focus", function () { N.context("start"); });

  // Start: from a shared link, or a sensible blank setup.
  if (readLink()) { renderRooms(); renderPeople(); N.context("bids"); }
  else {
    rooms = ["Room 1", "Room 2"];
    people = [{ name: "", bids: ["", ""] }, { name: "", bids: ["", ""] }];
    renderRooms(); renderPeople();
    N.context("start");
  }
})();
