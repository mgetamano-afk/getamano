/**
 * US States + Cities — Section 41 / Correction #5.
 *
 * Used as the source of truth for the static state dropdown and as the
 * fallback list when Google Places Autocomplete (Section 42) is offline.
 *
 * Ordering rationale: tier-1 states (high Latino population) appear first
 * so providers in TX/CA/FL/NY/IL find their state without scrolling.
 */

export const US_STATES = [
  // Tier 1 — high Latino concentration
  { name: "Texas", abbreviation: "TX",
    cities: ["Houston","San Antonio","Dallas","El Paso","Fort Worth","Austin","Laredo","McAllen","Corpus Christi","Amarillo","Lubbock","Brownsville","Pharr","Grand Prairie","Garland","Irving","Plano","Edinburg","Mission","Carrollton"] },
  { name: "California", abbreviation: "CA",
    cities: ["Los Angeles","San Francisco","San Diego","Fresno","Sacramento","San Jose","Stockton","Bakersfield","Riverside","Oakland","Anaheim","Santa Ana","Chula Vista","Fontana","Modesto","Oxnard","Salinas","Pomona","Escondido","Visalia"] },
  { name: "Florida", abbreviation: "FL",
    cities: ["Miami","Orlando","Tampa","Jacksonville","Fort Lauderdale","Hialeah","Kissimmee","Cape Coral","Pembroke Pines","Hollywood","Miramar","West Palm Beach","Gainesville","Coral Springs","Clearwater","Saint Petersburg","Deltona","Tallahassee"] },
  { name: "New York", abbreviation: "NY",
    cities: ["New York City","Buffalo","Rochester","Yonkers","Syracuse","Albany","New Rochelle","Mount Vernon","Schenectady","Brentwood"] },
  { name: "Illinois", abbreviation: "IL",
    cities: ["Chicago","Aurora","Cicero","Elgin","Waukegan","Rockford","Joliet","Naperville","Berwyn","Melrose Park"] },
  { name: "Arizona", abbreviation: "AZ",
    cities: ["Phoenix","Tucson","Mesa","Chandler","Tempe","Glendale","Peoria","Scottsdale","Gilbert","Yuma"] },
  { name: "New Mexico", abbreviation: "NM",
    cities: ["Albuquerque","Santa Fe","Las Cruces","Roswell","Farmington","Clovis","Hobbs","Alamogordo","Carlsbad","Gallup"] },
  { name: "Colorado", abbreviation: "CO",
    cities: ["Denver","Aurora","Colorado Springs","Pueblo","Fort Collins","Lakewood","Thornton","Arvada","Westminster","Commerce City"] },
  { name: "Nevada", abbreviation: "NV",
    cities: ["Las Vegas","North Las Vegas","Henderson","Reno","Sparks","Carson City","Enterprise","Spring Valley","Sunrise Manor"] },
  { name: "New Jersey", abbreviation: "NJ",
    cities: ["Newark","Jersey City","Paterson","Elizabeth","Edison","Trenton","Clifton","Camden","Passaic","Union City"] },

  // Tier 2 — fast-growing Latino corridors
  { name: "Georgia", abbreviation: "GA",
    cities: ["Atlanta","Augusta","Gainesville","Dalton","Columbus","Savannah","Macon","Albany","Roswell","Sandy Springs"] },
  { name: "North Carolina", abbreviation: "NC",
    cities: ["Charlotte","Raleigh","Greensboro","Durham","Winston-Salem","Fayetteville","Cary","Wilmington","High Point","Concord"] },
  { name: "Virginia", abbreviation: "VA",
    cities: ["Arlington","Alexandria","Manassas","Woodbridge","Virginia Beach","Norfolk","Richmond","Chesapeake","Newport News","Hampton"] },
  { name: "Maryland", abbreviation: "MD",
    cities: ["Silver Spring","Baltimore","Rockville","Gaithersburg","Germantown","Hyattsville","Wheaton","Annapolis","Frederick","Hagerstown"] },
  { name: "Washington", abbreviation: "WA",
    cities: ["Seattle","Tacoma","Yakima","Kennewick","Pasco","Richland","Spokane","Bellevue","Everett","Renton"] },
  { name: "Oklahoma", abbreviation: "OK",
    cities: ["Oklahoma City","Tulsa","Tahlequah","Lawton","Norman","Broken Arrow","Edmond","Moore","Midwest City","Sallisaw"] },
  { name: "Arkansas", abbreviation: "AR",
    cities: ["Little Rock","Fort Smith","Fayetteville","Springdale","Rogers","Jonesboro","Conway","Bentonville","North Little Rock","Texarkana"] },
  { name: "Kansas", abbreviation: "KS",
    cities: ["Wichita","Kansas City","Topeka","Olathe","Lawrence","Garden City","Liberal","Dodge City","Emporia","Salina"] },
  { name: "Missouri", abbreviation: "MO",
    cities: ["Kansas City","St. Louis","Springfield","Independence","Columbia","Lee's Summit","O'Fallon","St. Joseph","St. Charles","Blue Springs"] },
  { name: "Tennessee", abbreviation: "TN",
    cities: ["Nashville","Memphis","Knoxville","Chattanooga","Clarksville","Murfreesboro","Smyrna","Franklin","Shelbyville","La Vergne"] },
  { name: "Oregon", abbreviation: "OR",
    cities: ["Portland","Salem","Eugene","Hillsboro","Gresham","Beaverton","Bend","Medford","Springfield","Corvallis"] },
  { name: "Minnesota", abbreviation: "MN",
    cities: ["Minneapolis","St. Paul","Worthington","Rochester","Bloomington","Plymouth","Brooklyn Park","Duluth","St. Cloud","Eagan"] },

  // Rest of the union
  { name: "Alabama", abbreviation: "AL", cities: ["Birmingham","Montgomery","Huntsville","Mobile","Tuscaloosa"] },
  { name: "Alaska", abbreviation: "AK", cities: ["Anchorage","Fairbanks","Juneau"] },
  { name: "Connecticut", abbreviation: "CT", cities: ["Bridgeport","New Haven","Hartford","Waterbury","Stamford","Danbury"] },
  { name: "Delaware", abbreviation: "DE", cities: ["Wilmington","Dover","Newark","Georgetown"] },
  { name: "Hawaii", abbreviation: "HI", cities: ["Honolulu","Hilo","Kailua","Pearl City"] },
  { name: "Idaho", abbreviation: "ID", cities: ["Boise","Meridian","Nampa","Twin Falls","Idaho Falls"] },
  { name: "Indiana", abbreviation: "IN", cities: ["Indianapolis","Fort Wayne","South Bend","Evansville","Hammond"] },
  { name: "Iowa", abbreviation: "IA", cities: ["Des Moines","Cedar Rapids","Davenport","Sioux City","Marshalltown"] },
  { name: "Kentucky", abbreviation: "KY", cities: ["Louisville","Lexington","Bowling Green","Owensboro"] },
  { name: "Louisiana", abbreviation: "LA", cities: ["New Orleans","Baton Rouge","Shreveport","Lafayette","Kenner"] },
  { name: "Maine", abbreviation: "ME", cities: ["Portland","Lewiston","Bangor","South Portland"] },
  { name: "Massachusetts", abbreviation: "MA", cities: ["Boston","Lawrence","Springfield","Lowell","Worcester","Brockton"] },
  { name: "Michigan", abbreviation: "MI", cities: ["Detroit","Grand Rapids","Lansing","Ann Arbor","Flint","Sterling Heights"] },
  { name: "Mississippi", abbreviation: "MS", cities: ["Jackson","Gulfport","Southaven","Hattiesburg"] },
  { name: "Montana", abbreviation: "MT", cities: ["Billings","Missoula","Great Falls","Bozeman"] },
  { name: "Nebraska", abbreviation: "NE", cities: ["Omaha","Lincoln","Bellevue","Grand Island","Lexington"] },
  { name: "New Hampshire", abbreviation: "NH", cities: ["Manchester","Nashua","Concord","Dover"] },
  { name: "North Dakota", abbreviation: "ND", cities: ["Fargo","Bismarck","Grand Forks","Minot"] },
  { name: "Ohio", abbreviation: "OH", cities: ["Columbus","Cleveland","Cincinnati","Toledo","Dayton","Akron"] },
  { name: "Pennsylvania", abbreviation: "PA", cities: ["Philadelphia","Pittsburgh","Allentown","Reading","Lancaster","Harrisburg"] },
  { name: "Rhode Island", abbreviation: "RI", cities: ["Providence","Cranston","Woonsocket","Pawtucket","Central Falls"] },
  { name: "South Carolina", abbreviation: "SC", cities: ["Columbia","Charleston","Greenville","Spartanburg","Rock Hill"] },
  { name: "South Dakota", abbreviation: "SD", cities: ["Sioux Falls","Rapid City","Aberdeen"] },
  { name: "Utah", abbreviation: "UT", cities: ["Salt Lake City","West Valley City","Provo","Ogden","St. George"] },
  { name: "Vermont", abbreviation: "VT", cities: ["Burlington","Essex","South Burlington","Montpelier"] },
  { name: "West Virginia", abbreviation: "WV", cities: ["Charleston","Huntington","Morgantown","Parkersburg"] },
  { name: "Wisconsin", abbreviation: "WI", cities: ["Milwaukee","Madison","Green Bay","Racine","Kenosha","Waukesha"] },
  { name: "Wyoming", abbreviation: "WY", cities: ["Cheyenne","Casper","Laramie","Gillette"] },
  { name: "Washington D.C.", abbreviation: "DC", cities: ["Washington D.C."] },
];

export function getStateByAbbr(abbr) {
  return US_STATES.find((s) => s.abbreviation === abbr);
}

export function getCitiesByState(stateNameOrAbbr) {
  const state = US_STATES.find(
    (s) => s.name === stateNameOrAbbr || s.abbreviation === stateNameOrAbbr,
  );
  return state?.cities ?? [];
}
