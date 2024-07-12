export const getChange = (after?: number, before?: number) => {
  if (
    after === null ||
    after === undefined ||
    before === null ||
    after === undefined
  )
    return 'N/A';

  // ! sa 0 na 1 na 100%, sve ostalo > ili < 100%, tj. 0 -> 2 (200%)
  if (before === 0 && after === 0) return 0;
  // OLD: if (before !== 0 && after !== 0) return 100 * (after / before - 1);

  // OLD: return after > before ? 100 : -100;

  if (before === 0 && after !== 0) return after; // TODO review if this is ok (seems not)
  if (before !== 0 && after === 0) return -before; // TODO review if this is ok (seems not)

  return 100 * (after / before - 1);
};
