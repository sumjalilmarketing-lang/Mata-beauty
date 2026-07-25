export function calculateAverageRating(ratings: readonly number[]) {
  if (!ratings.length) return 0;
  if (ratings.some((rating) => !Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error("Chaque note doit être un entier compris entre 1 et 5.");
  }
  const average = ratings.reduce((total, rating) => total + rating, 0) / ratings.length;
  return Math.round(average * 10) / 10;
}
