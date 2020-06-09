export function getConcurrentImportsNumber(): number {
  let importsNumber = parseInt(process.env.CONCURRENT_IMPORTS || '15');
  if (importsNumber > 50) {
    // never more than 50!
    importsNumber = 50;
  }
  return importsNumber;
}
