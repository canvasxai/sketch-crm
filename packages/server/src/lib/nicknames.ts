/**
 * Nickname dictionary for contact deduplication.
 *
 * Maps common English given names to a canonical form so that
 * "Robert" and "Bob" resolve to the same key. Used in Tier 2
 * matching to detect cross-source duplicates.
 *
 * Source: carltonnorthern/nicknames (public domain) — curated subset.
 */

// Each entry maps a name variant (lowercase) → canonical form (lowercase).
// All names in the same group share the same canonical value.
const NICKNAME_GROUPS: string[][] = [
  ["aaron", "erin", "ron", "ronnie"],
  ["abraham", "ab", "abe"],
  ["adaline", "ada", "addie", "addy", "adeline", "delia", "dell"],
  ["albert", "al", "bert", "bertie"],
  ["alexander", "al", "alex", "alec", "aleck", "sandy", "xander"],
  ["alfred", "al", "fred", "freddie", "freddy"],
  ["alice", "allie", "ally", "elsie"],
  ["allison", "allie", "ally"],
  ["amanda", "mandy", "mandi"],
  ["anastasia", "ana", "stacy", "stacey"],
  ["andrea", "andie", "andi"],
  ["andrew", "andy", "drew"],
  ["angela", "angie", "ang"],
  ["ann", "anne", "annie", "anna", "nan", "nancy", "nannie"],
  ["anthony", "ant", "tony"],
  ["antoinette", "ann", "nettie", "toni"],
  ["archibald", "archie"],
  ["arthur", "art", "artie"],
  ["augustine", "august", "gus", "gussie"],
  ["barbara", "bab", "babs", "barb", "barbie"],
  ["bartholomew", "bart"],
  ["beatrice", "bea", "trixie"],
  ["benjamin", "ben", "benny", "benji"],
  ["bernadette", "bernie"],
  ["bernard", "barney", "bernie"],
  ["bradford", "brad"],
  ["bradley", "brad"],
  ["brendan", "brendon"],
  ["bridget", "biddy", "bridie"],
  ["caleb", "cal"],
  ["calvin", "cal", "vin", "vinnie"],
  ["cameron", "cam"],
  ["camille", "cammie", "millie"],
  ["caroline", "carol", "carrie", "cassie", "lynn"],
  ["catherine", "casey", "cassie", "cathy", "kathy", "kate", "katy", "kay", "kit"],
  ["cecilia", "cece", "cissy"],
  ["charles", "charlie", "charley", "chuck", "chas"],
  ["charlotte", "charlie", "charley", "lottie", "lotte"],
  ["christine", "chris", "chrissy", "chrissie", "tina", "christy"],
  ["christopher", "chris", "kit", "topher"],
  ["clarence", "clare"],
  ["clifford", "cliff"],
  ["constance", "connie"],
  ["cornelius", "con", "connie", "neil"],
  ["cynthia", "cindy", "cindi"],
  ["daniel", "dan", "danny"],
  ["darlene", "darly", "darla"],
  ["david", "dave", "davey", "davy"],
  ["deborah", "deb", "debbie", "debby"],
  ["delilah", "lila"],
  ["dennis", "denny", "den"],
  ["diana", "di", "dee"],
  ["dominic", "dom", "nick", "nicky"],
  ["donald", "don", "donnie", "donny"],
  ["dorothy", "dot", "dottie", "dolly"],
  ["douglas", "doug", "dougie"],
  ["edmund", "ed", "eddie", "ned", "ted", "teddy"],
  ["edward", "ed", "eddie", "ned", "ted", "teddy"],
  ["eleanor", "ella", "ellie", "nell", "nellie", "nora"],
  ["elizabeth", "bess", "bessie", "beth", "betsy", "betty", "eliza", "libby", "lisa", "liz", "liza", "lizzie"],
  ["emily", "em", "emmy", "millie"],
  ["eugene", "gene"],
  ["evelyn", "eve", "evie"],
  ["florence", "flo", "flora", "flossie"],
  ["frances", "fanny", "fran", "frankie"],
  ["francis", "fran", "frank", "frankie"],
  ["franklin", "frank", "frankie"],
  ["frederick", "fred", "freddie", "freddy", "fritz"],
  ["gabriel", "gabe", "gabby"],
  ["gabrielle", "gabby", "gabi", "elle"],
  ["geoffrey", "geoff", "jeff"],
  ["george", "georgie"],
  ["gerald", "gerry", "jerry"],
  ["geraldine", "geri", "gerry", "jerry"],
  ["gertrude", "gert", "gertie", "trudy"],
  ["gilbert", "gil", "bert"],
  ["gordon", "gordy"],
  ["gregory", "greg", "gregg"],
  ["gwendolyn", "gwen", "wendy"],
  ["hannah", "anna", "nan"],
  ["harold", "hal", "harry"],
  ["harriet", "hattie", "hatty"],
  ["helen", "lena", "nell", "nellie"],
  ["henrietta", "etta", "hettie", "nettie"],
  ["henry", "hank", "harry", "hal"],
  ["herbert", "herb", "bert"],
  ["howard", "howie"],
  ["ignatius", "iggy", "nate"],
  ["irene", "rena", "rene"],
  ["isaiah", "ike", "zay"],
  ["isidore", "izzy"],
  ["jacob", "jake", "jay"],
  ["jacqueline", "jackie", "jacky"],
  ["james", "jamie", "jim", "jimmie", "jimmy", "jem"],
  ["janet", "jan", "janice"],
  ["jason", "jay", "jace"],
  ["jean", "jeanie", "jeannie"],
  ["jeffrey", "jeff", "geoff"],
  ["jennifer", "jen", "jenn", "jenny", "jennie"],
  ["jeremiah", "jeremy", "jerry"],
  ["jerome", "jerry"],
  ["jessica", "jess", "jessie"],
  ["joan", "jo", "joanie"],
  ["joanna", "jo", "jojo"],
  ["john", "jack", "johnny", "jon", "jonny", "ian"],
  ["jonathan", "jon", "jonny", "john", "johnny", "nathan"],
  ["joseph", "joe", "joey", "jo"],
  ["josephine", "jo", "josie", "fina"],
  ["joshua", "josh"],
  ["judith", "judy", "judi"],
  ["julian", "jules"],
  ["katherine", "kate", "kathy", "katy", "kay", "kit", "kitty"],
  ["kathryn", "kate", "kathy", "katy", "kay"],
  ["kenneth", "ken", "kenny"],
  ["kimberly", "kim", "kimmy"],
  ["kristopher", "kris"],
  ["laura", "laurie"],
  ["laurence", "larry", "laurie"],
  ["lawrence", "larry", "law"],
  ["leonard", "leo", "leon", "len", "lenny"],
  ["lillian", "lil", "lilly", "lily"],
  ["lincoln", "linc"],
  ["linda", "lindy", "lynn"],
  ["louis", "lou", "louie"],
  ["louise", "lou", "lulu"],
  ["lucille", "lucy", "lu"],
  ["madeline", "maddie", "maddy", "lynn"],
  ["malcolm", "mal"],
  ["margaret", "daisy", "maggie", "marge", "meg", "peg", "peggy", "rita", "madge"],
  ["maria", "mary", "ria"],
  ["marilyn", "mary", "lynn"],
  ["martha", "marty", "mattie", "patty"],
  ["martin", "marty"],
  ["mary", "mae", "mamie", "molly", "polly"],
  ["mathew", "matt", "matty"],
  ["matthew", "matt", "matty"],
  ["maximilian", "max"],
  ["maxwell", "max"],
  ["melissa", "mel", "missy", "lissa"],
  ["michael", "mick", "mickey", "mike", "mikey", "micah"],
  ["michelle", "shelly", "micki"],
  ["mildred", "millie", "milly"],
  ["mitchell", "mitch"],
  ["monica", "mon"],
  ["napoleon", "nap", "leon"],
  ["nathaniel", "nate", "nat", "nathan"],
  ["nicholas", "nick", "nicky", "nico", "cole"],
  ["nicole", "nicky", "nikki"],
  ["norman", "norm"],
  ["oliver", "ollie"],
  ["patricia", "pat", "patty", "patti", "tricia", "trish"],
  ["patrick", "pat", "paddy", "rick", "ricky"],
  ["paul", "paulie"],
  ["penelope", "penny"],
  ["percival", "percy"],
  ["peter", "pete"],
  ["philip", "phil"],
  ["priscilla", "prissy", "cilla"],
  ["rachel", "rae"],
  ["randolph", "randy"],
  ["raphael", "ralph"],
  ["raymond", "ray"],
  ["rebecca", "becca", "beck", "becky", "reba"],
  ["reginald", "reg", "reggie"],
  ["richard", "dick", "dickie", "rick", "ricky", "rich", "richie"],
  ["robert", "bob", "bobby", "rob", "robby", "robbie", "bert"],
  ["roderick", "rod", "roddy"],
  ["roger", "rog"],
  ["roland", "rolly", "lanny"],
  ["ronald", "ron", "ronnie", "ronny"],
  ["rosalind", "ros", "roz"],
  ["roxanne", "roxy"],
  ["russell", "russ", "rusty"],
  ["ruth", "ruthie"],
  ["samuel", "sam", "sammy"],
  ["sandra", "sandy", "sadie"],
  ["sebastian", "seb", "bash"],
  ["sharon", "shari"],
  ["sheldon", "shel", "shelly"],
  ["sophia", "sophie"],
  ["stanley", "stan"],
  ["stephanie", "steph", "stevie"],
  ["stephen", "steve", "stevie"],
  ["steven", "steve", "stevie"],
  ["stewart", "stu", "stew"],
  ["stuart", "stu", "stew"],
  ["susan", "sue", "suzy", "susie"],
  ["suzanne", "sue", "suzy"],
  ["sylvia", "syl"],
  ["theodore", "ted", "teddy", "theo"],
  ["theresa", "terry", "tess", "tessa", "tracy"],
  ["thomas", "tom", "tommy", "thom"],
  ["timothy", "tim", "timmy"],
  ["tobias", "toby"],
  ["valerie", "val"],
  ["vanessa", "nessa", "nessie"],
  ["vernon", "vern"],
  ["victor", "vic", "vick"],
  ["victoria", "vicki", "vicky", "tori"],
  ["vincent", "vin", "vinny", "vince"],
  ["virginia", "ginny", "ginger"],
  ["vivian", "viv"],
  ["wallace", "wally"],
  ["walter", "walt", "wally"],
  ["warren", "war"],
  ["wesley", "wes"],
  ["william", "bill", "billy", "will", "willy", "willie", "liam"],
  ["zachariah", "zach", "zack"],
  ["zachary", "zach", "zack"],
];

// Build lookup: name variant → canonical form
const nicknameMap = new Map<string, string>();

for (const group of NICKNAME_GROUPS) {
  const canonical = group[0]; // first entry is canonical
  for (const name of group) {
    // If a name already has a canonical from another group, keep the first one
    // (some names like "al" appear in multiple groups)
    if (!nicknameMap.has(name)) {
      nicknameMap.set(name, canonical);
    }
  }
}

/**
 * Get the canonical form of a first name.
 * Returns the canonical name if found, otherwise the input lowercased.
 *
 * @example getCanonicalName("Bob") → "robert"
 * @example getCanonicalName("Robert") → "robert"
 * @example getCanonicalName("Himanshu") → "himanshu"
 */
export function getCanonicalName(firstName: string): string {
  const lower = firstName.toLowerCase().trim();
  return nicknameMap.get(lower) ?? lower;
}

/**
 * Check if two first names are equivalent (same person).
 *
 * @example areFirstNamesEquivalent("Bob", "Robert") → true
 * @example areFirstNamesEquivalent("Bill", "William") → true
 * @example areFirstNamesEquivalent("John", "Jane") → false
 */
export function areFirstNamesEquivalent(a: string, b: string): boolean {
  return getCanonicalName(a) === getCanonicalName(b);
}
