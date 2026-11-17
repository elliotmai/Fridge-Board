/**
 * Sample content shaped like each app's real records. Dates are "days from
 * today" so the board always looks current. `src/data/sources.js` is where
 * each of these gets swapped for a live feed.
 */
export const HOME = { name: 'Home', lat: 30.628, lon: -96.334 }; // sample location

// GalaxyFarm chore occurrences for today. slot = deadline bucket.
export const CHORES = [
  { id: 'c0', title: 'Refill chicken waterer', detail: 'Left over from yesterday', slot: 'owed' },
  { id: 'c1', title: 'Let the hens out', slot: 'morning' },
  { id: 'c2', title: 'Cubes for the herd', detail: '1 bag across pens 1 to 3', slot: 'morning' },
  { id: 'c3', title: 'Collect eggs', slot: 'morning' },
  { id: 'c4', title: 'Check fence on pen 3', detail: 'Every Monday', slot: 'midday' },
  { id: 'c5', title: 'Top up the horse trough', slot: 'midday' },
  { id: 'c6', title: 'Cubes for the herd', detail: 'Evening bag', slot: 'evening' },
  { id: 'c7', title: 'Feed the dogs', detail: '2 cups each', slot: 'evening' },
  { id: 'c8', title: 'Close up the coop', slot: 'evening' },
  { id: 'c9', title: 'Lock the barn', slot: 'night' },
];

// KitchenHub recipes, as step cards.
export const RECIPES = {
  meatballs: {
    name: 'Firecracker meatballs', sub: 'With roasted green beans and jasmine rice', time: '35 min', serves: 2, cal: 780,
    ingredients: ['10 oz ground beef', '¼ cup panko', '2 green onions', '6 oz green beans', '¾ cup jasmine rice', '2 tbsp sweet chili sauce', '1 tbsp sriracha', '1 tbsp soy sauce', '2 cloves garlic'],
    steps: [
      { title: 'Start the rice', text: ['Bring 1½ cups water and a pinch of salt to a boil in a small pot.', 'Stir in the rice, cover, and turn the heat to low. Simmer until tender.'], uses: ['¾ cup jasmine rice'], timer: 15 },
      { title: 'Prep', text: ['Heat the oven to 425°F.', 'Trim the green beans. Thinly slice the green onions, keeping whites and greens apart. Mince the garlic.'], uses: ['6 oz green beans', '2 green onions', '2 cloves garlic'] },
      { title: 'Roast the green beans', text: ['Toss the beans on a baking sheet with a drizzle of oil, salt and pepper.', 'Roast on the top rack until browned and tender.'], uses: ['Green beans', 'Oil, salt, pepper'], timer: 12 },
      { title: 'Form the meatballs', text: ['Combine the beef, panko, onion whites, half the garlic, the soy sauce, salt and pepper.', 'Roll into 10 to 12 meatballs.'], uses: ['10 oz ground beef', '¼ cup panko', '1 tbsp soy sauce'] },
      { title: 'Cook the meatballs', text: ['Heat a drizzle of oil in a large pan over medium-high heat.', 'Add the meatballs and cook, turning, until browned and cooked through.'], uses: ['Meatballs', 'Oil'], timer: 10 },
      { title: 'Glaze and serve', text: ['Turn the heat to low. Stir in the sweet chili sauce, sriracha to taste, the rest of the garlic and 1 tbsp water. Toss to coat.', 'Fluff the rice and plate it with the beans and meatballs. Top with the onion greens.'], uses: ['2 tbsp sweet chili sauce', '1 tbsp sriracha'] },
    ],
  },
  tuscan: {
    name: 'Creamy Tuscan pork chops', sub: 'With spinach and garlic potatoes', time: '30 min', serves: 2, cal: 820,
    ingredients: ['2 boneless pork chops', '12 oz baby potatoes', '4 oz baby spinach', '½ cup heavy cream', '¼ cup sun-dried tomatoes', '2 cloves garlic', '¼ cup parmesan'],
    steps: [
      { title: 'Roast the potatoes', text: ['Heat the oven to 425°F. Halve the potatoes and toss with oil, salt and pepper.', 'Roast until golden.'], uses: ['12 oz baby potatoes'], timer: 22 },
      { title: 'Sear the pork', text: ['Pat the chops dry and season. Sear in an oiled pan over medium-high, 4 to 5 minutes a side, until cooked through. Set aside.'], uses: ['2 boneless pork chops'], timer: 9 },
      { title: 'Make the sauce', text: ['In the same pan, cook the garlic and sun-dried tomatoes for 1 minute.', 'Add the cream and parmesan, then stir in the spinach until it wilts.'], uses: ['½ cup heavy cream', '4 oz baby spinach', '¼ cup sun-dried tomatoes', '¼ cup parmesan'] },
      { title: 'Serve', text: ['Return the pork to the pan and spoon the sauce over. Serve with the potatoes.'], uses: [] },
    ],
  },
  fajitas: {
    name: 'Sheet-pan chicken fajitas', sub: 'With lime crema', time: '30 min', serves: 2, cal: 690,
    ingredients: ['12 oz chicken thighs', '2 bell peppers', '1 onion', '6 flour tortillas', '1 lime', '¼ cup sour cream', '1 tbsp fajita spice'],
    steps: [
      { title: 'Slice and season', text: ['Heat the oven to 450°F. Slice the chicken, peppers and onion into strips.', 'Toss with oil and the fajita spice on a sheet pan.'], uses: ['12 oz chicken thighs', '2 bell peppers', '1 onion', '1 tbsp fajita spice'] },
      { title: 'Roast', text: ['Roast until the chicken is cooked through and the vegetables are charred at the edges.'], uses: [], timer: 18 },
      { title: 'Make the crema', text: ['Stir the sour cream with the juice of half the lime and a pinch of salt.'], uses: ['¼ cup sour cream', '1 lime'] },
      { title: 'Warm and serve', text: ['Warm the tortillas in the oven for the last 2 minutes. Fill with the chicken and vegetables and top with the crema.'], uses: ['6 flour tortillas'] },
    ],
  },
};

// KitchenHub meal plan. d = days from today.
export const MEALS = [
  { d: 0, type: 'Breakfast', name: 'Overnight oats' },
  { d: 0, type: 'Lunch', name: 'Leftover chili' },
  { d: 0, type: 'Dinner', name: 'Firecracker meatballs', recipe: 'meatballs' },
  { d: 1, type: 'Dinner', name: 'Creamy Tuscan pork chops', recipe: 'tuscan' },
  { d: 2, type: 'Dinner', name: 'Leftovers' },
  { d: 3, type: 'Dinner', name: 'Sheet-pan chicken fajitas', recipe: 'fajitas' },
  { d: 4, type: 'Dinner', name: 'Pizza night' },
  { d: 6, type: 'Dinner', name: 'Slow-cooker chili' },
];
export const EXPIRING = [
  { name: 'Chicken thighs', days: 1 }, { name: 'Baby spinach', days: 2 }, { name: 'Heavy cream', days: 3 }, { name: 'Tortillas', days: 5 },
];

// KitchenHub shopping list. why = the meal it's for (blank = typed in).
export const SHOPPING = [
  { id: 's1', name: 'Green beans', qty: '6 oz', section: 'Produce', why: 'Tonight' },
  { id: 's2', name: 'Green onions', qty: '2', section: 'Produce', why: 'Tonight' },
  { id: 's3', name: 'Bell peppers', qty: '2', section: 'Produce', why: 'Thu' },
  { id: 's4', name: 'Limes', qty: '2', section: 'Produce' },
  { id: 's5', name: 'Pork chops', qty: '2', section: 'Meat', why: 'Tue' },
  { id: 's6', name: 'Sour cream', qty: '1 tub', section: 'Dairy and eggs', why: 'Thu' },
  { id: 's7', name: 'Parmesan', qty: '', section: 'Dairy and eggs', why: 'Tue' },
  { id: 's8', name: 'Sweet chili sauce', qty: '', section: 'Pantry', why: 'Tonight' },
  { id: 's9', name: 'Coffee', qty: '', section: 'Pantry' },
  { id: 's10', name: 'Paper towels', qty: '', section: 'Household' },
];
// Things bought often, offered as one-tap adds.
export const QUICK = [
  ['Milk', 'Dairy and eggs'], ['Eggs', 'Dairy and eggs'], ['Bread', 'Bakery'], ['Bananas', 'Produce'], ['Butter', 'Dairy and eggs'], ['Dog food', 'Household'],
];

// LearnLeaf open tasks. d = due, days from today.
export const SUBJECTS = { stats: ['Statistics', '#7a5af5'], bio: ['Biology', '#1f9e89'], home: ['Personal', '#d17a00'] };
export const TASKS = [
  { name: 'Lab report draft', subject: 'bio', d: -1 },
  { name: 'Read chapter 7', subject: 'stats', d: 0, time: '9 PM' },
  { name: 'Pay the vet invoice', subject: 'home', d: 0 },
  { name: 'Problem set 6', subject: 'stats', d: 2 },
  { name: 'Group project slides', subject: 'bio', d: 4 },
  { name: 'Quiz on cell transport', subject: 'bio', d: 6 },
  { name: 'Renew truck registration', subject: 'home', d: 12 },
];

// Wander trips with destination coordinates.
export const TRIPS = [
  { id: 'lake-weekend', name: 'Lake weekend', dest: 'Lake Somerville', lat: 30.33, lon: -96.55, start: 3, end: 4, stay: 'Cabin 6, Birch Creek' },
  { id: 'thanksgiving', name: 'Thanksgiving', dest: 'Asheville, NC', lat: 35.595, lon: -82.551, start: 9, end: 13, stay: 'Airbnb in Montford',
    legs: [['AA 3521', 'CLL to DFW', '6:10 AM'], ['AA 1184', 'DFW to AVL', '9:45 AM']] },
  { id: 'lisbon', name: 'Lisbon', dest: 'Lisbon, Portugal', lat: 38.72, lon: -9.14, start: 48, end: 57 },
];

// ZNT breeding sessions. CIDRs on a Wednesday; Lutalyse +7; breed +9 to +11.
export const SESSIONS = [
  { name: 'Fall heifers', cidrFrom: 1, groups: [['ZNT', 22], ['Miller', 14], ['Ortiz', 8]], notes: 'Bring extra CIDRs. Miller may add 2.' },
  { name: 'Spring cows', cidrFrom: 60, groups: [['ZNT', 30]] },
];

// GalaxyFarm housesitter guide.
export const SITTER = {
  contacts: [['Dr. Ana Patel', 'Vet', '(979) 555-0142'], ['Joe next door', 'Can help with the cattle', '(979) 555-0188'], ['Feed store', 'Opens at 7 AM', '(979) 555-0110']],
  notes: [['safety', "The bull is in pen 2. Don't go in alone."], ['', 'Dogs eat at 6 PM, 2 cups each. Kibble is in the bin by the back door.'], ['', 'Eggs go in the garage fridge. Help yourself.'], ['', 'The back pasture gate code is inside the feed room door.']],
};

// Sample weather. Live version reads GalaxyFarm's weather service.
export const WEATHER = {
  now: 57, code: 'partly', desc: 'Partly cloudy',
  days: [{ hi: 66, lo: 33, code: 'sun' }, { hi: 61, lo: 41, code: 'cloud' }, { hi: 54, lo: 44, code: 'rain' }, { hi: 63, lo: 39, code: 'sun' }],
};
