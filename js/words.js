// js/words.js
// SPELL RUNNER word pools and word picker (WP-A).
// Defines TG.Words: POOLS, SAMPLES, ADJACENT, createPicker, has, validate.
//
// Contract: docs/CONTRACT.md section 4.6. Design: docs/DESIGN.md section 10 and Appendix A.
//
// This is a simulation module: no Math.random, no Date, no timers, no DOM. All randomness comes
// from the generator that is passed to createPicker. Other modules (TG.C, TG.Difficulty) are looked
// up inside functions, never when the file loads.
//
// Rules for every word (DESIGN 10.1): lowercase a to z only, no word in more than one list, no word
// that is spelled differently in British and American English, nothing rude or upsetting. The words
// added by WP-A are base forms: no plurals and no verb forms made with -s, -ed or -ing.
(function (root) {
  'use strict';
  var TG = root.TG = root.TG || {};

  // ---------------------------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------------------------

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function isNumber(v) {
    return typeof v === 'number' && !isNaN(v);
  }

  function warn(message) {
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
      console.warn(message);
    }
  }

  // Joins its arguments (strings of words separated by spaces) into one frozen array of words.
  function list() {
    var words = [];
    for (var i = 0; i < arguments.length; i++) {
      var parts = String(arguments[i]).split(/\s+/);
      for (var j = 0; j < parts.length; j++) {
        if (parts[j]) words.push(parts[j]);
      }
    }
    return Object.freeze(words);
  }

  // ---------------------------------------------------------------------------------------------
  // Pools
  // ---------------------------------------------------------------------------------------------

  // The five pools of a difficulty, in the order used for reports.
  var POOL_KEYS = ['1', '2', '3', 'boss', 'finisher'];
  var THREAT_TIERS = ['1', '2', '3'];

  // Word length of each pool (DESIGN 10.2).
  var RANGES = {
    easy:   { 1: [2, 5], 2: [3, 4], 3: [3, 5],  boss: [4, 6],  finisher: [6, 7] },
    medium: { 1: [4, 5], 2: [5, 6], 3: [6, 8],  boss: [7, 9],  finisher: [10, 11] },
    hard:   { 1: [5, 7], 2: [7, 9], 3: [8, 11], boss: [9, 12], finisher: [13, 15] }
  };

  var HOME_ROW = 'asdfghjkl';
  var EASY_TIER2_SET = 'asdfghjkleirtou';     // home row plus E I R T O U

  var MIN_TIER_WORDS = 45;                    // every threat tier has at least this many words
  var MIN_FIRST_LETTERS = 8;                  // every pool has at least this many different first letters

  // The word arrays are frozen. The objects that hold them are not, so that a word flavour can be
  // added: POOLS.easy.flavour.cavern = { 1: [...], 2: [...], 3: [...] }.
  var POOLS = {
    easy: {
      1: list(
        // DESIGN Appendix A
        'as ad ah ha add ads ash ask all dad fad gag gal gas had has jag lad lag sad sag aha adds',
        'asks alas dash fall flag glad hall half hash lash sash saga gala lads dads lass shall',
        'flash flask glass salad slash salsa halls falls flags'
      ),
      2: list(
        // DESIGN Appendix A
        'red rat eat tea sit set let leg jet jog dog fog log hot hat hit hug rug dig kid lid oak',
        'oil out toe tie sea ear egg fur jar jug kit frog goat toad hare deer seal tree leaf lake',
        'hill road gate kite fire fish star rose tail gold joke ride sail dust',
        // added by WP-A
        'art air age elf elk eel fig fir hog hut oar oat old use tag tug jig ski odd dot ark idea',
        'iris isle area desk dish door dusk east edge foal food foot fork fort gift girl goal',
        'hair herd hero hike hoof hour jade lark raft reed reef roof seed sled soil surf tide',
        'tusk'
      ),
      3: list(
        // DESIGN Appendix A
        'cat bat bee bug cow cub van web zoo box fox yak map mud net nut pan pen pig pup sun win',
        'yes ant owl hen bird bear boat bone book cake camp cave coin corn crab crow duck drum',
        'farm hawk lamb lion mole moon moth nest pony pond swan wasp wolf worm bunny camel mouse',
        'snake zebra puppy',
        // added by WP-A
        'den dew elm emu gem hay ivy paw sky zip arch claw dove exit fawn fern gnat hive inch',
        'jazz kiwi lynx mist moss newt oven pear plum quiz rope snow twig vase wren wool yarn',
        'zone amber bison comet daisy finch gecko heron hippo jelly lemon llama moose onion panda',
        'pearl piano quail raven robin skunk sunny tulip windy'
      ),
      boss: list(
        // DESIGN Appendix A
        'jump leap zoom vine root quick brave magic power storm giant crown spark blaze flame',
        'frost stone thorn grove woods maple cedar acorn berry honey petal bloom creek brook',
        'cheer smile happy lucky shiny swift fuzzy jolly proud clever mighty burrow shovel helmet'
      ),
      finisher: list(
        // DESIGN Appendix A
        'forest meadow garden spring hooray winner bright friend victory',
        // added by WP-A
        'sunrise blossom harvest freedom sparkle golden wonder superb heroic joyous delight',
        'welcome perfect sunbeam'
      ),
      flavour: {}
    },
    medium: {
      1: list(
        // DESIGN Appendix A
        'back ball barn bell blue bowl bush calm city clap coat cold cook dawn deep draw drop',
        'easy face find flip game glow hand help home hope keep kind king land milk mind path',
        'rain wind apple beach bread chair climb cloud dance dream earth field fruit grass green',
        'heart horse house light music night ocean plant river sheep sleep sound water world',
        // added by WP-A
        'chef join lamp name nice note open park play sing song soup swim team tent town walk',
        'wish yard year table tiger today train truck uncle under visit voice young juice knock',
        'koala eagle early otter goose grape laugh money north nurse paint party ready snack',
        'spoon story sugar watch white candy clock fresh hello'
      ),
      2: list(
        // DESIGN Appendix A
        'brush chalk chest lunch match peach shark shell shirt teeth thumb whale wheel thing',
        'animal basket better bottle bridge butter button candle castle cherry circle cookie',
        'corner dinner dragon family farmer finger flower follow ground hammer island jacket',
        'jungle kitten ladder letter little market middle mirror monkey number orange parrot',
        'pencil pepper planet pocket rabbit ribbon rocket shadow silver spider stream summer',
        'sunset tunnel turtle valley window winter yellow',
        // added by WP-A
        'arrow bunch chick chirp dress fetch fifth hobby kitty merry month ninth offer patch',
        'shake shelf shout silly think throw teddy upper whirl whisk school shower shield thirty',
        'thread throne thrush cheese bubble puddle giggle pebble kettle nettle pillow willow',
        'carrot mitten muffin puffin coffee juggle wobble funnel narrow'
      ),
      3: list(
        // DESIGN Appendix A
        'puzzle zipper wizard frozen jigsaw quartz oxygen galaxy amazing balloon blanket captain',
        'chimney compass crystal diamond dolphin explore feather giraffe holiday journey kingdom',
        'kitchen lantern library machine mystery octopus penguin picture pumpkin quarter quickly',
        'rainbow science thunder village volcano weather whisper mixture example blizzard',
        'squirrel question mosquito exercise keyboard backpack elephant mountain sandwich',
        'dinosaur sunshine triangle umbrella treasure notebook',
        // added by WP-A
        'jaguar jersey joyful jingle jumble squash squeak square breeze bronze lizard excite',
        'expand expect expert liquid unique sneeze freeze snooze journal justice quality banquet',
        'bouquet conquer request sequoia grizzly drizzle pretzel sixteen explain express extreme',
        'mailbox toolbox maximum complex exactly project majesty aquatic citizen aquarium',
        'equation frequent squiggle jamboree junction magazine exchange explorer textbook',
        'foxglove tranquil quantity joystick excavate'
      ),
      boss: list(
        // DESIGN Appendix A
        'monster warrior courage bravery triumph champion creature fearless fortress guardian',
        'gigantic powerful strength thousand together tomorrow defender skeleton adventure',
        'beautiful butterfly challenge chocolate crocodile dangerous different discovery',
        'excellent fantastic furniture important invisible knowledge lightning orchestra',
        'pineapple rectangle signature telephone vegetable wonderful yesterday hurricane monocle',
        'molehill'
      ),
      finisher: list(
        // DESIGN Appendix A
        'tremendous strawberry basketball playground remarkable watermelon lighthouse helicopter',
        'earthquake everything trampoline incredible spectacular celebration imagination',
        'magnificent',
        // added by WP-A
        'friendship masterpiece outstanding sensational triumphant victorious courageous',
        'unbeatable springtime excitement hummingbird wonderland countryside grasshopper'
      ),
      flavour: {}
    },
    hard: {
      1: list(
        // DESIGN Appendix A
        'abyss azure bayou blitz brisk cache chasm civic crypt dwarf epoch fjord gauze glyph',
        'gnome gusto havoc ivory jaunt joust kayak kiosk knack lyric mauve nexus nymph optic',
        'oxide pixel plaza proxy quake qualm query quest queue quill quirk quota rhyme squid',
        'topaz tweak unzip vague vivid waltz wharf wrist yacht zesty zephyr zigzag zodiac quiver',
        'sphinx rhythm jockey hybrid hazard gazebo frenzy enzyme dazzle cobweb bypass buzzer',
        'bazaar abrupt awkward equinox exhibit jackpot jukebox squeeze',
        // added by WP-A
        'icicle kernel magpie nutmeg osprey thwart toucan tuxedo vortex walrus whimsy yonder',
        'squawk quench axolotl buzzard croquet cyclone dwindle eyebrow foxtrot fuchsia haywire',
        'hexagon iceberg jawbone kestrel kumquat lexicon lullaby mystify nomadic octagon ostrich',
        'pharaoh quibble skylark twelfth unravel vibrant voyager whisker wrinkle zealous'
      ),
      2: list(
        // DESIGN Appendix A, without "blackjack" (a gambling game; DESIGN 10.1 asks for words suitable
        // for a child). Reported in the WP-A hand-over.
        'acquire alchemy anxious archive bizarre boycott buoyant calypso cryptic dynasty eclipse',
        'equator exhaust fixture gazelle glimpse gymnast horizon hydrant hygiene jasmine javelin',
        'jubilee juniper kinetic lozenge mammoth oblique orchard paradox phoenix plywood pyramid',
        'quantum rhubarb squeaky synonym texture trapeze typhoon zoology abstract zeppelin',
        'zucchini buzzword chipmunk flapjack jeopardy junkyard knapsack mnemonic puzzling',
        'quagmire quadrant quixotic rhapsody squabble squadron symphony quotient obsidian',
        'avalanche labyrinth mezzanine xylophone',
        // added by WP-A
        'aardvark barnacle bluebell bookworm chestnut cinnamon daffodil dormouse envelope',
        'flamingo gargoyle hedgehog hyacinth kangaroo lavender mulberry nuthatch parakeet',
        'platypus porpoise reindeer sapphire shamrock sycamore toboggan tortoise twilight',
        'unicycle vineyard wisteria artichoke bumblebee buttercup chameleon crossword dandelion',
        'dragonfly earthworm grapevine honeycomb horseshoe jellyfish marmalade nightfall',
        'partridge porcupine quizzical raspberry scarecrow snowflake tangerine telescope',
        'toadstool yardstick zookeeper'
      ),
      3: list(
        // DESIGN Appendix A
        'vanquish rhythmic algorithm boulevard chrysalis dehydrate exquisite juxtapose mythology',
        'pneumatic technique whirlwind zoologist sovereign quicksand whimsical ephemeral',
        'threshold hydraulic squeamish accomplish apocalypse bankruptcy blacksmith camouflage',
        'chandelier cyberspace exaggerate excavation hieroglyph hypothesis mozzarella phenomenon',
        'playwright psychology quarantine rendezvous rhinoceros silhouette stalactite turbulence',
        'ubiquitous vocabulary wavelength zigzagging bewildering catastrophe equilibrium fluorescent',
        'unequivocal',
        // added by WP-A
        'jubilant pendulum cylinder mystique wizardry keepsake limerick nautilus symmetry',
        'amphibian astronomy bamboozle boomerang carnivore celestial centipede conundrum',
        'crescendo dexterity evergreen fledgling gibberish gyroscope harlequin',
        'herbivore hibernate intricate menagerie nocturnal parchment quadruple',
        'scavenger sculpture semicolon tarantula turquoise acrobatics aquamarine',
        'chimpanzee cornucopia crustacean embroidery equestrian flamboyant gargantuan gymnastics',
        'hullabaloo hypotenuse illuminate iridescent jackrabbit kingfisher kookaburra lumberjack',
        'meticulous nasturtium paintbrush peppercorn periwinkle salamander sketchbook snapdragon',
        'somersault stalagmite tambourine tumbleweed wanderlust watercress wilderness woodpecker'
      ),
      boss: list(
        // DESIGN Appendix A
        'supernova whirlpool invincible juggernaut razzmatazz skyscraper mastermind hypersonic',
        'quizmaster abracadabra acknowledge cataclysmic choreograph flabbergast hallucinate',
        'mischievous pandemonium quadrillion quicksilver unbreakable unstoppable xylophonist',
        'nightingale thunderbolt',
        'breakthrough conquistador cryptography electrifying extinguisher hippopotamus',
        'idiosyncrasy impenetrable kaleidoscope lexicography onomatopoeia overwhelming',
        'pyrotechnics sledgehammer wholehearted ambidextrous stratosphere',
        // added by WP-A
        'spellbinding swashbuckler thunderclap formidable legendary steadfast adventurous',
        'unwavering resilient undefeated'
      ),
      finisher: list(
        // DESIGN Appendix A
        'extraordinary thunderstruck indestructible unquestionable kaleidoscopic quintessential',
        'uncompromising transformation congratulations metamorphosis unconquerable tyrannosaurus',
        'hydroelectric perpendicular chrysanthemum phosphorescent whippersnapper',
        // added by WP-A
        'unforgettable determination constellation accomplishment interplanetary knowledgeable',
        'mountaineering quadrilateral ventriloquist indescribable straightforward sportsmanship'
      ),
      flavour: {}
    }
  };

  var SAMPLES = {
    easy: ['ask', 'frog', 'puppy'],
    medium: ['river', 'bridge', 'rainbow'],
    hard: ['zephyr', 'labyrinth', 'silhouette']
  };

  // QWERTY neighbours of each letter: the keys to its left and right in the same row and the keys
  // that touch it in the row above and the row below.
  var ADJACENT = {
    q: 'wa',     w: 'qase',   e: 'wsdr',   r: 'edft',   t: 'rfgy',   y: 'tghu',   u: 'yhji',
    i: 'ujko',   o: 'iklp',   p: 'ol',
    a: 'qwsz',   s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb', j: 'huikmn',
    k: 'jiolm',  l: 'kop',
    z: 'asx',    x: 'zsdc',   c: 'xdfv',   v: 'cfgb',   b: 'vghn',   n: 'bhjm',   m: 'njk'
  };

  // ---------------------------------------------------------------------------------------------
  // Reading the pools
  // ---------------------------------------------------------------------------------------------

  function pools() {
    return (TG.Words && TG.Words.POOLS) || POOLS;
  }

  function isWordList(v) {
    return Array.isArray(v);
  }

  // Calls fn(words, poolKey, flavourName) for every list of one difficulty: the five pools, then the
  // tier lists of every flavour. flavourName is null for the five pools.
  function eachList(set, fn) {
    var i, k;
    for (i = 0; i < POOL_KEYS.length; i++) {
      k = POOL_KEYS[i];
      if (isWordList(set[k])) fn(set[k], k, null);
    }
    var flavour = set.flavour;
    if (!flavour || typeof flavour !== 'object') return;
    var names = Object.keys(flavour).sort();
    for (i = 0; i < names.length; i++) {
      var lists = flavour[names[i]];
      if (!lists || typeof lists !== 'object') continue;
      for (var t = 0; t < THREAT_TIERS.length; t++) {
        k = THREAT_TIERS[t];
        if (isWordList(lists[k])) fn(lists[k], k, names[i]);
      }
    }
  }

  // True if the word is in any pool of that difficulty, flavour lists included.
  function has(difficultyName, word) {
    var all = pools();
    if (typeof difficultyName !== 'string' || !hasOwn(all, difficultyName)) return false;
    if (typeof word !== 'string' || word === '') return false;
    var found = false;
    eachList(all[difficultyName], function (words) {
      if (!found && words.indexOf(word) !== -1) found = true;
    });
    return found;
  }

  // ---------------------------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------------------------

  function onlyLetters(word, letters) {
    for (var i = 0; i < word.length; i++) {
      if (letters.indexOf(word.charAt(i)) === -1) return false;
    }
    return true;
  }

  function hasLetterOutside(word, letters) {
    for (var i = 0; i < word.length; i++) {
      if (letters.indexOf(word.charAt(i)) === -1) return true;
    }
    return false;
  }

  // Problems found in POOLS; empty when valid (CONTRACT 4.6).
  function validate() {
    var problems = [];
    var all = pools();
    var seen = {};                 // word -> name of the first list it was found in
    var names = Object.keys(RANGES);

    for (var d = 0; d < names.length; d++) {
      var diff = names[d];
      var set = all[diff];
      if (!set || typeof set !== 'object') {
        problems.push(diff + ': the pools are missing');
        continue;
      }
      for (var p = 0; p < POOL_KEYS.length; p++) {
        if (!isWordList(set[POOL_KEYS[p]])) problems.push(diff + '.' + POOL_KEYS[p] + ': the pool is missing');
      }

      eachList(set, function (words, key, flavourName) {
        var where = diff + '.' + (flavourName === null ? key : 'flavour.' + flavourName + '.' + key);
        var range = RANGES[diff][key];
        var firsts = {};
        var firstCount = 0;

        for (var i = 0; i < words.length; i++) {
          var word = words[i];
          if (typeof word !== 'string' || !/^[a-z]+$/.test(word)) {
            problems.push(where + ': "' + word + '" is not made of the letters a to z');
            continue;
          }
          if (word.length < range[0] || word.length > range[1]) {
            problems.push(where + ': "' + word + '" has ' + word.length + ' letters, outside ' + range[0] + ' to ' + range[1]);
          }
          if (hasOwn(seen, word)) {
            problems.push(where + ': "' + word + '" is also in ' + seen[word]);
          } else {
            seen[word] = where;
          }
          if (diff === 'easy' && key === '1' && !onlyLetters(word, HOME_ROW)) {
            problems.push(where + ': "' + word + '" has a letter outside the home row');
          }
          if (diff === 'easy' && key === '2') {
            if (!onlyLetters(word, EASY_TIER2_SET)) {
              problems.push(where + ': "' + word + '" has a letter outside the home row and E I R T O U');
            } else if (!hasLetterOutside(word, HOME_ROW)) {
              problems.push(where + ': "' + word + '" has no letter outside the home row');
            }
          }
          if (diff === 'easy' && key === '3' && !hasLetterOutside(word, EASY_TIER2_SET)) {
            problems.push(where + ': "' + word + '" has no letter outside the set of tier 2');
          }
          if (diff === 'medium' && key === '1' && /[qxz]/.test(word)) {
            problems.push(where + ': "' + word + '" has a Q, X or Z');
          }
          if (!hasOwn(firsts, word.charAt(0))) {
            firsts[word.charAt(0)] = true;
            firstCount++;
          }
        }

        if (flavourName === null) {
          if (THREAT_TIERS.indexOf(key) !== -1 && words.length < MIN_TIER_WORDS) {
            problems.push(where + ': ' + words.length + ' words, fewer than ' + MIN_TIER_WORDS);
          }
          if (firstCount < MIN_FIRST_LETTERS) {
            problems.push(where + ': ' + firstCount + ' different first letters, fewer than ' + MIN_FIRST_LETTERS);
          }
        }
      });

      var samples = (TG.Words && TG.Words.SAMPLES) || SAMPLES;
      var mine = samples[diff] || [];
      for (var s = 0; s < mine.length; s++) {
        if (!has(diff, mine[s])) problems.push(diff + ': the sample word "' + mine[s] + '" is not in the pools');
      }
    }
    return problems;
  }

  // ---------------------------------------------------------------------------------------------
  // The picker (DESIGN 10.4)
  // ---------------------------------------------------------------------------------------------

  function tierRank(key) {
    var i = POOL_KEYS.indexOf(key);
    return i === -1 ? POOL_KEYS.length : i;
  }

  function isPrefixPair(a, b) {
    return a.length <= b.length ? b.lastIndexOf(a, 0) === 0 : a.lastIndexOf(b, 0) === 0;
  }

  function adjacent(a, b) {
    var near = ADJACENT[a];
    return !!near && near.indexOf(b) !== -1;
  }

  var warnedDifficulty = {};

  function createPicker(difficultyName, rng, opts) {
    var all = pools();
    var set = (typeof difficultyName === 'string' && hasOwn(all, difficultyName)) ? all[difficultyName] : null;
    if (!set && !warnedDifficulty[difficultyName]) {
      warnedDifficulty[difficultyName] = true;
      warn('TG.Words.createPicker: no word pools for difficulty "' + difficultyName + '"');
    }

    // The lists this picker draws from, copied now so that later changes to POOLS do not alter a run.
    var lists = {};
    var flavourLists = null;
    if (set && opts && typeof opts.flavour === 'string' && set.flavour && hasOwn(set.flavour, opts.flavour)) {
      flavourLists = set.flavour[opts.flavour];
    }
    (function () {
      if (!set) return;
      for (var i = 0; i < POOL_KEYS.length; i++) {
        var key = POOL_KEYS[i];
        var words = isWordList(set[key]) ? set[key].slice() : [];
        var extra = flavourLists && THREAT_TIERS.indexOf(key) !== -1 ? flavourLists[key] : null;
        if (isWordList(extra)) {
          for (var j = 0; j < extra.length; j++) {
            if (typeof extra[j] === 'string' && words.indexOf(extra[j]) === -1) words.push(extra[j]);
          }
        }
        lists[key] = words;
      }
    })();

    var recent = [];
    var used = {};           // every word picked by this picker, that is in this run

    // Step 1 and the order of step 6: the chosen tier, then the other tiers of the mix (highest weight
    // first), then the remaining threat tiers from 1 to 3. One random value is drawn when a mix is given.
    function tierOrder(req) {
      if (req.tier !== undefined && req.tier !== null) return [String(req.tier)];

      var mix = req.tierMix;
      var entries = [];
      var key;
      if (mix && typeof mix === 'object') {
        for (key in mix) {
          if (hasOwn(mix, key) && hasOwn(lists, key) && isNumber(mix[key]) && mix[key] > 0) {
            entries.push({ key: key, weight: mix[key] });
          }
        }
      }
      entries.sort(function (a, b) { return tierRank(a.key) - tierRank(b.key); });

      var order = [];
      if (entries.length > 0) {
        var weights = [];
        for (var i = 0; i < entries.length; i++) weights.push(entries[i].weight);
        var chosen = rng.weighted(weights);
        if (!(chosen >= 0 && chosen < entries.length)) chosen = 0;
        order.push(entries[chosen].key);
        var others = entries.filter(function (e, index) { return index !== chosen; });
        others.sort(function (a, b) { return (b.weight - a.weight) || (tierRank(a.key) - tierRank(b.key)); });
        for (var o = 0; o < others.length; o++) order.push(others[o].key);
      }
      for (var t = 0; t < THREAT_TIERS.length; t++) {
        if (order.indexOf(THREAT_TIERS[t]) === -1) order.push(THREAT_TIERS[t]);
      }
      return order;
    }

    // Steps 2 to 5 for one list.
    function candidates(words, minLen, maxLen, active, firsts, skipRecent) {
      var out = [];
      for (var i = 0; i < words.length; i++) {
        var word = words[i];
        if (word.length < minLen || word.length > maxLen) continue;          // step 2
        if (skipRecent && recent.indexOf(word) !== -1) continue;             // step 3
        if (firsts[word.charAt(0)] === true) continue;                       // step 4
        var clash = false;                                                   // step 5
        for (var a = 0; a < active.length; a++) {
          if (isPrefixPair(word, active[a])) { clash = true; break; }
        }
        if (!clash) out.push(word);
      }
      return out;
    }

    // Step 3b: of the words found, those not yet picked in this run, if there are any. This only narrows
    // a choice already made by steps 2 to 8, so the tier, the length and the other rules are unchanged.
    function preferUnused(found) {
      var fresh = [];
      for (var i = 0; i < found.length; i++) {
        if (!hasOwn(used, found[i])) fresh.push(found[i]);
      }
      return fresh.length > 0 ? fresh : found;
    }

    function search(order, minLen, maxLen, active, firsts) {
      var min = minLen;
      for (;;) {
        for (var pass = 0; pass < 2; pass++) {                                // pass 1 is step 7
          for (var i = 0; i < order.length; i++) {                           // step 6
            var words = lists[order[i]];
            if (!words) continue;
            var found = candidates(words, min, maxLen, active, firsts, pass === 0);
            if (found.length > 0) return preferUnused(found);
          }
        }
        if (min <= 2) return [];                                             // step 9
        min--;                                                               // step 8
      }
    }

    // Step 10. Both weightings are Tier 2 features of the design.
    function weightsFor(words, active, weak) {
      var config = null;
      try {
        config = TG.Difficulty ? TG.Difficulty.get(difficultyName) : null;
      } catch (e) {
        config = null;
      }
      var useAdjacency = !!(config && config.adjacencyWeighting) && active.length > 0;
      var useWeak = weak.length > 0;
      var weights = [];
      for (var i = 0; i < words.length; i++) {
        var word = words[i];
        var weight = 1;
        if (useAdjacency) {
          var near = false;
          for (var a = 0; a < active.length; a++) {
            if (adjacent(word.charAt(0), active[a].charAt(0))) { near = true; break; }
          }
          if (!near) weight *= 3;
        }
        if (useWeak) {
          for (var k = 0; k < weak.length; k++) {
            if (word.indexOf(weak[k]) !== -1) { weight *= 2; break; }
          }
        }
        weights.push(weight);
      }
      return weights;
    }

    function lowerWords(value, singleLetters) {
      var out = [];
      if (!Array.isArray(value)) return out;
      for (var i = 0; i < value.length; i++) {
        if (typeof value[i] !== 'string') continue;
        var s = value[i].toLowerCase();
        if (s === '' || (singleLetters && s.length !== 1)) continue;
        out.push(s);
      }
      return out;
    }

    var picker = {
      // The last RECENT_WORDS picks, oldest first.
      recent: recent,

      pick: function (req) {
        if (!set) return null;
        req = req || {};

        var active = lowerWords(req.active, false);
        var weak = lowerWords(req.weak, true);
        var firsts = {};
        for (var a = 0; a < active.length; a++) firsts[active[a].charAt(0)] = true;

        var maxLen = isNumber(req.maxLen) ? req.maxLen : Infinity;
        var minLen = isNumber(req.minLen) ? req.minLen : 2;
        if (minLen > maxLen) minLen = maxLen;

        var order = tierOrder(req);
        var found = search(order, minLen, maxLen, active, firsts);
        if (found.length === 0) return null;

        var index = rng.weighted(weightsFor(found, active, weak));          // step 11
        if (!(index >= 0 && index < found.length)) index = 0;
        var word = found[index];

        recent.push(word);
        var keep = TG.C && isNumber(TG.C.RECENT_WORDS) ? TG.C.RECENT_WORDS : 20;
        while (recent.length > keep) recent.shift();
        used[word] = true;
        return word;
      },

      // Clears recent and the words picked so far.
      reset: function () {
        recent.length = 0;
        used = {};
      }
    };
    return picker;
  }

  // ---------------------------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------------------------

  TG.Words = {
    POOLS: POOLS,
    SAMPLES: SAMPLES,
    ADJACENT: ADJACENT,
    createPicker: createPicker,
    has: has,
    validate: validate
  };
})(typeof window !== 'undefined' ? window : globalThis);
