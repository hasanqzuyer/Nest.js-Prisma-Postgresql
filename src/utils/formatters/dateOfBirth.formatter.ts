export const calculateDOB = (minAge?: number, maxAge?: number) => {
  const currentDate = new Date();

  const maxDOB =
    minAge &&
    new Date(currentDate.setFullYear(currentDate.getFullYear() - minAge));
  const minDOB =
    maxAge &&
    new Date(currentDate.setFullYear(currentDate.getFullYear() - maxAge));

  return { minDOB, maxDOB };
};
