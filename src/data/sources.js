import * as sample from './sample';

/**
 * Where the board's data comes from. Today every section reads the sample data.
 * Each will move to a server-side feed (a Netlify function) so no app's token
 * ever sits on the tablet:
 *
 *   chores, housesitter, weather  GalaxyFarm  new token-scoped read endpoint
 *   meals, recipes, shopping      KitchenHub  new token-scoped read endpoint
 *   tasks                         LearnLeaf   GET /api/summary + /api/subjects
 *   trips                         Wander      appTrips + appTripTravel
 *   breeding sessions             ZNT         Firestore REST (sessions)
 *
 * Keep the returned shape the same and the components won't need to change.
 */
export async function loadBoard() {
  return {
    home: sample.HOME,
    chores: sample.CHORES,
    recipes: sample.RECIPES,
    meals: sample.MEALS,
    expiring: sample.EXPIRING,
    shopping: sample.SHOPPING,
    quick: sample.QUICK,
    subjects: sample.SUBJECTS,
    tasks: sample.TASKS,
    trips: sample.TRIPS,
    sessions: sample.SESSIONS,
    sitter: sample.SITTER,
    weather: sample.WEATHER,
  };
}
