// Scroll positions at which each section becomes current: normally when its
// top reaches the activation line. Sections at the end of a document may never
// reach the line, and short ones would flash past, so counting back from the
// bottom of the page every section gets at least `minGap` of scrolling.
export function sectionActivationPoints(
  tops: readonly number[],
  line: number,
  maxScroll: number,
  minGap: number,
): number[] {
  const points: number[] = [];
  let next = Infinity;
  for (let index = tops.length - 1; index >= 0; index -= 1) {
    const natural = Math.min(Math.max(0, (tops[index] ?? 0) - line), maxScroll);
    const point = Math.max(0, Math.min(natural, next - minGap));
    points.unshift(point);
    next = point;
  }
  return points;
}

// The current section is the last one whose activation point is reached.
export function activeSectionIndex(
  points: readonly number[],
  scrollY: number,
): number {
  let active = 0;
  points.forEach((point, index) => {
    if (point <= scrollY + 1) active = index;
  });
  return active;
}
